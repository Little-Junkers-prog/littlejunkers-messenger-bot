// api/availability.js
// Queries Odoo for available delivery dates for a given dumpster size.
// Auth: XML-RPC (confirmed working pattern)
// Data: JSON-RPC /web/dataset/call_kw (avoids XML-RPC kwargs list bug)
//
// POST { size: "11 Yard" | "16 Yard" | "21 Yard" }
// Returns { size, available: { [optionKey]: [{ start, end, startLabel, endLabel }] } }

// ─── Fleet config ─────────────────────────────────────────────────────────────
// product.template IDs confirmed from Odoo Inventory URLs
const FLEET = {
  "11 Yard": { templateId: 60, units: 3 },
  "16 Yard": { templateId: 4,  units: 2 },
  "21 Yard": { templateId: 46, units: 2 },
};

// ─── Rental option delivery rules ─────────────────────────────────────────────
// days: day-of-week for valid delivery (0=Sun, 1=Mon ... 6=Sat)
// duration: how many days the rental lasts
const RENTAL_OPTIONS = {
  "Early Bird":      { days: [1, 2],       duration: 2 },  // Mon or Tue, 2-day
  "Weekend Warrior": { days: [5],          duration: 3 },  // Fri delivery, return Mon
  "Base Rental":     { days: [1,2,3,4,5], duration: 2 },  // Any weekday, 2-day
  "Full Reset":      { days: [1,2,3,4,5], duration: 7 },  // Any weekday, 7-day
};

// ─── XML-RPC helpers (auth only) ──────────────────────────────────────────────
function xe(v) {
  return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;");
}
function xv(val) {
  if (val === null || val === undefined || val === false) return "<value><boolean>0</boolean></value>";
  if (val === true)  return "<value><boolean>1</boolean></value>";
  if (typeof val === "number" && Number.isInteger(val)) return `<value><int>${val}</int></value>`;
  if (typeof val === "string") return `<value><string>${xe(val)}</string></value>`;
  if (Array.isArray(val)) return `<value><array><data>${val.map(xv).join("")}</data></array></value>`;
  if (typeof val === "object") return `<value><struct>${Object.entries(val).map(([k,v])=>`<member><n>${xe(k)}</n>${xv(v)}</member>`).join("")}</struct></value>`;
  return `<value><string>${xe(String(val))}</string></value>`;
}
async function xmlrpcAuth() {
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;
  const body = `<?xml version="1.0"?><methodCall><methodName>authenticate</methodName><params><param>${xv(ODOO_DB)}</param><param>${xv(ODOO_USER)}</param><param>${xv(ODOO_API_KEY)}</param><param>${xv({})}</param></params></methodCall>`;
  const r = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
    method: "POST", headers: { "Content-Type": "text/xml" }, body,
  });
  const xml = await r.text();
  const m = xml.match(/<(?:int|i4)>(-?\d+)<\/(?:int|i4)>/);
  const uid = m ? parseInt(m[1], 10) : null;
  if (!uid) throw new Error("Odoo authentication failed");
  return uid;
}

// ─── JSON-RPC data helper ──────────────────────────────────────────────────────
// Uses /web/dataset/call_kw which accepts JSON — no XML kwargs bug
async function odooCall(uid, model, method, args, kwargs = {}) {
  const { ODOO_URL, ODOO_DB, ODOO_API_KEY } = process.env;

  // Build Basic auth from user:apikey
  const credentials = Buffer.from(
    `${process.env.ODOO_USER}:${ODOO_API_KEY}`
  ).toString("base64");

  const payload = {
    jsonrpc: "2.0",
    method: "call",
    id: 1,
    params: {
      model,
      method,
      args,
      kwargs: { context: { uid }, ...kwargs },
    },
  };

  const r = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) throw new Error(`Odoo JSON-RPC HTTP ${r.status}`);
  const json = await r.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────
