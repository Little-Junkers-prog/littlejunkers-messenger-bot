// api/odoo-probe.js
// TEMPORARY — browser-friendly availability test.
// GET https://littlejunkers-messenger-bot.vercel.app/api/odoo-probe
// Tests the full availability query for all three sizes

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
  const uid = m ? parseInt(m[1],10) : null;
  if (!uid) throw new Error("Auth failed");
  return uid;
}
async function odooJsonRpc(uid, model, method, args, kwargs={}) {
  const { ODOO_URL, ODOO_USER, ODOO_API_KEY } = process.env;
  const creds = Buffer.from(`${ODOO_USER}:${ODOO_API_KEY}`).toString("base64");
  const r = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Authorization":`Basic ${creds}` },
    body: JSON.stringify({ jsonrpc:"2.0", method:"call", id:1, params:{ model, method, args, kwargs:{ context:{ uid }, ...kwargs } } }),
  });
  const json = await r.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

const FLEET = {
  "11 Yard": { templateId:60, units:3 },
  "16 Yard": { templateId:4,  units:2 },
  "21 Yard": { templateId:46, units:2 },
};
const RENTAL_OPTIONS = {
  "Early Bird":      { days:[1,2],       duration:2 },
  "Weekend Warrior": { days:[5],         duration:3 },
  "Base Rental":     { days:[1,2,3,4,5], duration:2 },
  "Full Reset":      { days:[1,2,3,4,5], duration:7 },
};
function toDateStr(d) { return d.toISOString().split("T")[0]; }
function addDays(d,n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function parseOdooDate(s) { if (!s||s===false) return null; return new Date(s.replace(" ","T")+(s.length===10?"T00:00:00Z":"Z")); }
function formatDisplay(d) { return d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",timeZone:"America/New_York"}); }

function buildBlockedSet(orders, units, start, end) {
  const blocked = new Set();
  const cur = new Date(start);
  while (cur <= end) {
    const ms = cur.getTime();
    let busy = 0;
    for (const o of orders) {
      const s = parseOdooDate(o.start_date); const e = parseOdooDate(o.return_date);
      if (s && e && s.getTime()<=ms && ms<=e.getTime()) busy++;
    }
    if (busy >= units) blocked.add(toDateStr(cur));
    cur.setDate(cur.getDate()+1);
  }
  return blocked;
}
function buildWindows(optKey, blocked, start, end) {
  const opt = RENTAL_OPTIONS[optKey]; if (!opt) return [];
  const windows = []; const cur = new Date(start); cur.setDate(cur.getDate()+1);
  while (cur <= end && windows.length < 4) {
    if (opt.days.includes(cur.getDay())) {
      let clear = true;
      for (let i=0;i<opt.duration;i++) { if (blocked.has(toDateStr(addDays(cur,i)))) { clear=false; break; } }
      if (clear) {
        const ed = addDays(cur, opt.duration);
        windows.push({ start:toDateStr(cur), end:toDateStr(ed), startLabel:formatDisplay(cur), endLabel:formatDisplay(ed) });
      }
    }
    cur.setDate(cur.getDate()+1);
  }
  return windows;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin","*");
  const today = new Date(); today.setHours(0,0,0,0);
  const windowEnd = addDays(today, 21);

  try {
    const uid = await xmlrpcAuth();
    const results = {};

    for (const [size, fleet] of Object.entries(FLEET)) {
      const lines = await odooJsonRpc(uid, "sale.order.line", "search_read",
        [[["product_id.product_tmpl_id","=",fleet.templateId],["is_rental","=",true],["order_id.rental_status","in",["pickup","pickedup"]],["return_date",">=",toDateStr(today)]]],
        { fields:["id","start_date","return_date"], limit:200 }
      );
      const blocked = buildBlockedSet(lines, fleet.units, today, windowEnd);
      const available = {};
      for (const key of Object.keys(RENTAL_OPTIONS)) {
        available[key] = buildWindows(key, blocked, today, windowEnd);
      }
      results[size] = {
        activeRentals: lines.length,
        blockedDates: [...blocked].sort(),
        available,
      };
    }

    return res.status(200).json({ uid, success:true, today:toDateStr(today), results });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
