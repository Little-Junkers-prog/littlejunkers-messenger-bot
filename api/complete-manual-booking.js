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

function dateOnly(value) {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw.slice(0, 10) || null;
  return date.toISOString().slice(0, 10);
}

function sizeCodeToYards(value) {
  const raw = asString(value).toUpperCase();
  const map = { "11YD": 11, "16YD": 16, "21YD": 21 };
  if (map[raw]) return map[raw];
  const match = raw.match(/\d+/);
  const yards = match ? Number(match[0]) : null;
  return [11, 16, 21].includes(yards) ? yards : null;
}

function inferZone(value) {
  const raw = asString(value).toLowerCase();
  if (raw === "zone2" || raw === "2" || raw === "b") return "zone2";
  if (raw === "zone3" || raw === "3" || raw === "c") return "zone3";
  return "local";
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
    const street2 = asString(deliveryAddress.street2);
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

    const { data: existingHold, error: existingHoldError } = await supabase
      .from("booking_holds")
      .select("id, status")
      .eq("id", holdId)
      .maybeSingle();

    if (existingHoldError) throw existingHoldError;

    if (existingHold?.status === "converted") {
      return res.status(200).json({
        success: true,
        message: "Booking already processed for this hold.",
        existing: true,
      });
    }

    const { data: hold, error: holdError } = await supabase
      .from("booking_holds")
      .select("*")
      .eq("id", holdId)
      .maybeSingle();

    if (holdError) throw holdError;

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
        street2,
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

    if (updateHoldError) throw updateHoldError;

    const scheduledStartAt =
      updatedHold.requested_start_at ||
      updatedHold.start_at ||
      updatedHold.delivery_date ||
      parseOptionalDate(body.selectedWindow?.startIso);
    const scheduledEndAt =
      updatedHold.requested_end_at ||
      updatedHold.end_at ||
      parseOptionalDate(body.selectedWindow?.endIso);

    if (!scheduledStartAt || !scheduledEndAt) {
      throw new Error("Missing scheduled booking window for manual booking creation");
    }

    const dropoffDate = dateOnly(updatedHold.delivery_date || scheduledStartAt);
    const scheduledReturn = dateOnly(scheduledEndAt);
    const rentalDays = dropoffDate && scheduledReturn
      ? Math.max(1, Math.round((new Date(scheduledReturn) - new Date(dropoffDate)) / (1000 * 60 * 60 * 24)))
      : null;
    const sizeYards = sizeCodeToYards(updatedHold.size_code || updatedHold.size_yards);
    const flattenedAddress = [street1, street2, city, state, zip].filter(Boolean).join(", ");
    const bookingMetadata = mergeMetadata(updatedHold.metadata, {
      source: "csr_manual_payment",
      paymentMethod,
      paymentStatus: "paid",
      manualPaymentReference,
      manualBookingCreatedAt: new Date().toISOString(),
    });

    const rentalPayload = {
      customer_id: updatedHold.customer_id || null,
      status: "confirmed",
      size_yards: sizeYards,
      delivery_address: flattenedAddress,
      zone: inferZone(body.zone || updatedHold.zone || bookingMetadata.zone),
      dropoff_date: dropoffDate,
      scheduled_return: scheduledReturn,
      ...(rentalDays ? { rental_days: rentalDays } : {}),
      amount_paid: Number(body.amountPaid || body.amount || updatedHold.amount_paid || 0) || null,
      payment_source: "manual_link",
      notes: asString(updatedHold.rental_option || body.rentalOption || body.notes) || null,
    };

    const { data: rental, error: insertError } = await supabase
      .from("rentals")
      .insert(rentalPayload)
      .select("*")
      .single();

    if (insertError) throw insertError;

    const { error: convertError } = await supabase
      .from("booking_holds")
      .update({
        status: "converted",
        metadata: mergeMetadata(bookingMetadata, {
          convertedBy: "csr_manual_payment",
          convertedAt: new Date().toISOString(),
          convertedRentalId: rental.id,
        }),
      })
      .eq("id", updatedHold.id);

    if (convertError) throw convertError;

    await supabase.from("payments").insert({
      rental_id: rental.id,
      customer_id: rental.customer_id,
      source: paymentMethod,
      amount: rental.amount_paid || 0,
      currency: "usd",
      status: "received",
      payload: {
        booking_hold_id: updatedHold.id,
        manual_payment_reference: manualPaymentReference,
        collected_by: asString(body.paymentCollectedBy || "csr_quick_book"),
      },
    });

    await supabase.from("events").insert({
      event_type: "manual_payment_received",
      source: "csr_quick_book",
      rental_id: rental.id,
      customer_id: rental.customer_id,
      payload: {
        booking_hold_id: updatedHold.id,
        paymentMethod,
        manualPaymentReference,
      },
    });

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
      message: "Manual paid rental created successfully.",
      rental,
    });
  } catch (error) {
    console.error("[complete-manual-booking] FAILED", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create manual paid rental",
    });
  }
}
