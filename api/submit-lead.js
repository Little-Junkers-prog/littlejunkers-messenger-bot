// api/submit-lead.js
// Dual-write: Supabase leads table (primary, blocking) + Odoo CRM (secondary, non-blocking).
// Supabase is the source of truth. Odoo failure does not fail the request.
// Returns both supabaseLeadId and leadId (Odoo) to the frontend.

import smsModule from "../lib/sms";
import { getSupabaseAdmin } from "../lib/supabaseAdmin";

const { sendSms } = smsModule;

function xe(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xv(val) {
  if (val === null || val === undefined || val === false) {
    return "<value><boolean>0</boolean></value>";
  }
  if (val === true) {
    return "<value><boolean>1</boolean></value>";
  }
  if (typeof val === "number" && Number.isInteger(val)) {
    return `<value><int>${val}</int></value>`;
  }
  if (typeof val === "number") {
    return `<value><double>${val}</double></value>`;
  }
  if (typeof val === "string") {
    return `<value><string>${xe(val)}</string></value>`;
  }
  if (Array.isArray(val)) {
    return `<value><array><data>${val.map(xv).join("")}</data></array></value>`;
  }
  if (typeof val === "object") {
    return `<value><struct>${Object.entries(val)
      .map(([k, v]) => `<member><name>${xe(k)}</name>${xv(v)}</member>`)
      .join("")}</struct></value>`;
  }
  return `<value><string>${xe(String(val))}</string></value>`;
}

async function xmlrpcAuth() {
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;

  const body =
    `<?xml version="1.0"?>` +
    `<methodCall>` +
    `<methodName>authenticate</methodName>` +
    `<params>` +
    `<param>${xv(ODOO_DB)}</param>` +
    `<param>${xv(ODOO_USER)}</param>` +
    `<param>${xv(ODOO_API_KEY)}</param>` +
    `<param>${xv({})}</param>` +
    `</params>` +
    `</methodCall>`;

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

  if (!r.ok) {
    throw new Error(`Odoo /jsonrpc HTTP ${r.status}`);
  }

  const json = await r.json();

  if (json.error) {
    throw new Error(json.error.data?.message || JSON.stringify(json.error));
  }

  return json.result;
}

// Confirmed CRM routing
const ODOO_TEAM_ID = 2;   // Website
const ODOO_STAGE_ID = 1;  // New
const BOOKING_LINK = "https://book.littlejunkersllc.com/rent-a-dumpster";
const OPT_IN_BODY = "Little Junkers: We will use this number to send your dumpster quote, booking link, and service updates. Msg & data rates may apply. Reply STOP to opt out.";

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
    const s = v.trim().toLowerCase();
    return ["true", "1", "yes", "y", "on"].includes(s);
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

function mapSelection(label, mapObj) {
  const s = asString(label);
  if (!s) return false;
  return mapObj[s] || false;
}

function formatMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return "";
  return `$${n.toFixed(0)}`;
}

function getRentalDisplayLabel(key) {
  const map = {
    "Base Rental": "2-Day Basic",
    "Early Bird": "2-Day Budget",
    "Weekend Warrior": "4-Day",
    "Full Reset": "7-Day",
    "2-Day Rental": "2-Day Rental",
    "4-Day Rental": "4-Day Rental",
    "7-Day Rental": "7-Day Rental",
  };
  return map[key] || key || "rental";
}

async function sendExitQuoteSms({ phone, contactName, dumpsterSize, rentalType, quotedPrice, deliveryFeeNum, areaLabel, postalCode }) {
  if (!phone) return;

  const total = Number(quotedPrice || 0) + Number(deliveryFeeNum || 0);
  const totalText = formatMoney(total);
  const rentalLabel = getRentalDisplayLabel(rentalType);
  const greeting = contactName ? `${contactName}, ` : "";
  const locationText = areaLabel || postalCode ? ` for ${areaLabel || `ZIP ${postalCode}`}` : "";
  const quoteDetails = dumpsterSize
    ? `your ${dumpsterSize} ${rentalLabel}${totalText ? ` quote of ${totalText}` : ""}${locationText}`
    : `your dumpster quote${totalText ? ` of ${totalText}` : ""}${locationText}`;

  const quoteBody = `Little Junkers: ${greeting}here is ${quoteDetails}. You can finish booking here: ${BOOKING_LINK}`;

  await sendSms({ to: phone, body: OPT_IN_BODY });
  await sendSms({ to: phone, body: quoteBody });
}

