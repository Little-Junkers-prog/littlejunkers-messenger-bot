// api/odoo-probe.js
// TEMPORARY — delete after field names confirmed.
// Auth is confirmed working. This version queries actual rental data.
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

// Parse XML-RPC array of structs into JS objects
function parseXmlRpcResponse(xml) {
  const fault = xml.match(/<faultString>[\s\S]*?<string>([\s\S]*?)<\/string>/i);
  if (fault) throw new Error(decodeXml(fault[1]));

  // Extract all member key/value pairs at any depth
  const results = [];
  // Split on array items - each <value><struct> is one record
  const structRe = /<value>\s*<struct>([\s\S]*?)<\/struct>\s*<\/value>/g;
  let sm;
  while ((sm = structRe.exec(xml)) !== null) {
    const obj = {};
    const memberRe = /<member>\s*<name>([\s\S]*?)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g;
    let mm;
    while ((mm = memberRe.exec(sm[1])) !== null) {
      const key = decodeXml(mm[1].trim());
      const inner = mm[2].trim();
      // Parse the value
      const intM = inner.match(/^<(?:int|i4)>(-?\d+)<\/(?:int|i4)>$/);
      if (intM) { obj[key] = parseInt(intM[1],10); continue; }
      const boolM = inner.match(/^<boolean>([01])<\/boolean>$/);
      if (boolM) { obj[key] = boolM[1]==="1"; continue; }
      const strM = inner.match(/^<string>([\s\S]*)<\/string>$/);
      if (strM) { obj[key] = decodeXml(strM[1]); continue; }
      // Nested array (like Many2one [id, name])
      const arrM = inner.match(/^<array><data>([\s\S]*)<\/data><\/array>$/);
      if (arrM) {
        const vals = [];
        const vRe = /<value>([\s\S]*?)<\/value>/g;
        let vm;
        while ((vm = vRe.exec(arrM[1])) !== null) {
          const vi = vm[1].trim();
          const viInt = vi.match(/^<(?:int|i4)>(-?\d+)<\/(?:int|i4)>$/);
          if (viInt) { vals.push(parseInt(viInt[1],10)); continue; }
          const viStr = vi.match(/^<string>([\s\S]*)<\/string>$/);
          if (viStr) { vals.push(decodeXml(viStr[1])); continue; }
          vals.push(vi);
        }
        obj[key] = vals;
        continue;
      }
      obj[key] = decodeXml(inner.replace(/<[^>]+>/g,"").trim());
    }
    if (Object.keys(obj).length > 0) results.push(obj);
  }
  return results;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;

  try {
    // 1. Auth
    const authXml = await xmlrpc(`${ODOO_URL}/xmlrpc/2/common`, "authenticate",
      [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);
    const uid = extractInt(authXml);
    if (!uid) throw new Error("Auth failed");

    const exec = (model, method, args, kwargs={}) =>
      xmlrpc(`${ODOO_URL}/xmlrpc/2/object`, "execute_kw",
        [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs]);

    // 2. Get date-related field names on sale.order.line
    const lineFieldsXml = await exec("sale.order.line", "fields_get", [[]],
      { attributes: ["string","type"] });

    // 3. Get date-related field names on sale.order
    const orderFieldsXml = await exec("sale.order", "fields_get", [[]],
      { attributes: ["string","type"] });

    // 4. Fetch sample rental lines for 11-Yard product (tmpl id 60)
    const linesXml = await exec("sale.order.line", "search_read",
      [[["product_id.product_tmpl_id","=",60],["is_rental","=",true]]],
      {
        fields: ["id","order_id","product_id","is_rental",
                 "rental_start_date","rental_return_date",
                 "start_date","return_date","pickup_date",
                 "qty_delivered","product_uom_qty"],
        limit: 5,
        context: {}
      }
    );

    // 5. Fetch sample active rental orders
    const ordersXml = await exec("sale.order", "search_read",
      [[["is_rental_order","=",true],["rental_status","in",["pickup","pickedup"]]]],
      {
        fields: ["id","name","rental_status",
                 "rental_start_date","rental_return_date",
                 "start_date","return_date"],
        limit: 3,
        context: {}
      }
    );

    // Parse results
    const lineFields = parseXmlRpcResponse(lineFieldsXml);
    const orderFields = parseXmlRpcResponse(orderFieldsXml);
    const lines = parseXmlRpcResponse(linesXml);
    const orders = parseXmlRpcResponse(ordersXml);

    // Filter field lists to just date/rental relevant ones
    const relevantLineFields = lineFields.filter(f =>
      f.id && (String(f.id).includes("rental")||String(f.id).includes("return")||
               String(f.id).includes("date")||String(f.id).includes("pickup")||
               String(f.id).includes("start"))
    );
    const relevantOrderFields = orderFields.filter(f =>
      f.id && (String(f.id).includes("rental")||String(f.id).includes("return")||
               String(f.id).includes("pickup")||String(f.id).includes("start"))
    );

    return res.status(200).json({
      uid,
      auth_success: true,
      note: "DELETE this file after confirming field names",
      relevant_line_fields:  relevantLineFields,
      relevant_order_fields: relevantOrderFields,
      sample_lines:  lines,
      sample_orders: orders,
      // Raw XML for manual inspection if parse is incomplete
      raw_lines_xml:  linesXml.slice(0, 3000),
      raw_orders_xml: ordersXml.slice(0, 2000),
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
