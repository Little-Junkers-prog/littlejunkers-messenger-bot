// api/submit-lead.js
// Creates a structured crm.lead in Odoo from funnel submission payload.
// Auth flow:
//   1) XML-RPC authenticate -> uid
//   2) JSON-RPC execute_kw -> create/search_read calls

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

// -----------------------------------------------------------------------------
// Odoo relational address lookups
// We use lookups instead of hardcoding IDs since you have not confirmed the
// numeric IDs yet. Because Little Junkers only serves Georgia / United States,
// we default to those values when not explicitly passed.
// -----------------------------------------------------------------------------

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
// Selection field maps
// If any selection field errors, update only the right-hand side values.
// -----------------------------------------------------------------------------

const MAP_CUSTOMER_TYPE = {
  "New Customer": "New Customer",
  "Returning Customer": "Returning Customer",
  "Contractor": "Contractor",
  "Property Manager": "Property Manager",
};

const MAP_PROJECT_TYPE = {
  "Moving / decluttering": "Moving / decluttering",
  "Renovation": "Renovation",
  "Construction": "Construction",
  "Yard Cleanup": "Yard Cleanup",
  "Roofing": "Roofing",
  "Other": "Other",
};

const MAP_DEBRIS_TYPE = {
  "Household Junk": "Household Junk",
  "Construction Debris": "Construction Debris",
  "Yard Waste": "Yard Waste",
  "Roofing": "Roofing",
  "Concrete / Dirt": "Concrete / Dirt",
  "Mixed Debris": "Mixed Debris",
  "Other": "Other",
};

const MAP_DUMPSTER_SIZE = {
  "11 Yard": "11 Yard",
  "16 Yard": "16 Yard",
  "21 Yard": "21 Yard",
};

const MAP_RENTAL_TYPE = {
  "2-Day Rental": "2-Day Rental",
  "4-Day Rental": "4-Day Rental",
  "7-Day Rental": "7-Day Rental",
};

const MAP_PAYMENT_STATUS = {
  "Pending": "Pending",
  "Paid": "Paid",
  "Expired": "Expired",
};

const MAP_AVAILABILITY_STATUS = {
  "Available": "Available",
  "Limited": "Limited",
  "Unavailable": "Unavailable",
};

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
  return mapObj[s] || s;
}

