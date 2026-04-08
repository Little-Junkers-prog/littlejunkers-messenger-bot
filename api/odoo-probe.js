// api/odoo-probe.js
// TEMPORARY — final field discovery pass.
// Reads rental order lines with NO field filter (returns all fields),
// then reads the parent sale.order for date fields.
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
  if (typeof value === "object") return `<value><struct>${Object.entries(value).map(([k,v])=>`<member><n>${xmlrpcEscape(k)}</n>${xmlrpcValue(v)}</member>`).join("")}</struct></value>`;
  return `<value><string>${xmlrpcEscape(String(value))}</string></value>`;
}
function decodeXml(t) {
  return String(t||"").replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&quot;",'"').replaceAll("&apos;","'").replaceAll("&amp;","&");
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
  return m ? decodeXml(m[1]).split("\n").slice(0,3).join(" | ") : null;
}
// Extract all field name keys from a fields_get XML response
function extractFieldNames(xml) {
  const names = [];
  const re = /<name>([\w_]+)<\/name>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    if (!names.includes(m[1])) names.push(m[1]);
  }
  return names;
}
// Pull out just date/rental/pickup/return/start field names
function filterRelevantFields(names) {
  return names.filter(n =>
    n.includes("rental") || n.includes("return") ||
    n.includes("date") || n.includes("pickup") ||
    n.includes("start") || n.includes("period")
  );
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;

  try {
    // Auth
    const authXml = await xmlrpc(`${ODOO_URL}/xmlrpc/2/common`, "authenticate",
      [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);
    const uid = extractInt(authXml);
    if (!uid) throw new Error("Auth failed");

    const exec = (model, method, args, kwargs={}) =>
      xmlrpc(`${ODOO_URL}/xmlrpc/2/object`, "execute_kw",
        [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs]);

    // 1. Get ALL field names on sale.order.line via fields_get
    const lineFieldsXml = await exec("sale.order.line", "fields_get", [false], {});
    const lineFieldFault = extractFault(lineFieldsXml);
    const allLineFields = extractFieldNames(lineFieldsXml);
    const relevantLineFields = filterRelevantFields(allLineFields);

    // 2. Get ALL field names on sale.order via fields_get
    const orderFieldsXml = await exec("sale.order", "fields_get", [false], {});
    const orderFieldFault = extractFault(orderFieldsXml);
    const allOrderFields = extractFieldNames(orderFieldsXml);
    const relevantOrderFields = filterRelevantFields(allOrderFields);

    // 3. Read line IDs 1433, 1423, 1421 with ONLY safe scalar fields first
    const safeLineFields = ["id", "order_id", "product_id", "is_rental",
      "product_uom_qty", "qty_delivered", "state"];
    const safeReadXml = await exec("sale.order.line", "read",
      [[1433, 1423, 1421]], { fields: safeLineFields });
    const safeReadFault = extractFault(safeReadXml);

    // 4. From the safe read, extract order IDs to then read the parent sale.order
    // Pull order IDs from the XML — they appear as arrays [id, name]
    const orderIdMatches = [...safeReadXml.matchAll(/<int>(\d+)<\/int>/g)];
    const orderIds = [...new Set(orderIdMatches.map(m => parseInt(m[1],10))
      .filter(n => n > 100 && n < 10000))].slice(0,3);

    // 5. Read parent sale.order records with date fields from relevantOrderFields
    // Use only the fields we know exist from fields_get
    const dateFieldsToRead = relevantOrderFields
      .filter(f => !f.includes("message") && !f.includes("activity"))
      .slice(0, 20);

    let orderReadXml = null;
    let orderReadFault = null;
    if (orderIds.length > 0 && dateFieldsToRead.length > 0) {
      orderReadXml = await exec("sale.order", "read",
        [orderIds], { fields: ["id", "name", "rental_status", ...dateFieldsToRead] });
      orderReadFault = extractFault(orderReadXml);
    }

    return res.status(200).json({
      uid,
      // The key outputs we need:
      relevant_line_fields:  relevantLineFields,
      relevant_order_fields: relevantOrderFields,
      safe_line_read: {
        fault: safeReadFault,
        order_ids_found: orderIds,
        raw: safeReadXml.slice(0, 1500),
      },
      order_date_fields_read: orderReadXml ? {
        fault: orderReadFault,
        fields_requested: dateFieldsToRead,
        raw: orderReadXml.slice(0, 3000),
      } : { skipped: "no order IDs or date fields found" },
      // For manual inspection
      all_line_fields_count: allLineFields.length,
      all_order_fields_count: allOrderFields.length,
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
