// api/odoo-probe.js
// TEMPORARY — delete after field names are confirmed.
// Uses XML-RPC auth matching the working gojunkers-chat pattern.
// GET https://littlejunkers-messenger-bot.vercel.app/api/odoo-probe

// ─── XML-RPC helpers (copied from working gojunkers-chat) ────────────────────

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
  if (typeof value === "number")
    return `<value><double>${value}</double></value>`;
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

function decodeXmlEntities(text) {
  return String(text || "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

// Parse a scalar XML-RPC response (used for authenticate → UID)
function extractScalar(xml) {
  const fault = xml.match(/<faultString>[\s\S]*?<string>([\s\S]*?)<\/string>/i);
  if (fault) throw new Error(decodeXmlEntities(fault[1]));
  const intMatch = xml.match(/<value>\s*<(?:int|i4)>(-?\d+)<\/(?:int|i4)>\s*<\/value>/i);
  if (intMatch) return parseInt(intMatch[1], 10);
  const boolMatch = xml.match(/<value>\s*<boolean>([01])<\/boolean>\s*<\/value>/i);
  if (boolMatch) return boolMatch[1] === "1";
  return null;
}

// Parse XML-RPC struct into a JS object
function parseStruct(structXml) {
  const obj = {};
  const memberRe = /<member>\s*<name>([\s\S]*?)<\/name>\s*<value>([\s\S]*?)<\/value>\s*<\/member>/g;
  let m;
  while ((m = memberRe.exec(structXml)) !== null) {
    const key = decodeXmlEntities(m[1]);
    obj[key] = parseValueInner(m[2]);
  }
  return obj;
}

// Parse the inner content of a <value> tag
function parseValueInner(inner) {
  inner = inner.trim();
  const intM  = inner.match(/^<(?:int|i4)>(-?\d+)<\/(?:int|i4)>$/);
  if (intM)  return parseInt(intM[1], 10);
  const boolM = inner.match(/^<boolean>([01])<\/boolean>$/);
  if (boolM) return boolM[1] === "1";
  const dblM  = inner.match(/^<double>([\d.eE+-]+)<\/double>$/);
  if (dblM)  return parseFloat(dblM[1]);
  const strM  = inner.match(/^<string>([\s\S]*)<\/string>$/);
  if (strM)  return decodeXmlEntities(strM[1]);
  if (inner.match(/^<struct>/)) {
    return parseStruct(inner);
  }
  if (inner.match(/^<array>/)) {
    const dataM = inner.match(/<data>([\s\S]*)<\/data>/);
    if (!dataM) return [];
    return parseArray(dataM[1]);
  }
  // bare string (no type tag)
  return decodeXmlEntities(inner);
}

// Parse <data> content into array
function parseArray(dataXml) {
  const items = [];
  const valueRe = /<value>([\s\S]*?)<\/value>/g;
  let m;
  while ((m = valueRe.exec(dataXml)) !== null) {
    items.push(parseValueInner(m[1].trim()));
  }
  return items;
}

// Parse a full XML-RPC response that returns an array of structs
function extractArray(xml) {
  const fault = xml.match(/<faultString>[\s\S]*?<string>([\s\S]*?)<\/string>/i);
  if (fault) throw new Error(decodeXmlEntities(fault[1]));
  const dataM = xml.match(/<data>([\s\S]*)<\/data>/);
  if (!dataM) return [];
  return parseArray(dataM[1]);
}

async function xmlrpcCall(url, methodName, params) {
  const body = `<?xml version="1.0"?>
<methodCall>
  <methodName>${methodName}</methodName>
  <params>
    ${params.map((p) => `<param>${xmlrpcValue(p)}</param>`).join("")}
  </params>
</methodCall>`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`XML-RPC HTTP ${res.status}: ${text.slice(0, 300)}`);
  return text; // return raw XML — caller parses based on expected return type
}

// ─── Odoo helpers ─────────────────────────────────────────────────────────────

async function getUid() {
  const xml = await xmlrpcCall(
    `${process.env.ODOO_URL}/xmlrpc/2/common`,
    "authenticate",
    [process.env.ODOO_DB, process.env.ODOO_USER, process.env.ODOO_API_KEY, {}]
  );
  const uid = extractScalar(xml);
  if (!uid) throw new Error("Authentication failed — UID not returned");
  return uid;
}

async function odooExecute(uid, model, method, args, kwargs = {}) {
  const xml = await xmlrpcCall(
    `${process.env.ODOO_URL}/xmlrpc/2/object`,
    "execute_kw",
    [process.env.ODOO_DB, uid, process.env.ODOO_API_KEY, model, method, args, kwargs]
  );
  return { raw: xml };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // Step 1: authenticate
    const uid = await getUid();

    // Step 2: search_read for active rental order lines on 11-Yard (product tmpl 60)
    // We ask for every field name that might hold rental dates
    const { raw: linesXml } = await odooExecute(uid, "sale.order.line", "search_read", [
      [
        ["product_id.product_tmpl_id", "=", 60],
        ["is_rental", "=", true],
      ],
    ], {
      fields: [
        "id", "order_id", "product_id", "is_rental",
        "rental_start_date", "rental_return_date",
        "start_date", "return_date", "pickup_date",
        "qty_delivered", "product_uom_qty",
      ],
      limit: 5,
      context: {},
    });

    // Step 3: get a few active sale.orders with rental fields
    const { raw: ordersXml } = await odooExecute(uid, "sale.order", "search_read", [
      [
        ["is_rental_order", "=", true],
        ["rental_status", "in", ["pickup", "pickedup"]],
      ],
    ], {
      fields: [
        "id", "name", "rental_status",
        "rental_start_date", "rental_return_date",
        "start_date", "return_date",
      ],
      limit: 3,
      context: {},
    });

    // Return raw XML so we can read field names directly
    // Also attempt to parse the arrays
    let parsedLines = [];
    let parsedOrders = [];
    let parseError = null;
    try {
      parsedLines  = extractArray(linesXml);
      parsedOrders = extractArray(ordersXml);
    } catch (e) {
      parseError = e.message;
    }

    return res.status(200).json({
      note:          "DELETE this file after confirming field names",
      uid_confirmed: uid,
      env: {
        odoo_url:  process.env.ODOO_URL   ? "set" : "MISSING",
        odoo_db:   process.env.ODOO_DB    ? "set" : "MISSING",
        odoo_user: process.env.ODOO_USER  ? "set" : "MISSING",
        api_key:   process.env.ODOO_API_KEY ? "set" : "MISSING",
      },
      parsed_lines:    parsedLines,
      parsed_orders:   parsedOrders,
      parse_error:     parseError,
      // Raw XML snippets for manual inspection if parse fails
      raw_lines_snippet:  linesXml.slice(0, 2000),
      raw_orders_snippet: ordersXml.slice(0, 1000),
    });

  } catch (err) {
    return res.status(500).json({
      error: err.message,
      env: {
        odoo_url:  process.env.ODOO_URL    ? "set" : "MISSING",
        odoo_db:   process.env.ODOO_DB     ? "set" : "MISSING",
        odoo_user: process.env.ODOO_USER   ? "set" : "MISSING",
        api_key:   process.env.ODOO_API_KEY ? "set" : "MISSING",
      },
    });
  }
}
