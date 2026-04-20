// api/stripe-webhook.js
import Stripe from "stripe";
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function xmlrpcAuth() {
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;

  const body =
    `<?xml version="1.0"?><methodCall><methodName>authenticate</methodName><params>` +
    `<param><value><string>${ODOO_DB}</string></value></param>` +
    `<param><value><string>${ODOO_USER}</string></value></param>` +
    `<param><value><string>${ODOO_API_KEY}</string></value></param>` +
    `<param><value><struct/></value></param>` +
    `</params></methodCall>`;

  const r = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
  });

  const xml = await r.text();
  const m = xml.match(/<(?:int|i4)>(-?\d+)<\/(?:int|i4)>/);
  const uid = m ? parseInt(m[1], 10) : null;

  if (!uid) {
    throw new Error("XML-RPC auth failed");
  }

  return uid;
}

async function odooCall(uid, model, method, args, kwargs = {}) {
  const { ODOO_URL, ODOO_DB, ODOO_API_KEY } = process.env;

  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      id: Date.now(),
      params: {
        service: "object",
        method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs],
      },
    }),
  });

  const json = await r.json();

  if (json.error) {
    throw new Error(json.error.data?.message || JSON.stringify(json.error));
  }

  return json.result;
}

async function getLeadPaymentStatus(uid, leadId) {
  const res = await odooCall(uid, "crm.lead", "read", [[parseInt(leadId, 10)]], {
    fields: ["x_studio_payment_status"],
  });

  return res?.[0]?.x_studio_payment_status;
}

