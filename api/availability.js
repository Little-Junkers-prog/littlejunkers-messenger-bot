// api/availability.js
// Auth: XML-RPC authenticate → get uid
// Data: JSON-RPC call_kw with uid+apikey passed directly in the request params
// This matches how Odoo 18 Online accepts programmatic API calls.

const FLEET = {
  "11 Yard": { templateId: 60, units: 3 },
  "16 Yard": { templateId: 4,  units: 2 },
  "21 Yard": { templateId: 46, units: 2 },
};

const RENTAL_OPTIONS = {
  "Early Bird":      { days: [1, 2],       duration: 2 },
  "Weekend Warrior": { days: [5],          duration: 3 },
  "Base Rental":     { days: [1,2,3,4,5], duration: 2 },
  "Full Reset":      { days: [1,2,3,4,5], duration: 7 },
};

// ─── XML-RPC auth ─────────────────────────────────────────────────────────────
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

// ─── JSON-RPC data call ────────────────────────────────────────────────────────
// Odoo 18 Online: pass uid + api_key directly in the JSON-RPC execute_kw params.
// No session, no Basic auth — the uid from XML-RPC auth IS the auth token for JSON-RPC.
async function odooCall(uid, model, method, args, kwargs = {}) {
  const { ODOO_URL, ODOO_DB, ODOO_API_KEY } = process.env;

  const payload = {
    jsonrpc: "2.0",
    method: "call",
    id: 1,
    params: {
      service: "object",
      method: "execute_kw",
      args: [
        ODOO_DB,
        uid,
        ODOO_API_KEY,
        model,
        method,
        args,
        kwargs,
      ],
    },
  };

  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) throw new Error(`Odoo /jsonrpc HTTP ${r.status}`);
  const json = await r.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────
function toDateStr(d) { return d.toISOString().split("T")[0]; }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function parseOdooDate(s) {
  if (!s || s === false) return null;
  return new Date(s.replace(" ", "T") + (s.length === 10 ? "T00:00:00Z" : "Z"));
}
function formatDisplay(d) {
  // Build from date string to avoid UTC midnight -> Eastern timezone shift
  const [year, month, day] = toDateStr(d).split("-").map(Number);
  const local = new Date(year, month - 1, day, 12, 0, 0);
  return local.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
}

function buildBlockedSet(lines, units, today, windowEnd) {
  const blocked = new Set();
  const cur = new Date(today);
  while (cur <= windowEnd) {
    const ms = cur.getTime();
    let busy = 0;
    for (const l of lines) {
      const s = parseOdooDate(l.start_date);
      const e = parseOdooDate(l.return_date);
      if (s && e && s.getTime() <= ms && ms <= e.getTime()) busy++;
    }
    if (busy >= units) blocked.add(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return blocked;
}

function buildWindows(optKey, blocked, today, windowEnd) {
  const opt = RENTAL_OPTIONS[optKey];
  if (!opt) return [];
  const windows = [];
  const cur = new Date(today);
  cur.setDate(cur.getDate() + 1);
  while (cur <= windowEnd && windows.length < 4) {
    if (opt.days.includes(cur.getDay())) {
      let clear = true;
      for (let i = 0; i < opt.duration; i++) {
        if (blocked.has(toDateStr(addDays(cur, i)))) { clear = false; break; }
      }
      if (clear) {
        const end = addDays(cur, opt.duration);
        windows.push({
          start: toDateStr(cur), end: toDateStr(end),
          startLabel: formatDisplay(cur), endLabel: formatDisplay(end),
          startIso: cur.toISOString(), endIso: end.toISOString(),
        });
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return windows;
}

// ─── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { size } = req.body || {};
  if (!size || !FLEET[size]) return res.status(400).json({ error: "Invalid size" });

  const fleet = FLEET[size];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const windowEnd = addDays(today, 21);

  try {
    const uid = await xmlrpcAuth();

    const lines = await odooCall(uid, "sale.order.line", "search_read",
      [[
        ["product_id.product_tmpl_id", "=", fleet.templateId],
        ["is_rental", "=", true],
        ["order_id.rental_status", "in", ["pickup", "pickedup"]],
        ["return_date", ">=", toDateStr(today)],
      ]],
      { fields: ["id", "start_date", "return_date"], limit: 200 }
    );

    const blocked = buildBlockedSet(lines, fleet.units, today, windowEnd);
    const available = {};
    for (const key of Object.keys(RENTAL_OPTIONS)) {
      available[key] = buildWindows(key, blocked, today, windowEnd);
    }

    return res.status(200).json({
      size,
      available,
      debug: {
        activeRentals: lines.length,
        blockedDates: [...blocked].sort(),
        fleetUnits: fleet.units,
      },
    });

  } catch (err) {
    console.error("[availability] error:", err.message);
    // Graceful degradation
    const today2 = new Date(); today2.setHours(0, 0, 0, 0);
    const available = {};
    for (const key of Object.keys(RENTAL_OPTIONS)) {
      available[key] = buildWindows(key, new Set(), today2, addDays(today2, 21));
    }
    return res.status(200).json({ size, available, degraded: true, degradedReason: err.message });
  }
}
