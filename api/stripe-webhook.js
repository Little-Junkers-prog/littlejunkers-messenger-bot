// api/stripe-webhook.js
// Sprint 2A: on checkout.session.completed, upgrades the pending rental row
// to confirmed, creates a payments record, and logs the event.
// Odoo lead update is preserved as a non-blocking side-effect.
import Stripe from "stripe";
import smsModule from "../lib/sms";
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

const { sendSms } = smsModule;

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

// ── Odoo helpers (non-blocking, preserved from original) ─────────────────────

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
  if (!uid) throw new Error("XML-RPC auth failed");
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
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

async function tryMarkOdooLeadPaid(odooLeadId, stripeSessionId) {
  try {
    const uid = await xmlrpcAuth();
    const res = await odooCall(uid, "crm.lead", "read", [[parseInt(odooLeadId, 10)]], {
      fields: ["x_studio_payment_status"],
    });
    if (res?.[0]?.x_studio_payment_status !== "Paid") {
      await odooCall(uid, "crm.lead", "write", [[parseInt(odooLeadId, 10)], {
        x_studio_payment_status: "Paid",
        x_studio_stripe_payment_intent: stripeSessionId,
      }]);
    }
  } catch (err) {
    console.error("[stripe-webhook] Odoo update failed (non-blocking):", err.message);
  }
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const s = asString(value);
    if (s) return s;
  }
  return "";
}

