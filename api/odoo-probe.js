// api/odoo-probe.js
// TEMPORARY — delete after field names confirmed.
// Fixes "unhashable type: list" by encoding fields array correctly.
// GET https://littlejunkers-messenger-bot.vercel.app/api/odoo-probe

function xmlrpcEscape(v) {
  return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
}

function xmlrpcValue(value) {
  if (value === null || value === undefined || value === false) return "<value><boolean>0</boolean></value>";
  if (value === true) return "<value><boolean>1</boolean></value>";
  if (typeof value === "number" && Number.isInteger(value)) return `<value><int>${value}</int></value>`;
  if (typeof value === "number") return `<value><double>${value}</double></value>`;
  if (typeof value === "string") return `<value><string>${xmlrpcEscape(value)}</string></value>`;
  if (Array.isArray(value)) return `<value><array><data>${value.map(xmlrpcValue).join("")}</data></array></value>`;
  if (typeof value === "object") return `<value><struct>${Object.entries(value).map(([k,v])=>`<member><name>${xmlrpcEscape(k)}</name>${xmlrpcValue(v)}</member>`).join("")}</struct></value>`;
  return `<value><string>${xmlrpcEscape(String(value))}</string></value>`;
}

function decodeXml(text) {
  return String(text||"").replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&quot;",'"').replaceAll("&apos;","'").replaceAll("&amp;","&");
}

async function xmlrpc(url, method, params) {
  const body = `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${params.map(p=>`<param>${xmlrpcValue(p)}</param>`).join("")}</params></methodCall>`;
  const r = await fetch(url, { method:"POST", headers:{"Content-Type":"text/xml"}, body });
  return await r.text();
}

function extractInt(xml) {
  const m = xml.match(/<(?:int|i4)>(-?\d+)<\/(?:int|i4)>/);
  return m ? parseInt(m[1],10) : null;
}

function extractFault(xml) {
  const m = xml.match(/<faultString>[\s\S]*?<string>([\s\S]*?)<\/string>/i);
  return m ? decodeXml(m[1]).split("\n")[0] : null;
}

// Parse the raw XML into a readable structure for inspection
function rawSnippet(xml, chars=2000) {
  return xml.slice(0, chars);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;

  try {
    // 1. Auth
    const authXml = await xmlrpc(`${ODOO_URL}/xmlrpc/2/common`, "authenticate",
      [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);
    const uid = extractInt(authXml);
    if (!uid) throw new Error("Auth failed — uid not returned");

    // Helper: execute_kw with positional args only (no kwargs struct with lists)
    // This avoids the "unhashable type: list" bug in Odoo's XML-RPC parser
    // Pattern: [db, uid, key, model, method, [domain], {fields:[], limit:N}]
    // The kwargs dict must only contain simple scalar values or be omitted.
    // Solution: pass fields as part of a "options" dict encoded carefully.
    const execRaw = async (model, method, args, options={}) => {
      return xmlrpc(`${ODOO_URL}/xmlrpc/2/object`, "execute_kw", [
        ODOO_DB, uid, ODOO_API_KEY,
        model, method,
        args,
        options
      ]);
    };

    // 2. Test: simple search (no fields list) to confirm search_read works
    const simpleSearchXml = await execRaw(
      "sale.order.line", "search",
      [[["product_id.product_tmpl_id","=",60],["is_rental","=",true]]],
      { limit: 5 }
    );

    const simpleFault = extractFault(simpleSearchXml);

    // 3. fields_get with no filter — just get names and types, no list values in kwargs
    const lineFieldsXml = await execRaw(
      "sale.order.line", "fields_get",
      [false],
      { attributes: ["string","type"] }
    );
    const lineFieldsFault = extractFault(lineFieldsXml);

    // 4. Try read on specific IDs from search result
    // First extract IDs from simple search
    const idMatches = [...simpleSearchXml.matchAll(/<(?:int|i4)>(\d+)<\/(?:int|i4)>/g)];
    const ids = idMatches.map(m => parseInt(m[1],10)).filter(n => n > 0).slice(0,3);

    let readXml = null;
    let readFault = null;
    if (ids.length > 0 && !simpleFault) {
      // Use 'read' with explicit IDs — avoids domain list in kwargs
      readXml = await execRaw(
        "sale.order.line", "read",
        [ids],
        { fields: ["id","order_id","product_id","is_rental","rental_start_date","rental_return_date","start_date","return_date","pickup_date"] }
      );
      readFault = extractFault(readXml);
    }

    return res.status(200).json({
      uid,
      auth_success: true,
      step2_simple_search: {
        fault: simpleFault,
        ids_found: ids,
        raw: rawSnippet(simpleSearchXml, 500),
      },
      step3_fields_get: {
        fault: lineFieldsFault,
        raw: rawSnippet(lineFieldsXml, 3000),
      },
      step4_read_records: readXml ? {
        fault: readFault,
        raw: rawSnippet(readXml, 3000),
      } : { skipped: "no IDs found from search" },
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
