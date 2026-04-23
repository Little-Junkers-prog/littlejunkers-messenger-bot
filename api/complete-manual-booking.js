import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
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

function mergeMetadata(existingMetadata, patch) {
  return {
    ...(existingMetadata || {}),
    ...(patch || {}),
  };
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

async function markLeadManualPaid(uid, leadId, paymentMethod, reference) {
  const descriptor = asString(reference) || `manual-${paymentMethod}`;
  await odooCall(uid, "crm.lead", "write", [[parseInt(leadId, 10)], {
    x_studio_payment_status: "Paid",
    x_studio_stripe_payment_intent: descriptor,
  }]);
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  try {
    assertServerOnly();

    const body = req.body || {};
    const holdId = asString(body.holdId || body.bookingHoldId);
    const paymentMethod = asString(body.paymentMethod).toLowerCase();
    const manualPaymentReference = asString(body.manualPaymentReference || body.reference);
    const contact = body.contact || {};
    const deliveryAddress = body.deliveryAddress || {};

    if (!holdId) {
      return res.status(400).json({ success: false, error: "Missing holdId." });
    }

    if (!["cash", "zelle"].includes(paymentMethod)) {
      return res.status(400).json({ success: false, error: "paymentMethod must be cash or zelle." });
    }

    const customerName = asString(contact.name || body.customerName);
    const customerEmail = asString(contact.email || body.customerEmail);
    const customerPhone = asString(contact.phone || body.customerPhone);
    const street1 = asString(deliveryAddress.street1);
    const city = asString(deliveryAddress.city);
    const state = asString(deliveryAddress.state || "GA");
    const zip = asString(body.zip || deliveryAddress.zip);

    if (!customerName || !customerPhone || !street1 || !city || !zip) {
      return res.status(400).json({
        success: false,
        error: "Missing required customer details. Name, phone, street, city, and ZIP are required.",
      });
    }

    const supabase = getSupabaseAdmin();

    const { data: existingBooking, error: existingBookingError } = await supabase
      .from("rental_bookings")
      .select("*")
      .eq("booking_hold_id", holdId)
      .limit(1)
      .maybeSingle();

    if (existingBookingError) {
      throw existingBookingError;
    }

    if (existingBooking) {
      return res.status(200).json({
        success: true,
        message: "Booking already existed for this hold.",
        booking: existingBooking,
        existing: true,
      });
    }

    const { data: hold, error: holdError } = await supabase
      .from("booking_holds")
      .select("*")
      .eq("id", holdId)
      .maybeSingle();

    if (holdError) {
      throw holdError;
    }

    if (!hold) {
      return res.status(404).json({ success: false, error: "Booking hold not found." });
    }

    const metadataPatch = {
      source: "csr_manual_payment",
      funnelSource: asString(body.funnelSource || "csr_quick_book"),
      areaLabel: asString(body.areaLabel),
      zone: asString(body.zone),
      zip,
      deliveryAddress: {
        street1,
        street2: asString(deliveryAddress.street2),
        city,
        state,
        zip,
      },
      customerPhone,
      customerEmail,
      paymentMethod,
      paymentStatus: "paid",
      paymentCollectedBy: asString(body.paymentCollectedBy || "csr_quick_book"),
      manualPaymentReference,
      notes: asString(body.notes),
      paidAt: new Date().toISOString(),
    };

    const mergedHoldMetadata = mergeMetadata(hold.metadata, metadataPatch);

    const { data: updatedHold, error: updateHoldError } = await supabase
      .from("booking_holds")
      .update({
        customer_name: customerName,
        customer_email: customerEmail || null,
        metadata: mergedHoldMetadata,
      })
      .eq("id", holdId)
      .select("*")
      .single();

    if (updateHoldError) {
      throw updateHoldError;
    }

    const scheduledStartAt = hold.requested_start_at || parseOptionalDate(body.selectedWindow?.startIso);
    const scheduledEndAt = hold.requested_end_at || parseOptionalDate(body.selectedWindow?.endIso);

    if (!scheduledStartAt || !scheduledEndAt) {
      throw new Error("Missing scheduled booking window for manual booking creation");
    }

    const bookingMetadata = mergeMetadata(updatedHold.metadata, {
      source: "csr_manual_payment",
      paymentMethod,
      paymentStatus: "paid",
      manualPaymentReference,
      manualBookingCreatedAt: new Date().toISOString(),
    });

    const insertPayload = {
      size_code: updatedHold.size_code,
      booking_hold_id: updatedHold.id,
      status: "reserved",
      scheduled_start_at: scheduledStartAt,
      scheduled_end_at: scheduledEndAt,
      delivery_date: updatedHold.delivery_date || scheduledStartAt.slice(0, 10),
      expected_return_date: scheduledEndAt.slice(0, 10),
      rental_option: updatedHold.rental_option,
      odoo_lead_id: updatedHold.odoo_lead_id || null,
      customer_name: customerName,
      customer_email: customerEmail || null,
      customer_phone: customerPhone,
      metadata: bookingMetadata,
    };

    const { data: booking, error: insertError } = await supabase
      .from("rental_bookings")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertError) {
      throw insertError;
    }

    const { error: convertError } = await supabase
      .from("booking_holds")
      .update({
        status: "converted",
        metadata: mergeMetadata(bookingMetadata, {
          convertedBy: "csr_manual_payment",
          convertedAt: new Date().toISOString(),
        }),
      })
      .eq("id", updatedHold.id);

    if (convertError) {
      throw convertError;
    }

    if (Number.isFinite(updatedHold.odoo_lead_id)) {
      try {
        const uid = await xmlrpcAuth();
        const currentStatus = await getLeadPaymentStatus(uid, updatedHold.odoo_lead_id);
        if (currentStatus !== "Paid") {
          await markLeadManualPaid(uid, updatedHold.odoo_lead_id, paymentMethod, manualPaymentReference);
        }
      } catch (odooError) {
        console.error("[complete-manual-booking] Odoo update failed", odooError.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Manual paid booking created successfully.",
      booking,
    });
  } catch (error) {
    console.error("[complete-manual-booking] FAILED", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create manual paid booking",
    });
  }
}