async function markLeadPaid(uid, leadId, stripeSessionId) {
  await odooCall(uid, "crm.lead", "write", [[parseInt(leadId, 10)], {
    x_studio_payment_status: "Paid",
    x_studio_stripe_payment_intent: stripeSessionId,
  }]);
}

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseOptionalDate(value) {
  const raw = asString(value);
  if (!raw) return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function parseOptionalDateOnly(value) {
  const raw = asString(value);
  if (!raw) return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString().slice(0, 10);
}

function normalizeSizeCode(value) {
  const raw = asString(value).toUpperCase();

  if (!raw) return null;

  const map = {
    "11YD": "11YD",
    "16YD": "16YD",
    "21YD": "21YD",
    "11 YARD": "11YD",
    "16 YARD": "16YD",
    "21 YARD": "21YD",
  };

  return map[raw] || null;
}

function mergeMetadata(existingMetadata, patch) {
  return {
    ...(existingMetadata || {}),
    ...patch,
  };
}

async function findExistingBookingBySessionId(supabase, stripeSessionId) {
  const { data, error } = await supabase
    .from("rental_bookings")
    .select("*")
    .eq("stripe_checkout_session_id", stripeSessionId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function findActiveHoldForCheckout(supabase, { holdId, odooLeadId, stripeSessionId }) {
  if (holdId) {
    const { data, error } = await supabase
      .from("booking_holds")
      .select("*")
      .eq("id", holdId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  if (stripeSessionId) {
    const { data, error } = await supabase
      .from("booking_holds")
      .select("*")
      .eq("stripe_checkout_session_id", stripeSessionId)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) return data;
  }

  if (Number.isFinite(odooLeadId)) {
    const { data, error } = await supabase
      .from("booking_holds")
      .select("*")
      .eq("odoo_lead_id", odooLeadId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data || null;
  }

  return null;
}

async function insertBookingFromHold(supabase, { hold, session, odooLeadId }) {
  const customerName =
    asString(session.metadata?.customer_name) ||
    hold.customer_name ||
    null;

  const customerEmail =
    session.customer_details?.email ||
    hold.customer_email ||
    null;

  const customerPhone =
    session.customer_details?.phone ||
    null;

  const sizeCode =
    hold.size_code ||
    normalizeSizeCode(session.metadata?.dumpster_size) ||
    null;

  if (!sizeCode) {
    throw new Error("Unable to determine booking size_code from hold/session");
  }

  const scheduledStartAt =
    hold.requested_start_at ||
    parseOptionalDate(session.metadata?.requested_start_at) ||
    parseOptionalDate(session.metadata?.selected_window_start);

  const scheduledEndAt =
    hold.requested_end_at ||
    parseOptionalDate(session.metadata?.requested_end_at) ||
    parseOptionalDate(session.metadata?.selected_window_end);

  if (!scheduledStartAt || !scheduledEndAt) {
    throw new Error("Missing scheduled booking window for Supabase booking creation");
  }

  const deliveryDate =
    hold.delivery_date ||
    parseOptionalDateOnly(session.metadata?.delivery_date) ||
    scheduledStartAt.slice(0, 10);

  const expectedReturnDate =
    parseOptionalDateOnly(session.metadata?.expected_return_date) ||
    scheduledEndAt.slice(0, 10);

  const rentalOption =
    hold.rental_option ||
    asString(session.metadata?.rental_option) ||
    null;

  const metadataPatch = {
    source: "stripe_webhook",
    stripePaymentStatus: session.payment_status || null,
    stripeCustomerId: session.customer || null,
    stripePaymentIntentId: session.payment_intent || null,
    stripeSessionId: session.id,
    amountTotal: session.amount_total ?? null,
    currency: session.currency || null,
  };

  const insertPayload = {
    size_code: sizeCode,
    booking_hold_id: hold.id,
    status: "paid_pending_review",
    scheduled_start_at: scheduledStartAt,
    scheduled_end_at: scheduledEndAt,
    delivery_date: deliveryDate,
    expected_return_date: expectedReturnDate,
    rental_option: rentalOption,
    stripe_checkout_session_id: session.id,
    odoo_lead_id: Number.isFinite(odooLeadId) ? odooLeadId : null,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    metadata: mergeMetadata(hold.metadata, metadataPatch),
  };

  const { data, error } = await supabase
    .from("rental_bookings")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

async function markHoldConverted(supabase, holdId, stripeSessionId) {
  const { data, error } = await supabase
    .from("booking_holds")
    .update({
      status: "converted",
      stripe_checkout_session_id: stripeSessionId,
      metadata: {
        convertedBy: "stripe_webhook",
        convertedAt: new Date().toISOString(),
        stripeSessionId,
      },
    })
    .eq("id", holdId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  assertServerOnly();

  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const supabase = getSupabaseAdmin();

  const leadIdRaw = asString(session.metadata?.odoo_lead_id);
  const holdId = asString(session.metadata?.booking_hold_id || session.metadata?.hold_id);
  const odooLeadId = leadIdRaw ? Number(leadIdRaw) : null;

  try {
    const existingBooking = await findExistingBookingBySessionId(supabase, session.id);

    if (!existingBooking) {
      const hold = await findActiveHoldForCheckout(supabase, {
        holdId,
        odooLeadId,
        stripeSessionId: session.id,
      });

      if (!hold) {
        console.error("[stripe-webhook] No active booking_holds row found", {
          stripeSessionId: session.id,
          odooLeadId,
          holdId,
        });
      } else {
        await insertBookingFromHold(supabase, {
          hold,
          session,
          odooLeadId,
        });

        await markHoldConverted(supabase, hold.id, session.id);
      }
    }

    if (Number.isFinite(odooLeadId)) {
      try {
        const uid = await xmlrpcAuth();
        const currentStatus = await getLeadPaymentStatus(uid, odooLeadId);

        if (currentStatus !== "Paid") {
          await markLeadPaid(uid, odooLeadId, session.id);
        }
      } catch (err) {
        console.error("[stripe-webhook] Odoo update failed", err.message);
      }
    }
  } catch (err) {
    console.error("[stripe-webhook] processing failed", err);
  }

  return res.status(200).json({ received: true });
}
