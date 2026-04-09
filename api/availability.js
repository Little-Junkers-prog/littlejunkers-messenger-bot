// api/availability.js
// Little Junkers — Odoo Rental Availability
//
// Source of truth:
// - sale.order       -> rental_start_date, rental_return_date, rental_status
// - sale.order.line  -> which dumpster product is actually on the order
//
// Why this version is more reliable:
// - Handles mixed orders (multiple dumpster sizes on one order)
// - Respects line quantities
// - Ignores non-dumpster lines like delivery fees
// - Ignores zero-quantity lines that should not consume inventory
// - Uses order header dates as the active rental window
// - Corrects Weekend Warrior to a true 4-day rental
// - Corrects end-date display to be inclusive

const FLEET = {
  "11 Yard": { templateId: 60, units: 3 },
  "16 Yard": { templateId: 4, units: 2 },
  "21 Yard": { templateId: 46, units: 2 },
};

const RENTAL_OPTIONS = {
  "Early Bird":      { days: [1, 2],       duration: 2 }, // Mon/Tue start, 2-day rental
  "Weekend Warrior": { days: [5],          duration: 4 }, // Fri start, Fri-Mon inclusive
  "Base Rental":     { days: [1, 2, 3, 4, 5], duration: 2 },
  "Full Reset":      { days: [1, 2, 3, 4, 5], duration: 7 },
};

const ACTIVE_RENTAL_STATUSES = ["reserved", "pickup", "pickedup", "booked"];
const INCLUDE_DEBUG = process.env.NODE_ENV !== "production";

// ─── XML-RPC auth ─────────────────────────────────────────────────────────────

function xe(v) {
  return String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xv(val) {
  if (val === null || val === undefined || val === false) {
    return "<value><boolean>0</boolean></value>";
  }
  if (val === true) {
    return "<value><boolean>1</boolean></value>";
  }
  if (typeof val === "number" && Number.isInteger(val)) {
    return `<value><int>${val}</int></value>`;
  }
  if (typeof val === "string") {
    return `<value><string>${xe(val)}</string></value>`;
  }
  if (Array.isArray(val)) {
    return `<value><array><data>${val.map(xv).join("")}</data></array></value>`;
  }
  if (typeof val === "object") {
    return `<value><struct>${Object.entries(val)
      .map(([k, v]) => `<member><name>${xe(k)}</name>${xv(v)}</member>`)
      .join("")}</struct></value>`;
  }
  return `<value><string>${xe(String(val))}</string></value>`;
}

async function xmlrpcAuth() {
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;

  const body =
    `<?xml version="1.0"?>` +
    `<methodCall>` +
    `<methodName>authenticate</methodName>` +
    `<params>` +
    `<param>${xv(ODOO_DB)}</param>` +
    `<param>${xv(ODOO_USER)}</param>` +
    `<param>${xv(ODOO_API_KEY)}</param>` +
    `<param>${xv({})}</param>` +
    `</params>` +
    `</methodCall>`;

  const r = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
  });

  const xml = await r.text();
  const m = xml.match(/<(?:int|i4)>(-?\d+)<\/(?:int|i4)>/);
  const uid = m ? parseInt(m[1], 10) : null;

  if (!uid) {
    throw new Error("XML-RPC auth failed");
  }

  return uid;
}

// ─── JSON-RPC data call ──────────────────────────────────────────────────────

async function odooCall(uid, model, method, args, kwargs = {}) {
  const { ODOO_URL, ODOO_DB, ODOO_API_KEY } = process.env;

  const payload = {
    jsonrpc: "2.0",
    method: "call",
    id: 1,
    params: {
      service: "object",
      method: "execute_kw",
      args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs],
    },
  };

  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    throw new Error(`Odoo /jsonrpc HTTP ${r.status}`);
  }

  const json = await r.json();

  if (json.error) {
    throw new Error(json.error.data?.message || JSON.stringify(json.error));
  }

  return json.result;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

function toDateStr(d) {
  return d.toISOString().split("T")[0];
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function parseOdooDate(s) {
  if (!s || s === false) return null;

  // "YYYY-MM-DD"
  if (typeof s === "string" && s.length === 10) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }

  // "YYYY-MM-DD HH:MM:SS"
  if (typeof s === "string") {
    const normalized = s.replace(" ", "T");
    return new Date(`${normalized}Z`);
  }

  return null;
}

function formatDisplay(d) {
  // Use local noon to avoid timezone shifting the visible date
  const safe = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
  return safe.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function normalizeMany2oneId(value) {
  if (Array.isArray(value) && value.length > 0) return value[0];
  if (typeof value === "number") return value;
  return null;
}

function normalizeIdList(values) {
  if (!Array.isArray(values)) return [];
  return values.filter((v) => typeof v === "number");
}

function qtyInUse(line) {
  const ordered = Number(line.product_uom_qty || 0);
  const delivered = Number(line.qty_delivered || 0);

  // For reserved/booked: ordered qty matters
  // For picked-up: delivered qty matters
  // For weird zero-ordered/legacy cases: use whichever is higher
  return Math.max(ordered, delivered, 0);
}

// ─── Availability builders ───────────────────────────────────────────────────

function buildBlockedSet(rentals, templateId, units, today, windowEnd) {
  const blocked = new Set();
  const cur = new Date(today);

  while (cur <= windowEnd) {
    const ms = cur.getTime();
    let used = 0;

    for (const rental of rentals) {
      if (rental.templateId !== templateId) continue;

      const s = parseOdooDate(rental.start_date);
      const e = parseOdooDate(rental.return_date);

      if (!s || !e) continue;

      if (s.getTime() <= ms && ms <= e.getTime()) {
        used += rental.qty;
      }
    }

    if (used >= units) {
      blocked.add(toDateStr(cur));
    }

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

      // Inclusive duration blocking
      for (let i = 0; i < opt.duration; i++) {
        const day = addDays(cur, i);
        if (blocked.has(toDateStr(day))) {
          clear = false;
          break;
        }
      }

      if (clear) {
        const end = addDays(cur, opt.duration - 1);

        windows.push({
          start: toDateStr(cur),
          end: toDateStr(end),
          startLabel: formatDisplay(cur),
          endLabel: formatDisplay(end),
          startIso: cur.toISOString(),
          endIso: end.toISOString(),
        });
      }
    }

    cur.setDate(cur.getDate() + 1);
  }

  return windows;
}