function toOdooDatetime(val) {
  const s = asString(val);
  if (!s) return false;

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    return s;
  }

  const d = new Date(s);
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
    zip,
    areaLabel,
    zone,
    deliveryFee,

    customerType,
    project,
    otherText,
    debrisType,
    heavyMaterial,

    recommendedSize,
    selectedSize,

    rentalOption,
    rentalPrice,

    selectedWindow,

    availabilityStatus,
    funnelSource,
    referredBy,
    leadSourceName,

    deliveryAddress,
    contact,
  } = req.body || {};

  const contactName = asString(contact?.name);
  const email = asString(contact?.email);
  const phone = asString(contact?.phone);
  const mobile = asString(contact?.mobile);

  if (!contactName || !email) {
    return res.status(400).json({ error: "Name and email are required." });
  }

  try {
    const uid = await xmlrpcAuth();

    // Core rental values
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

    // Lead source / referral
    const sourceId =
      (await findLeadSourceIdByName(uid, pickFirstNonEmpty(leadSourceName, "Website"))) || false;

    const referralText = pickFirstNonEmpty(contact?.source, referredBy);
    const projectText = pickFirstNonEmpty(project, otherText);

    // Native CRM address fields
    // City/ZIP can be prepopulated from earlier funnel logic.
    // State/Country default to Georgia / United States.
    const street = asString(deliveryAddress?.street);
    const street2 = asString(deliveryAddress?.street2);
    const city = pickFirstNonEmpty(deliveryAddress?.city, areaLabel);
    const postalCode = pickFirstNonEmpty(deliveryAddress?.zip, zip);
    const countryName = pickFirstNonEmpty(deliveryAddress?.country, "United States");
    const stateName = pickFirstNonEmpty(
      deliveryAddress?.state,
      "Georgia",
      "Georgia (US)"
    );

    const countryId = await findCountryId(uid, countryName);
    const stateId = await findStateId(uid, stateName, countryId);

    const leadName = `Funnel Lead: ${contactName} — ${dumpsterSize || "Unknown Size"}`;

    // Compact debug note only. Structured fields are the source of truth now.
    const debugNotes = [
      `Funnel source: ${pickFirstNonEmpty(funnelSource, "website_checkout")}`,
      `ZIP: ${postalCode || "—"}`,
      `Area: ${asString(areaLabel) || "—"}`,
      `Zone: ${asString(zone) || "—"}`,
      `Delivery address: ${[street, street2, city, stateName, postalCode].filter(Boolean).join(", ") || "—"}`,
      `Customer type: ${asString(customerType) || "—"}`,
      `Project: ${projectText || "—"}`,
      `Debris: ${asString(debrisType) || "—"}`,
      `Size: ${dumpsterSize || "—"}`,
      `Rental type: ${rentalType || "—"}`,
      `Rental start: ${rentalStart || "—"}`,
      `Rental end: ${rentalEnd || "—"}`,
      `Quoted price: ${quotedPrice}`,
      `Delivery fee: ${deliveryFeeNum}`,
      referralText ? `Referred by: ${referralText}` : null,
    ].filter(Boolean).join("\n");

    const values = {
      // standard CRM routing
      name: leadName,
      type: "lead",
      team_id: ODOO_TEAM_ID,
      stage_id: ODOO_STAGE_ID,
      source_id: sourceId || false,

      // contact identity on lead
      contact_name: contactName,
      email_from: email,
      phone: phone || false,
      mobile: mobile || false,

      // native CRM lead address fields
      street: street || false,
      street2: street2 || false,
      city: city || false,
      zip: postalCode || false,
      state_id: stateId || false,
      country_id: countryId || false,

      // useful native CRM value
      expected_revenue: quotedPrice,

      // compact debug note for troubleshooting
      description: debugNotes,

      // existing Studio context fields
      x_studio_selection_field_222_1jkvln416: mapSelection(customerType, MAP_CUSTOMER_TYPE),
      x_studio_selection_field_es_1jkvlssq9: mapSelection(project, MAP_PROJECT_TYPE),
      x_studio_selection_field_49d_1jkvm0va8: mapSelection(debrisType, MAP_DEBRIS_TYPE),
      x_studio_boolean_field_88o_1jkvmg0ve: asBoolean(heavyMaterial),
      x_studio_selection_field_2sk_1jkvmnm6c: mapSelection(availabilityStatus, MAP_AVAILABILITY_STATUS),

      // new structured funnel fields
      x_studio_dumpster_size: mapSelection(dumpsterSize, MAP_DUMPSTER_SIZE),
      x_studio_rental_type: mapSelection(rentalType, MAP_RENTAL_TYPE),
      x_studio_rental_start: rentalStart || false,
      x_studio_rental_end: rentalEnd || false,
      x_studio_payment_status: mapSelection(
        pickFirstNonEmpty(req.body?.paymentStatus, "Pending"),
        MAP_PAYMENT_STATUS
      ),
      x_studio_hold_expires_at: holdExpiresAt || false,
      x_studio_quoted_price: quotedPrice,
      x_studio_delivery_fee: deliveryFeeNum,
      x_studio_zone: asString(zone) || false,
      x_studio_service_area: asString(areaLabel) || false,
      x_studio_funnel_source: pickFirstNonEmpty(funnelSource, "website_checkout"),

      // native referral helper
      referred: referralText || false,
    };

    const leadId = await odooCall(uid, "crm.lead", "create", [values]);

    return res.status(200).json({
      success: true,
      leadId,
      routed: {
        type: "lead",
        team_id: ODOO_TEAM_ID,
        stage_id: ODOO_STAGE_ID,
        source_id: sourceId || null,
      },
      address: {
        city: city || null,
        zip: postalCode || null,
        state_id: stateId || null,
        country_id: countryId || null,
      },
    });
  } catch (err) {
    console.error("[submit-lead] FAILED");
    console.error("[submit-lead] msg:", err.message?.slice(0, 300));
    console.error("[submit-lead] msg2:", err.message?.slice(300, 600));
    console.error("[submit-lead] stack:", err.stack?.split("\n")[1]);

    return res.status(500).json({
      success: false,
      error: "Lead submission failed",
      detail: err.message?.slice(0, 300) || "Unknown error",
    });
  }
}
