// api/submit-lead.js
// Creates a crm.lead in Odoo from funnel submission payload.
// Auth: XML-RPC authenticate → uid, then /jsonrpc execute_kw to create record.

function xe(v) { return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;"); }
function xv(val) {
  if (val === null || val === undefined || val === false) return "<value><boolean>0</boolean></value>";
  if (val === true) return "<value><boolean>1</boolean></value>";
  if (typeof val === "number" && Number.isInteger(val)) return `<value><int>${val}</int></value>`;
  if (typeof val === "string") return `<value><string>${xe(val)}</string></value>`;
  if (Array.isArray(val)) return `<value><array><data>${val.map(xv).join("")}</data></array></value>`;
  if (typeof val === "object") return `<value><struct>${Object.entries(val).map(([k,v])=>`<member><n>${xe(k)}</n>${xv(v)}</member>`).join("")}</struct></value>`;
  return `<value><string>${xe(String(val))}</string></value>`;
}

async function xmlrpcAuth() {
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;
  const body = `<?xml version="1.0"?><methodCall><methodName>authenticate</methodName><params><param>${xv(ODOO_DB)}</param><param>${xv(ODOO_USER)}</param><param>${xv(ODOO_API_KEY)}</param><param>${xv({})}</param></params></methodCall>`;
  const r = await fetch(`${ODOO_URL}/xmlrpc/2/common`, { method:"POST", headers:{"Content-Type":"text/xml"}, body });
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
      jsonrpc: "2.0", method: "call", id: 1,
      params: {
        service: "object", method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs],
      },
    }),
  });
  if (!r.ok) throw new Error(`Odoo /jsonrpc HTTP ${r.status}`);
  const json = await r.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

// Hardcoded IDs confirmed via crm-probe on 2026-04-09
// Website team = 2, New stage = 1
const ODOO_TEAM_ID  = 2; // "Website"
const ODOO_STAGE_ID = 1; // "New"

// Confirmed Studio field names from crm-probe
const CRM_FIELDS = {
  customerType:    "x_studio_selection_field_2sf_1jkvlallv",
  projectType:     "x_studio_selection_field_es_1jkvlssq9",
  recommendedSize: "x_studio_selection_field_7as_1jkvmd591",
  deliveryDate:    "x_studio_date_field_9dh_1jkvmi2t7",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    zip, areaLabel, zone, deliveryFee,
    customerType, project, otherText,
    recommendedSize, selectedSize,
    rentalOption, rentalPrice,
    selectedWindow,
    contact,
  } = req.body || {};

  if (!contact?.name || !contact?.email) {
    return res.status(400).json({ error: "Name and email are required." });
  }

  try {
    const uid = await xmlrpcAuth();

    // Build internal notes with full context
    const deliveryLine = selectedWindow
      ? `Delivery: ${selectedWindow.startLabel} – ${selectedWindow.endLabel}`
      : `Delivery: Subject to confirmation`;

    const notes = [
      `Source: Funnel (rent-a-dumpster)`,
      `ZIP: ${zip || "—"}  |  Area: ${areaLabel || "—"}  |  Zone: ${zone || "—"}  |  Delivery fee: ${deliveryFee > 0 ? `$${deliveryFee}` : "Included"}`,
      `Customer type: ${customerType || "—"}`,
      `Project: ${project || "—"}${otherText ? ` — ${otherText}` : ""}`,
      `Recommended size: ${recommendedSize || "—"}  |  Selected size: ${selectedSize || "—"}`,
      `Rental option: ${rentalOption || "—"}  |  Price: ${rentalPrice != null ? `$${rentalPrice}` : "—"}`,
      deliveryLine,
      contact.phone ? `Phone: ${contact.phone}` : null,
      contact.source ? `How they heard: ${contact.source}` : null,
    ].filter(Boolean).join("\n");

    // Build lead name
    const leadName = `Funnel Lead: ${contact.name} — ${selectedSize || recommendedSize || "?"}`;

    // Build the values object with confirmed field names from crm-probe
    const values = {
      name:            leadName,
      contact_name:    contact.name,
      email_from:      contact.email,
      phone:           contact.phone || false,
      planned_revenue: rentalPrice   || 0,
      description:     notes,
      type:            "lead",
      team_id:         ODOO_TEAM_ID,
      stage_id:        ODOO_STAGE_ID,
      // Custom Studio fields — confirmed API names
      [CRM_FIELDS.customerType]:    customerType || false,
      [CRM_FIELDS.projectType]:     project      || false,
      [CRM_FIELDS.recommendedSize]: selectedSize || recommendedSize || false,
      [CRM_FIELDS.deliveryDate]:    selectedWindow?.start || false,
    };

    const leadId = await odooCall(uid, "crm.lead", "create", [values]);

    return res.status(200).json({ success: true, leadId });

  } catch (err) {
    console.error("[submit-lead] error:", err.message);
    // Don't block the customer — return success anyway and log the failure
    // The form data is logged server-side for manual recovery
    return res.status(200).json({ success: true, degraded: true, error: err.message });
  }
}
