// api/odoo-probe.js
// TEMPORARY — pure XML-RPC, fields passed correctly to avoid unhashable type bug.
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
function decodeXml(t) {
  return String(t||"").replaceAll("&lt;","<").replaceAll("&gt;",">").replaceAll("&quot;",'"').replaceAll("&apos;","'").replaceAll("&amp;","&");
}

async function xmlrpc(url, method, params) {
  const body = `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${params.map(p=>`<param>${xv(p)}</param>`).join("")}</params></methodCall>`;
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

// Extract all string values from XML (for reading field values)
function extractStrings(xml) {
  const results = [];
  const re = /<string>([\s\S]*?)<\/string>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const val = decodeXml(m[1]);
    if (val && !val.includes("Traceback") && val.length < 200) {
      results.push(val);
    }
  }
  return results.slice(0, 20);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");

  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;
  const EXEC = `${ODOO_URL}/xmlrpc/2/object`;

  const keyPreview = ODOO_API_KEY
    ? `${ODOO_API_KEY.slice(0,6)}...${ODOO_API_KEY.slice(-4)} (len=${ODOO_API_KEY.length})`
    : "MISSING";

  try {
    // 1. Auth
    const authXml = await xmlrpc(`${ODOO_URL}/xmlrpc/2/common`, "authenticate",
      [ODOO_DB, ODOO_USER, ODOO_API_KEY, {}]);
    const uid = extractInt(authXml);
    if (!uid) throw new Error(`Auth failed. Raw: ${authXml.slice(0,300)}`);

    // 2. Search for rental order line IDs — domain only, no field list in kwargs
    // This worked before (returned IDs 1433, 1423, 1421)
    const searchXml = await xmlrpc(EXEC, "execute_kw", [
      ODOO_DB, uid, ODOO_API_KEY,
      "sale.order.line", "search",
      [[["product_id.product_tmpl_id","=",60],["is_rental","=",true]]],
      { limit: 5 }
    ]);
    const searchFault = extractFault(searchXml);
    const idMatches = [...searchXml.matchAll(/<(?:int|i4)>(\d+)<\/(?:int|i4)>/g)];
    const ids = idMatches.map(m=>parseInt(m[1],10)).filter(n=>n>100).slice(0,3);

    // 3. Read those IDs — pass fields as a POSITIONAL argument (args[1]), not in kwargs
    // The unhashable type bug happens when lists are in the kwargs struct.
    // Correct XML-RPC signature for read: execute_kw(db, uid, key, model, 'read', [ids, fields])
    // where [ids, fields] is the args list — fields is positional, NOT in kwargs.
    let readResult = null;
    let readFault = null;
    if (ids.length > 0 && !searchFault) {
      const fields = ["id", "start_date", "return_date", "is_rental", "order_id"];
      const readXml = await xmlrpc(EXEC, "execute_kw", [
        ODOO_DB, uid, ODOO_API_KEY,
        "sale.order.line", "read",
        [ids, fields],  // fields passed as positional arg, NOT in kwargs
        {}              // empty kwargs — no lists here
      ]);
      readFault = extractFault(readXml);
      readResult = {
        fault: readFault,
        raw: readXml.slice(0, 3000),
        strings_found: extractStrings(readXml),
      };
    }

    // 4. Also try search_read with fields in kwargs — some Odoo versions handle this fine
    // We pass fields as a simple array in kwargs — if this works, great
    let searchReadResult = null;
    let searchReadFault = null;
    if (!searchFault) {
      const srXml = await xmlrpc(EXEC, "execute_kw", [
        ODOO_DB, uid, ODOO_API_KEY,
        "sale.order.line", "search_read",
        [[["product_id.product_tmpl_id","=",60],["is_rental","=",true]]],
        { fields: ["id","start_date","return_date"], limit: 3, context: {} }
      ]);
      searchReadFault = extractFault(srXml);
      searchReadResult = {
        fault: searchReadFault,
        raw: srXml.slice(0, 2000),
        strings_found: extractStrings(srXml),
      };
    }

    return res.status(200).json({
      uid,
      key_preview: keyPreview,
      search: { fault: searchFault, ids_found: ids },
      read_with_positional_fields: readResult,
      search_read_with_kwargs_fields: searchReadResult,
    });

  } catch(err) {
    return res.status(200).json({
      error: err.message,
      key_preview: keyPreview,
    });
  }
}
