// api/odoo-probe.js
// TEMPORARY diagnostic — returns raw Odoo authenticate response
// GET https://littlejunkers-messenger-bot.vercel.app/api/odoo-probe

function xmlrpcEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xmlrpcValue(value) {
  if (value === null || value === undefined || value === false)
    return "<value><boolean>0</boolean></value>";
  if (value === true)
    return "<value><boolean>1</boolean></value>";
  if (typeof value === "number" && Number.isInteger(value))
    return `<value><int>${value}</int></value>`;
  if (typeof value === "string")
    return `<value><string>${xmlrpcEscape(value)}</string></value>`;
  if (Array.isArray(value))
    return `<value><array><data>${value.map(xmlrpcValue).join("")}</data></array></value>`;
  if (typeof value === "object")
    return `<value><struct>${Object.entries(value)
      .map(([k, v]) => `<member><name>${xmlrpcEscape(k)}</name>${xmlrpcValue(v)}</member>`)
      .join("")}</struct></value>`;
  return `<value><string>${xmlrpcEscape(String(value))}</string></value>`;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const ODOO_URL  = process.env.ODOO_URL;
  const ODOO_DB   = process.env.ODOO_DB;
  const ODOO_USER = process.env.ODOO_USER;
  const ODOO_KEY  = process.env.ODOO_API_KEY;

  // Show first/last 4 chars of key so we can verify it's not truncated
  const keyPreview = ODOO_KEY
    ? `${ODOO_KEY.slice(0, 4)}...${ODOO_KEY.slice(-4)} (len=${ODOO_KEY.length})`
    : "MISSING";

  try {
    const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>authenticate</methodName>
  <params>
    <param>${xmlrpcValue(ODOO_DB)}</param>
    <param>${xmlrpcValue(ODOO_USER)}</param>
    <param>${xmlrpcValue(ODOO_KEY)}</param>
    <param>${xmlrpcValue({})}</param>
  </params>
</methodCall>`;

    const authRes = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
      method: "POST",
      headers: { "Content-Type": "text/xml" },
      body,
    });

    const rawXml  = await authRes.text();
    const httpStatus = authRes.status;

    // Try to extract UID from response
    const intMatch = rawXml.match(/<(?:int|i4)>(-?\d+)<\/(?:int|i4)>/);
    const uid = intMatch ? parseInt(intMatch[1], 10) : null;

    // Check for fault
    const faultMatch = rawXml.match(/<faultString>[\s\S]*?<string>([\s\S]*?)<\/string>/i);
    const fault = faultMatch ? faultMatch[1] : null;

    return res.status(200).json({
      http_status:  httpStatus,
      uid:          uid,
      fault:        fault,
      auth_success: uid !== null && uid > 0,
      env: {
        odoo_url:  ODOO_URL  || "MISSING",
        odoo_db:   ODOO_DB   || "MISSING",
        odoo_user: ODOO_USER || "MISSING",
        key_preview: keyPreview,
      },
      // Full raw XML so we can see exactly what Odoo returned
      raw_xml: rawXml,
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message,
      env: {
        odoo_url:  ODOO_URL  || "MISSING",
        odoo_db:   ODOO_DB   || "MISSING",
        odoo_user: ODOO_USER || "MISSING",
        key_preview: keyPreview,
      },
    });
  }
}