function toOdooDatetime(val) {
  const s = asString(val);
  if (!s) return false;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return s;
  }

  const d = new Date(s.includes("T") ? s : s + "T12:00:00");
  if (Number.isNaN(d.getTime())) {
    return false;
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function buildNowPlusMinutes(minutes) {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

async function findCountryId(uid, countryInput = "United States") {
  const name = asString(countryInput) || "United States";

  const rows = await odooCall(
    uid,
    "res.country",
    "search_read",
    [[
      "|",
      ["name", "=", name],
      ["code", "=", "US"]
    ]],
    { fields: ["id", "name", "code"], limit: 1 }
  );

  return Array.isArray(rows) && rows.length ? rows[0].id : false;
}

async function findStateId(uid, stateInput = "Georgia", countryId = false) {
  const state = asString(stateInput) || "Georgia";

  let domain;
  if (countryId) {
    domain = [
      ["country_id", "=", countryId],
      "|",
      ["name", "=", state],
      ["name", "=", "Georgia (US)"]
    ];
  } else {
    domain = [
      "|",
      ["name", "=", state],
      ["name", "=", "Georgia (US)"]
    ];
  }

  const rows = await odooCall(
    uid,
    "res.country.state",
    "search_read",
    [domain],
    { fields: ["id", "name", "code", "country_id"], limit: 1 }
  );

  return Array.isArray(rows) && rows.length ? rows[0].id : false;
}

async function findLeadSourceIdByName(uid, sourceName) {
  const name = asString(sourceName);
  if (!name) return false;

  const rows = await odooCall(
    uid,
    "utm.source",
    "search_read",
    [[["name", "=", name]]],
    { fields: ["id", "name"], limit: 1 }
  );

  return Array.isArray(rows) && rows.length ? rows[0].id : false;
}

// -----------------------------------------------------------------------------
// Frontend label -> Odoo stored value mappings
// -----------------------------------------------------------------------------

const MAP_CUSTOMER_TYPE = {
  "New Customer": "Residential",
  "Residential": "Residential",
  "Returning": "Returning",
  "Returning Customer": "Returning",
  "Contractor": "Contractor",
  "Contractor / Roofer": "Contractor",
  "Roofer": "Contractor",
};

const MAP_PROJECT_TYPE = {
  "Cleanout": "Cleanout",
  "Clean Out": "Cleanout",
  "Moving": "Moving",
  "Moving / decluttering": "Moving",
  "Decluttering": "Moving",
  "Other": "Other",
  "Renovation": "Renovation",
  "Roofing": "Roofing",
  "Yard": "Yard",
  "Yard Cleanup": "Yard",
};

const MAP_DUMPSTER_SIZE = {
  "11 Yard": "11 yard",
  "16 Yard": "16 yard",
  "21 Yard": "21 yard",
  "11 yard": "11 yard",
  "16 yard": "16 yard",
  "21 yard": "21 yard",
};

const MAP_RENTAL_TYPE = {
  "2-Day Rental": "2-Day Rental",
  "4-Day Rental": "4-Day Rental",
  "7-Day Rental": "7-Day Rental",
};

const MAP_PAYMENT_STATUS = {
  "Expired": "Expired",
  "Paid": "Paid",
  "Pending": "Pending",
};

// ─── Supabase helpers ────────────────────────────────────────────────────────

/**
 * Parse "11 Yard" / "16 Yard" / "21 Yard" -> integer 11 / 16 / 21.
 * Returns null if unparseable — column is nullable.
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
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s.includes("T") ? s : s + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Upsert a lead row in Supabase.
 * - If supabaseLeadId is provided: UPDATE that row and return it.
 * - Otherwise: INSERT and return the new row.
 * Returns the row id (uuid string) or throws.
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

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    supabaseLeadId, // Supabase leads.id — present on updates, absent on first write
    leadId,         // Odoo crm.lead id — present on updates
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
  const mobile = asString(contact?.mobile);

  // Exit capture leads only require a phone number.
  // Partial (abandoned cart) pushes might only have a name and phone.
  // Full checkout pushes require name, email, and phone.
  const isExitCapture = asString(funnelSource) === "exit_capture";

  if (isExitCapture) {
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required for exit capture leads." });
    }
  } else {
    // For normal funnel, we just require *at least* a phone OR an email so we have contact info for the soft push.
    if (!phone && !email) {
      return res.status(400).json({ error: "Phone or email is required to save progress." });
    }
  }

  try {
    const dumpsterSize = pickFirstNonEmpty(selectedSize, recommendedSize);
    const rentalType = asString(rentalOption);

    const rentalStart = toOdooDatetime(
      selectedWindow?.start ||
      selectedWindow?.startIso ||
      selectedWindow?.startDateTime ||
      selectedWindow?.start_at ||
      req.body?.rentalStart
    );

    const rentalEnd = toOdooDatetime(
      selectedWindow?.end ||
      selectedWindow?.endIso ||
      selectedWindow?.endDateTime ||
      selectedWindow?.end_at ||
      req.body?.rentalEnd
    );

    const holdExpiresAt =
      toOdooDatetime(req.body?.holdExpiresAt) || buildNowPlusMinutes(15);

    const quotedPrice = asNumber(rentalPrice, 0);
    const deliveryFeeNum = asNumber(deliveryFee, 0);

    const referralText = pickFirstNonEmpty(contact?.source, referredBy);

    // Native address fields
    const street     = asString(deliveryAddress?.street  || req.body?.street);
    const street2    = asString(deliveryAddress?.street2 || req.body?.street2);
    const city       = pickFirstNonEmpty(deliveryAddress?.city, req.body?.city, areaLabel);
    const postalCode = pickFirstNonEmpty(deliveryAddress?.zip, req.body?.zip, zip);
    const stateName  = pickFirstNonEmpty(deliveryAddress?.state, "Georgia", "Georgia (US)");

    const smsOptInBool = asBoolean(smsOptIn);
    const smsOptInTimestamp = smsOptInBool
      ? (toOdooDatetime(smsOptInDate) || buildNowPlusMinutes(0))
      : false;

    // ── 1. SUPABASE WRITE (primary, blocking) ────────────────────────────────
    const fullStreet = [street, street2].filter(Boolean).join(" ").trim() || null;

    const supabaseLeadData = {
      name:          contactName || null,
      phone:         phone || null,
      email:         email || null,
      street:        fullStreet,
      city:          city || null,
      zip:           postalCode || null,
      zone:          asString(zone) || null,
      service_area:  asString(areaLabel) || null,
      size_yards:    parseSizeYards(dumpsterSize),
      rental_type:   rentalType || null,
      rental_start:  toDateOnly(
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
      quoted_price:   quotedPrice > 0 ? quotedPrice : null,
      delivery_fee:   deliveryFeeNum > 0 ? deliveryFeeNum : null,
      customer_type:  asString(customerType) || null,
      is_contractor:  asString(customerType) === "contractor",
      lead_source:    pickFirstNonEmpty(leadSourceName, "Website"),
      funnel_source:  pickFirstNonEmpty(funnelSource, "website_checkout"),
      referred_by:    referralText || null,
      funnel_status:  isExitCapture ? "abandoned" : "active",
      sms_opt_in:     smsOptInBool,
      sms_opt_in_date: smsOptInBool && smsOptInDate ? new Date(smsOptInDate).toISOString() : null,
      hold_expires_at: req.body?.holdExpiresAt
        ? new Date(req.body.holdExpiresAt).toISOString()
        : null,
    };

    const resultingSupabaseLeadId = await upsertSupabaseLead(
      supabaseLeadId || null,
      supabaseLeadData
    );

    // ── 2. ODOO WRITE (secondary, non-blocking) ───────────────────────────────
    let resultingLeadId = leadId || null;
    let odooAction = null;

    // Fire Odoo in background — failure does not fail the response
    const odooPromise = (async () => {
      try {
        const uid = await xmlrpcAuth();

        const countryName = pickFirstNonEmpty(deliveryAddress?.country, "United States");
        const countryId = await findCountryId(uid, countryName);
        const stateId = await findStateId(uid, stateName, countryId);
        const sourceId =
          (await findLeadSourceIdByName(uid, pickFirstNonEmpty(leadSourceName, "Website"))) || false;

        const leadName = isExitCapture
          ? `Exit Lead: ${contactName || phone} — ${dumpsterSize || "No Size Selected"}`
          : `Funnel Lead: ${contactName || phone} — ${dumpsterSize || "Unknown Size"}`;

        const exitCaptureWarning = isExitCapture
          ? [
              "⚠️  EXIT CAPTURE LEAD — INCOMPLETE BOOKING",
              "This lead was captured when the customer abandoned the funnel.",
              "No delivery date, pricing, or booking hold exists for this lead.",
              "Do NOT treat as a confirmed booking. Follow up by phone/text before taking action.",
              "---",
            ]
          : [];

        const debugNotes = [
          ...exitCaptureWarning,
          `Funnel source: ${pickFirstNonEmpty(funnelSource, "website_checkout")}`,
          `ZIP: ${postalCode || "—"}`,
          `Area: ${asString(areaLabel) || "—"}`,
          `Zone: ${asString(zone) || "—"}`,
          `Delivery address: ${[street, street2, city, stateName, postalCode].filter(Boolean).join(", ") || "—"}`,
          `Customer type: ${asString(customerType) || "—"}`,
          `Project: ${pickFirstNonEmpty(project, otherText) || "—"}`,
          `Size: ${dumpsterSize || "—"}`,
          `Rental type: ${rentalType || "—"}`,
          `Rental start: ${rentalStart || "—"}`,
          `Rental end: ${rentalEnd || "—"}`,
          `Quoted price: ${quotedPrice}`,
          `Delivery fee: ${deliveryFeeNum}`,
          `SMS opt-in: ${smsOptInBool ? "Yes" : "No"}`,
          `Supabase lead ID: ${resultingSupabaseLeadId}`,
          referralText ? `Referred by: ${referralText}` : null,
        ].filter(Boolean).join("\n");

        const values = {
          name: leadName,
          team_id: ODOO_TEAM_ID,
          stage_id: ODOO_STAGE_ID,
          source_id: sourceId || false,
          contact_name: contactName || false,
          email_from: email || false,
          phone: phone || false,
          mobile: mobile || false,
          street: street || false,
          street2: street2 || false,
          city: city || false,
          zip: postalCode || false,
          state_id: stateId || false,
          country_id: countryId || false,
          expected_revenue: quotedPrice,
          description: debugNotes,
          priority: isExitCapture ? "1" : "0",
          x_studio_selection_field_222_1jkvln416:
            mapSelection(customerType, MAP_CUSTOMER_TYPE),
          x_studio_selection_field_es_1jkvlssq9:
            mapSelection(project, MAP_PROJECT_TYPE),
          x_studio_dumpster_size:
            mapSelection(dumpsterSize, MAP_DUMPSTER_SIZE),
          x_studio_rental_type:
            mapSelection(rentalType, MAP_RENTAL_TYPE),
          x_studio_rental_start: rentalStart || false,
          x_studio_rental_end: rentalEnd || false,
          x_studio_payment_status:
            mapSelection(
              isExitCapture ? "Incomplete" : pickFirstNonEmpty(req.body?.paymentStatus, "Pending"),
              MAP_PAYMENT_STATUS
            ),
          x_studio_hold_expires_at: holdExpiresAt || false,
          x_studio_quoted_price: quotedPrice,
          x_studio_delivery_fee: deliveryFeeNum,
          x_studio_zone: asString(zone) || false,
          x_studio_service_area: asString(areaLabel) || false,
          x_studio_funnel_source: pickFirstNonEmpty(funnelSource, "website_checkout"),
          x_studio_sms_opt_in: smsOptInBool,
          x_studio_sms_opt_in_date: smsOptInTimestamp || false,
          referred: referralText || false,
        };

        const parsedLeadId = parseInt(leadId, 10);
        if (parsedLeadId && !isNaN(parsedLeadId)) {
          await odooCall(uid, "crm.lead", "write", [[parsedLeadId], values]);
          resultingLeadId = parsedLeadId;
          odooAction = "updated";
        } else {
          values.type = "lead";
          resultingLeadId = await odooCall(uid, "crm.lead", "create", [values]);
          odooAction = "created";
        }

        // Write Odoo lead ID back to Supabase lead row
        if (resultingLeadId && resultingSupabaseLeadId) {
          const supabase = getSupabaseAdmin();
          await supabase
            .from("leads")
            .update({ odoo_lead_id: String(resultingLeadId) })
            .eq("id", resultingSupabaseLeadId);
        }
      } catch (odooErr) {
        console.error("[submit-lead] Odoo write failed (non-blocking):", odooErr.message?.slice(0, 300));
      }
    })();

    // ── 3. SMS (exit capture only, non-blocking) ──────────────────────────────
    let smsSent = false;
    if (isExitCapture && smsOptInBool && phone) {
      const quotedPriceNum = quotedPrice;
      odooPromise.then(() => {}).catch(() => {}); // ensure it doesn't block
      try {
        await sendExitQuoteSms({
          phone,
          contactName,
          dumpsterSize,
          rentalType,
          quotedPrice: quotedPriceNum,
          deliveryFeeNum,
          areaLabel,
          postalCode,
        });
        smsSent = true;
      } catch (smsError) {
        console.error("[submit-lead] exit quote SMS failed", smsError.message);
      }
    }

    // Wait for Odoo to settle before responding so leadId is available for holdPayload
    await odooPromise;

    return res.status(200).json({
      success: true,
      supabaseLeadId: resultingSupabaseLeadId,
      leadId: resultingLeadId,
      action: supabaseLeadId ? "updated" : "created",
      smsSent,
    });
  } catch (err) {
    // Only Supabase failures reach here — Odoo failures are caught internally
    console.error("[submit-lead] FAILED:", err.message?.slice(0, 300));

    return res.status(500).json({
      success: false,
      error: "Lead submission failed",
      detail: err.message?.slice(0, 300) || "Unknown error",
    });
  }
}
