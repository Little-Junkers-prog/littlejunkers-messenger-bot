// api/odoo-probe.js
// TEMPORARY — verbose error diagnostic version.
// GET https://littlejunkers-messenger-bot.vercel.app/api/odoo-probe

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");

  const ODOO_URL   = process.env.ODOO_URL;
  const ODOO_DB    = process.env.ODOO_DB;
  const ODOO_USER  = process.env.ODOO_USER;
  const ODOO_KEY   = process.env.ODOO_API_KEY;

  // Show key preview so we can confirm which key is loaded
  const keyPreview = ODOO_KEY
    ? `${ODOO_KEY.slice(0,6)}...${ODOO_KEY.slice(-4)} (len=${ODOO_KEY.length})`
    : "MISSING";

  const env = {
    odoo_url:  ODOO_URL  || "MISSING",
    odoo_db:   ODOO_DB   || "MISSING",
    odoo_user: ODOO_USER || "MISSING",
    key_preview: keyPreview,
  };

  try {
    // Step 1: XML-RPC authenticate
    const authBody = `<?xml version="1.0"?><methodCall><methodName>authenticate</methodName><params><param>${xv(ODOO_DB)}</param><param>${xv(ODOO_USER)}</param><param>${xv(ODOO_KEY)}</param><param>${xv({})}</param></params></methodCall>`;

    const authRes = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body: authBody,
    });

    const authXml  = await authRes.text();
    const uidMatch = authXml.match(/<(?:int|i4)>(-?\d+)<\/(?:int|i4)>/);
    const uid      = uidMatch ? parseInt(uidMatch[1], 10) : null;
    const authFault = authXml.match(/<faultString>[\s\S]*?<string>([\s\S]*?)<\/string>/i);

    if (!uid || uid <= 0) {
      return res.status(200).json({
        step: "auth_failed",
        uid,
        fault: authFault ? authFault[1].split("\n")[0] : null,
        raw_auth_xml: authXml,
        env,
      });
    }

    // Step 2: JSON-RPC test — simple search on sale.order.line
    const creds = Buffer.from(`${ODOO_USER}:${ODOO_KEY}`).toString("base64");

    const jsonRes = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${creds}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0", method: "call", id: 1,
        params: {
          model: "sale.order.line",
          method: "search_read",
          args: [[["is_rental","=",true]]],
          kwargs: {
            context: { uid },
            fields: ["id","start_date","return_date"],
            limit: 3,
          },
        },
      }),
    });

    const jsonData = await jsonRes.json();

    return res.status(200).json({
      step: "complete",
      uid,
      auth_success: true,
      json_rpc_error: jsonData.error || null,
      sample_lines: jsonData.result || [],
      env,
    });

  } catch(err) {
    return res.status(500).json({
      step: "exception",
      error: err.message,
      stack: err.stack?.split("\n").slice(0,5).join(" | "),
      env,
    });
  }
}