// ─── Main handler ────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { size } = req.body || {};

  if (!size || !FLEET[size]) {
    return res.status(400).json({ error: "Invalid size" });
  }

  const fleet = FLEET[size];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const windowEnd = addDays(today, 21);

  try {
    const uid = await xmlrpcAuth();

    // 1) Pull active rental orders by header fields only
    const orders = await odooCall(
      uid,
      "sale.order",
      "search_read",
      [[
        ["is_rental_order", "=", true],
        ["rental_status", "in", ACTIVE_RENTAL_STATUSES],
        ["rental_return_date", ">=", toDateStr(today)],
        ["rental_start_date", "<=", toDateStr(windowEnd)],
      ]],
      {
        fields: [
          "id",
          "name",
          "rental_start_date",
          "rental_return_date",
          "rental_status",
          "order_line",
        ],
        limit: 200,
      }
    );

    if (!orders.length) {
      const available = {};
      for (const key of Object.keys(RENTAL_OPTIONS)) {
        available[key] = buildWindows(key, new Set(), today, windowEnd);
      }

      return res.status(200).json({ size, available });
    }

    // 2) Pull all lines from those orders
    const lineIds = normalizeIdList(orders.flatMap((o) => o.order_line || []));

    if (!lineIds.length) {
      const available = {};
      for (const key of Object.keys(RENTAL_OPTIONS)) {
        available[key] = buildWindows(key, new Set(), today, windowEnd);
      }

      return res.status(200).json({ size, available });
    }

    const lines = await odooCall(
      uid,
      "sale.order.line",
      "read",
      [lineIds],
      {
        fields: [
          "id",
          "order_id",
          "product_id",
          "product_uom_qty",
          "qty_delivered",
        ],
      }
    );

    // 3) Resolve product.product -> product template
    const productIds = [...new Set(
      lines
        .map((line) => normalizeMany2oneId(line.product_id))
        .filter(Boolean)
    )];

    let products = [];
    if (productIds.length) {
      products = await odooCall(
        uid,
        "product.product",
        "read",
        [productIds],
        {
          fields: ["id", "product_tmpl_id", "name"],
        }
      );
    }

    const productToTemplate = new Map();
    for (const p of products) {
      const productId = p.id;
      const templateId = normalizeMany2oneId(p.product_tmpl_id);
      if (productId && templateId) {
        productToTemplate.set(productId, templateId);
      }
    }

    // 4) Create a fast lookup for orders by id
    const orderById = new Map();
    for (const order of orders) {
      orderById.set(order.id, order);
    }

    // 5) Build normalized active rentals from relevant dumpster lines only
    const rentals = [];

    for (const line of lines) {
      const orderId = normalizeMany2oneId(line.order_id);
      const productId = normalizeMany2oneId(line.product_id);
      const templateId = productToTemplate.get(productId);
      const qty = qtyInUse(line);

      if (!orderId || !productId || !templateId) continue;
      if (qty <= 0) continue;

      // Only keep actual dumpster templates we care about
      const isDumpsterTemplate = Object.values(FLEET).some(
        (f) => f.templateId === templateId
      );
      if (!isDumpsterTemplate) continue;

      const order = orderById.get(orderId);
      if (!order) continue;

      if (!order.rental_start_date || !order.rental_return_date) continue;

      rentals.push({
        order_id: order.id,
        order_name: order.name,
        status: order.rental_status,
        templateId,
        qty,
        start_date: order.rental_start_date,
        return_date: order.rental_return_date,
      });
    }

    // 6) Build blocked dates for the requested size only
    const blocked = buildBlockedSet(
      rentals,
      fleet.templateId,
      fleet.units,
      today,
      windowEnd
    );

    // 7) Build available windows
    const available = {};
    for (const key of Object.keys(RENTAL_OPTIONS)) {
      available[key] = buildWindows(key, blocked, today, windowEnd);
    }

    const response = { size, available };

    if (INCLUDE_DEBUG) {
      response.debug = {
        fleetTemplateId: fleet.templateId,
        fleetUnits: fleet.units,
        activeOrders: orders.length,
        activeLines: lines.length,
        relevantRentals: rentals
          .filter((r) => r.templateId === fleet.templateId)
          .map((r) => ({
            order: r.order_name,
            status: r.status,
            qty: r.qty,
            start: r.start_date,
            end: r.return_date,
          })),
        blockedDates: [...blocked].sort(),
      };
    }

    return res.status(200).json(response);
  } catch (err) {
    console.error("[availability] FAILED");
    console.error("[availability] msg:", err.message?.slice(0, 200));
    console.error("[availability] msg2:", err.message?.slice(200, 400));
    console.error("[availability] stack:", err.stack?.split("\n")[1]);

    // Graceful degradation: still return generic windows so funnel doesn't die
    const available = {};
    for (const key of Object.keys(RENTAL_OPTIONS)) {
      available[key] = buildWindows(key, new Set(), today, windowEnd);
    }

    return res.status(200).json({
      size,
      available,
      degraded: true,
      degradedReason: INCLUDE_DEBUG ? err.message : undefined,
    });
  }
}