function toDateStr(d) {
  // YYYY-MM-DD in local time
  return d.toISOString().split("T")[0];
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function parseOdooDate(str) {
  if (!str || str === false) return null;
  // Odoo returns "YYYY-MM-DD HH:MM:SS" or "YYYY-MM-DD"
  return new Date(str.replace(" ", "T") + (str.length === 10 ? "T00:00:00Z" : "Z"));
}
function formatDisplay(d) {
  return d.toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
    timeZone: "America/New_York",
  });
}

// ─── Core logic ────────────────────────────────────────────────────────────────
function buildBlockedSet(orders, fleetUnits, windowStart, windowEnd) {
  const blocked = new Set();
  const cursor = new Date(windowStart);
  while (cursor <= windowEnd) {
    const dayMs = cursor.getTime();
    let busyCount = 0;
    for (const o of orders) {
      const s = parseOdooDate(o.rental_start_date || o.start_date);
      const e = parseOdooDate(o.rental_return_date || o.return_date);
      if (!s || !e) continue;
      if (s.getTime() <= dayMs && dayMs <= e.getTime()) busyCount++;
    }
    if (busyCount >= fleetUnits) blocked.add(toDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return blocked;
}

function buildWindows(optionKey, blocked, windowStart, windowEnd) {
  const opt = RENTAL_OPTIONS[optionKey];
  if (!opt) return [];
  const windows = [];
  const cursor = new Date(windowStart);
  cursor.setDate(cursor.getDate() + 1); // start from tomorrow minimum

  while (cursor <= windowEnd && windows.length < 4) {
    if (opt.days.includes(cursor.getDay())) {
      let clear = true;
      for (let i = 0; i < opt.duration; i++) {
        if (blocked.has(toDateStr(addDays(cursor, i)))) { clear = false; break; }
      }
      if (clear) {
        const endDate = addDays(cursor, opt.duration);
        windows.push({
          start:      toDateStr(cursor),
          end:        toDateStr(endDate),
          startLabel: formatDisplay(cursor),
          endLabel:   formatDisplay(endDate),
          startIso:   cursor.toISOString(),
          endIso:     endDate.toISOString(),
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
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
  if (!size || !FLEET[size]) {
    return res.status(400).json({ error: "Invalid size. Must be '11 Yard', '16 Yard', or '21 Yard'." });
  }

  const fleet = FLEET[size];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = addDays(today, 21); // 21 days covers 7-day rental windows

  try {
    // 1. Authenticate via XML-RPC
    const uid = await xmlrpcAuth();

    // 2. Query active rental order lines for this product via JSON-RPC
    // Confirmed fields: start_date, return_date on sale.order.line
    // Confirmed status values: rental_status on sale.order = 'pickup' | 'pickedup'
    const lines = await odooCall(uid, "sale.order.line", "search_read",
      [[
        ["product_id.product_tmpl_id", "=", fleet.templateId],
        ["is_rental", "=", true],
        ["order_id.rental_status", "in", ["pickup", "pickedup"]],
        ["return_date", ">=", toDateStr(today)],
      ]],
      {
        fields: ["id", "order_id", "start_date", "return_date"],
        limit: 200,
      }
    );

    // 3. Compute blocked dates
    const blocked = buildBlockedSet(lines, fleet.units, today, windowEnd);

    // 4. Build available windows per rental option
    const available = {};
    for (const key of Object.keys(RENTAL_OPTIONS)) {
      available[key] = buildWindows(key, blocked, today, windowEnd);
    }

    const isProduction = process.env.NODE_ENV === "production";
    return res.status(200).json({
      size,
      available,
      ...(!isProduction && {
        debug: {
          activeRentals: lines.length,
          blockedDates: [...blocked].sort(),
          fleetUnits: fleet.units,
        }
      }),
    });

  } catch (err) {
    console.error("[availability] error:", err.message);

    // Graceful degradation — show all dates open rather than blocking the funnel
    // Funnel will show "subject to confirmation" copy when degraded: true
    const available = {};
    const today2 = new Date();
    today2.setHours(0, 0, 0, 0);
    for (const key of Object.keys(RENTAL_OPTIONS)) {
      available[key] = buildWindows(key, new Set(), today2, addDays(today2, 21));
    }
    return res.status(200).json({ size, available, degraded: true });
  }
}
