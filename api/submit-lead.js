// api/submit-lead.js
// Supabase-only lead write. Odoo has been retired.
// Supabase leads table is the single source of truth.
// Returns supabaseLeadId to the frontend for use in subsequent API calls.

import smsModule from "../lib/sms";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";

const { sendSms } = smsModule;

const BOOKING_LINK = "https://book.littlejunkersllc.com/rent-a-dumpster";
const OPT_IN_BODY =
  "Little Junkers: We will use this number to send your dumpster quote, booking link, and service updates. Msg & data rates may apply. Reply STOP to opt out.";

function asString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function asNumber(v, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    return ["true", "1", "yes", "y", "on"].includes(v.trim().toLowerCase());
  }
  return false;
}

function pickFirstNonEmpty(...vals) {
  for (const v of vals) {
    const s = asString(v);
    if (s) return s;
  }
  return "";
}

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toFixed(0)}`;
}

function getRentalDisplayLabel(key) {
  const map = {
    "2day_montue": "2-Day Mon/Tue",
    "2day_standard": "2-Day Standard",
    "4day": "4-Day",
    "7day": "7-Day",
  };
  return map[key] || key || "rental";
}

/**
 * Parse "11 Yard" / "16 Yard" / "21 Yard" → integer 11 / 16 / 21.
 * Returns null if unparseable.
 */
function parseSizeYards(sizeString) {
  if (!sizeString) return null;
  const m = String(sizeString).match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : null;
  return [11, 16, 21].includes(n) ? n : null;
}

/**
 * Parse an ISO or date-only string to YYYY-MM-DD for Supabase date columns.
 * Returns null if unparseable.
 */
function toDateOnly(val) {
  const s = asString(val);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s.includes("T") ? s : s + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Upsert a lead row in Supabase.
 * - If supabaseLeadId is provided: UPDATE that row and return its id.
 * - Otherwise: INSERT and return the new row id.
 */
async function upsertSupabaseLead(supabaseLeadId, leadData) {
  const supabase = getSupabaseAdmin();

  if (supabaseLeadId) {
    const { data, error } = await supabase
      .from("leads")
      .update({ ...leadData, updated_at: new Date().toISOString() })
      .eq("id", supabaseLeadId)
      .select("id")
      .single();

    if (error) throw new Error(`Supabase lead update failed: ${error.message}`);
    return data.id;
  }

  const { data, error } = await supabase
    .from("leads")
    .insert(leadData)
    .select("id")
    .single();

  if (error) throw new Error(`Supabase lead insert failed: ${error.message}`);
  return data.id;
}

async function sendExitQuoteSms({
  phone,
  contactName,
  dumpsterSize,
  rentalType,
  quotedPrice,
  deliveryFeeNum,
  areaLabel,
  postalCode,
}) {
  if (!phone) return;

  const total = Number(quotedPrice || 0) + Number(deliveryFeeNum || 0);
  const totalText = formatMoney(total);
  const rentalLabel = getRentalDisplayLabel(rentalType);
  const greeting = contactName ? `${contactName}, ` : "";
  const locationText =
    areaLabel || postalCode ? ` for ${areaLabel || `ZIP ${postalCode}`}` : "";
  const quoteDetails = dumpsterSize
    ? `your ${dumpsterSize} ${rentalLabel}${totalText ? ` quote of ${totalText}` : ""}${locationText}`
    : `your dumpster quote${totalText ? ` of ${totalText}` : ""}${locationText}`;

  const quoteBody = `Little Junkers: ${greeting}here is ${quoteDetails}. You can finish booking here: ${BOOKING_LINK}`;

  await sendSms({ to: phone, body: OPT_IN_BODY });
  await sendSms({ to: phone, body: quoteBody });
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    supabaseLeadId,
    zip,
    areaLabel,
    zone,
    deliveryFee,
    customerType,
    project,
    otherText,
    recommendedSize,
    selectedSize,
    rentalOption,
    rentalPrice,
    selectedWindow,
    funnelSource,
    referredBy,
    leadSourceName,
    deliveryAddress,
    smsOptIn,
    smsOptInDate,
    contact,
  } = req.body || {};

  const contactName = asString(contact?.name);
  const email = asString(contact?.email);
  const phone = asString(contact?.phone);

  const isExitCapture = asString(funnelSource) === "exit_capture";

  if (isExitCapture) {
    if (!phone) {
      return res
        .status(400)
        .json({ error: "Phone number is required for exit capture leads." });
    }
  } else {
    if (!phone && !email) {
      return res
        .status(400)
        .json({ error: "Phone or email is required to save progress." });
    }
  }

  try {
    const dumpsterSize = pickFirstNonEmpty(selectedSize, recommendedSize);
    const rentalType = asString(rentalOption);
    const quotedPrice = asNumber(rentalPrice, 0);
    const deliveryFeeNum = asNumber(deliveryFee, 0);
    const referralText = pickFirstNonEmpty(contact?.source, referredBy);
    const smsOptInBool = asBoolean(smsOptIn);

    const street = asString(
      deliveryAddress?.street || req.body?.street
    );
    const street2 = asString(
      deliveryAddress?.street2 || req.body?.street2
    );
    const city = pickFirstNonEmpty(
      deliveryAddress?.city,
      req.body?.city,
      areaLabel
    );
    const postalCode = pickFirstNonEmpty(
      deliveryAddress?.zip,
      req.body?.zip,
      zip
    );
    const fullStreet = [street, street2].filter(Boolean).join(" ").trim() || null;

    const supabaseLeadData = {
      name: contactName || null,
      phone: phone || null,
      email: email || null,
      street: fullStreet,
      city: city || null,
      zip: postalCode || null,
      zone: asString(zone) || null,
      service_area: asString(areaLabel) || null,
      size_yards: parseSizeYards(dumpsterSize),
      rental_type: rentalType || null,
      rental_start: toDateOnly(
        selectedWindow?.start ||
          selectedWindow?.startIso ||
          selectedWindow?.startDateTime ||
          selectedWindow?.start_at ||
          req.body?.rentalStart
      ),
      rental_end: toDateOnly(
        selectedWindow?.end ||
          selectedWindow?.endIso ||
          selectedWindow?.endDateTime ||
          selectedWindow?.end_at ||
          req.body?.rentalEnd
      ),
      quoted_price: quotedPrice > 0 ? quotedPrice : null,
      delivery_fee: deliveryFeeNum > 0 ? deliveryFeeNum : null,
      customer_type: asString(customerType) || null,
      is_contractor: asString(customerType).toLowerCase().includes("contractor"),
      lead_source: pickFirstNonEmpty(leadSourceName, "Website"),
      funnel_source: pickFirstNonEmpty(funnelSource, "website_checkout"),
      referred_by: referralText || null,
      funnel_status: isExitCapture ? "abandoned" : "active",
      sms_opt_in: smsOptInBool,
      sms_opt_in_date:
        smsOptInBool && smsOptInDate
          ? new Date(smsOptInDate).toISOString()
          : null,
      hold_expires_at: req.body?.holdExpiresAt
        ? new Date(req.body.holdExpiresAt).toISOString()
        : null,
    };

    const resultingSupabaseLeadId = await upsertSupabaseLead(
      supabaseLeadId || null,
      supabaseLeadData
    );

    // SMS — exit capture only, non-blocking
    let smsSent = false;
    if (isExitCapture && smsOptInBool && phone) {
      try {
        await sendExitQuoteSms({
          phone,
          contactName,
          dumpsterSize,
          rentalType,
          quotedPrice,
          deliveryFeeNum,
          areaLabel,
          postalCode,
        });
        smsSent = true;
      } catch (smsError) {
        console.error("[submit-lead] exit quote SMS failed:", smsError.message);
      }
    }

    return res.status(200).json({
      success: true,
      supabaseLeadId: resultingSupabaseLeadId,
      // leadId kept for backwards compatibility with any frontend references
      leadId: null,
      action: supabaseLeadId ? "updated" : "created",
      smsSent,
    });
  } catch (err) {
    console.error("[submit-lead] FAILED:", err.message?.slice(0, 300));
    return res.status(500).json({
      success: false,
      error: "Lead submission failed",
      detail: err.message?.slice(0, 300) || "Unknown error",
    });
  }
}
