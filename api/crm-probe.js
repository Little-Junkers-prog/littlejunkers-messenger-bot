// api/crm-probe.js
// TEMPORARY — GET to see exact crm.lead field names and test lead creation.
// GET https://littlejunkers-messenger-bot.vercel.app/api/crm-probe

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const uid = await xmlrpcAuth();

    // Step 1: Get all custom (x_) fields on crm.lead
    const allFields = await odooCall(uid, "crm.lead", "fields_get",
      [],
      { attributes: ["string", "type", "required"] }
    );

    // Filter to only custom studio fields (x_ prefix) — include selection values
    const customFields = Object.entries(allFields)
      .filter(([key]) => key.startsWith("x_"))
      .map(([key, meta]) => ({
        field: key,
        label: meta.string,
        type: meta.type,
        selection: meta.selection || null,
      }));

    // Step 2: Get sales team IDs
    const teams = await odooCall(uid, "crm.team", "search_read",
      [[]],
      { fields: ["id", "name"], limit: 10 }
    );

    // Step 3: Get CRM stage IDs
    const stages = await odooCall(uid, "crm.stage", "search_read",
      [[]],
      { fields: ["id", "name", "sequence"], limit: 20 }
    );

    // Step 4: Try creating a minimal test lead
    let testLeadId = null;
    let createError = null;
    try {
      testLeadId = await odooCall(uid, "crm.lead", "create", [{
        name: "TEST LEAD — delete me",
        contact_name: "Test User",
        email_from: "test@test.com",
        type: "lead",
      }]);
      // Clean it up immediately
      if (testLeadId) {
        await odooCall(uid, "crm.lead", "unlink", [[testLeadId]]);
      }
    } catch (e) {
      createError = e.message;
    }

    return res.status(200).json({
      uid,
      customFields,
      teams,
      stages,
      testLeadCreate: testLeadId ? "success — deleted" : `failed: ${createError}`,
    });

  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