function parseOptionalDateOnly(value) {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeSizeYards(value) {
  const raw = asString(value).toUpperCase();
  const map = { "11YD": 11, "16YD": 16, "21YD": 21, "11 YARD": 11, "16 YARD": 16, "21 YARD": 21 };
  return map[raw] || null;
}

function inferZone(value) {
  const raw = asString(value).toLowerCase();
  if (raw === "zone2" || raw === "2") return "zone2";
  if (raw === "zone3" || raw === "3") return "zone3";
  return "local";
}

function normalizePhone(value) {
  const raw = asString(value).replace(/\D/g, "");
  if (!raw) return null;
  return raw.length === 10 ? `+1${raw}` : raw.startsWith("1") ? `+${raw}` : raw;
}

function formatShortDate(value) {
  const raw = asString(value);
  if (!raw) return "";
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

// ── Core Supabase operations ──────────────────────────────────────────────────

async function findPendingRentalBySessionOrHoldId(supabase, stripeSessionId, holdId) {
  // First: check if already converted (idempotency)
  if (stripeSessionId) {
    const { data } = await supabase
      .from("rentals")
      .select("*")
      .eq("stripe_session_id", stripeSessionId)
      .eq("status", "confirmed")
      .maybeSingle();
    if (data) return { rental: data, alreadyConfirmed: true };
  }

  // Find the pending rental created by create-booking-hold
  if (holdId) {
    const { data } = await supabase
      .from("rentals")
      .select("*")
      .eq("id", holdId)
      .eq("status", "pending")
      .maybeSingle();
    if (data) return { rental: data, alreadyConfirmed: false };
  }

  return { rental: null, alreadyConfirmed: false };
}

async function upsertCustomerFromSession(supabase, session, existingCustomerId) {
  const customerEmail =
    session.customer_details?.email ||
    asString(session.metadata?.customer_email) ||
    null;
  const customerPhone = normalizePhone(
    session.customer_details?.phone ||
    asString(session.metadata?.customer_phone)
  );
  const customerName = asString(session.metadata?.customer_name) || null;

  if (existingCustomerId) {
    // Update with any new data from Stripe
    await supabase
      .from("customers")
      .update({
        ...(customerEmail ? { email: customerEmail } : {}),
        ...(customerPhone ? { phone: customerPhone } : {}),
        ...(customerName ? { name: customerName } : {}),
      })
      .eq("id", existingCustomerId);
    return existingCustomerId;
  }

  // Create new customer from Stripe session data
  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: customerName || "Unknown",
      phone: customerPhone || "0000000000",
      email: customerEmail || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function confirmRental(supabase, rentalId, session, customerId) {
  const meta = session.metadata || {};
  const sizeYards = normalizeSizeYards(meta.dumpster_size);
  const zone = inferZone(meta.zone || "local");
  const deliveryAddress = firstNonEmpty(
    meta.delivery_address,
    meta.area_label,
    "TBD"
  );
  const dropoffDate = parseOptionalDateOnly(meta.delivery_date);
  const scheduledReturn = parseOptionalDateOnly(meta.selected_window_end);
  const amountPaid = session.amount_total ? session.amount_total / 100 : null;

  const updatePayload = {
    status: "confirmed",
    customer_id: customerId,
    stripe_session_id: session.id,
    stripe_payment_id: session.payment_intent || null,
    amount_paid: amountPaid,
    payment_source: "funnel",
    ...(sizeYards ? { size_yards: sizeYards } : {}),
    ...(zone ? { zone } : {}),
    ...(deliveryAddress !== "TBD" ? { delivery_address: deliveryAddress } : {}),
    ...(dropoffDate ? { dropoff_date: dropoffDate } : {}),
    ...(scheduledReturn ? { scheduled_return: scheduledReturn } : {}),
  };

  const { data, error } = await supabase
    .from("rentals")
    .update(updatePayload)
    .eq("id", rentalId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function createPaymentRecord(supabase, rental, session, customerId) {
  const { error } = await supabase.from("payments").insert({
    rental_id: rental.id,
    customer_id: customerId,
    source: "stripe",
    stripe_session_id: session.id,
    stripe_payment_id: session.payment_intent || null,
    amount: session.amount_total ? session.amount_total / 100 : 0,
    currency: session.currency || "usd",
    status: "received",
    payload: {
      stripe_session_id: session.id,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email || null,
    },
  });
  if (error) throw error;
}

async function logEvent(supabase, rentalId, customerId, session) {
  await supabase.from("events").insert({
    event_type: "payment_received",
    source: "funnel",
    rental_id: rentalId,
    customer_id: customerId,
    payload: {
      stripe_session_id: session.id,
      payment_intent: session.payment_intent,
      amount_total: session.amount_total,
      payment_status: session.payment_status,
    },
  });
}

async function sendConfirmationSms(rental, session) {
  const phone = normalizePhone(
    session.customer_details?.phone ||
    asString(session.metadata?.customer_phone)
  );
  if (!phone) return;

  const rentalOption = asString(session.metadata?.rental_option) || "rental";
  const sizeLabel = asString(session.metadata?.dumpster_size) || "dumpster";
  const dropoffText = formatShortDate(rental.dropoff_date || session.metadata?.delivery_date);
  const returnText = formatShortDate(rental.scheduled_return || session.metadata?.selected_window_end);
  const windowText = dropoffText && returnText
    ? `${dropoffText} to ${returnText}`
    : dropoffText || "your scheduled window";

  const body = `Little Junkers: Your dumpster booking is confirmed. We have you scheduled for your ${sizeLabel} ${rentalOption}. Delivery window: ${windowText}. Reply here or call 470-548-4733 with questions.`;

  try {
    await sendSms({ to: phone, body });
  } catch (err) {
    console.error("[stripe-webhook] SMS failed (non-blocking):", err.message);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  assertServerOnly();

  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET_SUPABASE;

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const meta = session.metadata || {};
  const holdId = asString(meta.booking_hold_id || meta.hold_id);
  const odooLeadId = asString(meta.odoo_lead_id);

  const supabase = getSupabaseAdmin();

  try {
    const { rental: pendingRental, alreadyConfirmed } = await findPendingRentalBySessionOrHoldId(
      supabase,
      session.id,
      holdId
    );

    if (alreadyConfirmed) {
      console.log("[stripe-webhook] Already confirmed, skipping:", session.id);
      return res.status(200).json({ received: true });
    }

    if (!pendingRental) {
      console.error("[stripe-webhook] No pending rental found for holdId:", holdId, "session:", session.id);
      // Still return 200 so Stripe doesn't retry — log for manual review
      return res.status(200).json({ received: true, warning: "No pending rental found" });
    }

    // Upsert customer
    const customerId = await upsertCustomerFromSession(
      supabase,
      session,
      pendingRental.customer_id
    );

    // Confirm the rental
    const confirmedRental = await confirmRental(supabase, pendingRental.id, session, customerId);

    // Create payment audit record
    await createPaymentRecord(supabase, confirmedRental, session, customerId);

    // Log event
    await logEvent(supabase, confirmedRental.id, customerId, session);

    // Send SMS confirmation (non-blocking)
    await sendConfirmationSms(confirmedRental, session);

    // Update Odoo lead (non-blocking)
    if (odooLeadId) {
      await tryMarkOdooLeadPaid(odooLeadId, session.id);
    }

    console.log("[stripe-webhook] Rental confirmed:", confirmedRental.id);
  } catch (err) {
    console.error("[stripe-webhook] Processing failed:", err);
    // Return 200 to prevent Stripe retries; alert via logs
  }

  return res.status(200).json({ received: true });
}
