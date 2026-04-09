// api/availability.js
// Little Junkers — Odoo Rental Availability
//
// Source of truth:
// - sale.order       -> rental_start_date, rental_return_date, state, rental_status
// - sale.order.line  -> which dumpster product is actually on the order
//
// Notes:
// - Handles mixed orders (multiple dumpster sizes on one order)
// - Respects line quantities
// - Ignores non-dumpster lines like delivery fees
// - Ignores zero-quantity lines that should not consume inventory
// - Uses order header dates as the active rental window
// - Uses confirmed-order logic instead of brittle rental_status filtering
// - Allows same-day turnover for early returns
// - Allows Saturday starts for Base Rental so "soonest available" can surface on Saturdays

const FLEET = {
  "11 Yard": { templateId: 60, units: 3 },
  "16 Yard": { templateId: 4, units: 2 },
  "21 Yard": { templateId: 46, units: 2 },
};

const RENTAL_OPTIONS = {
  "Early Bird":      { days: [1, 2], duration: 2 },          // discounted Mon/Tue
  "Weekend Warrior": { days: [5], duration: 4 },             // Fri-Mon inclusive
  "Base Rental":     { days: [1, 2, 3, 4, 5, 6], duration: 2 }, // standard 2-day incl. Saturday start
  "Full Reset":      { days: [1, 2, 3, 4, 5], duration: 7 },
};

const INCLUDE_DEBUG =
  process.env.NODE_ENV !== "production" ||
  process.env.AVAILABILITY_DEBUG === "true";

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

  // Date only
  if (typeof s === "string" && s.length === 10) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }

  // Datetime
  if (typeof s === "string") {
    const normalized = s.replace(" ", "T");
    return new Date(`${normalized}Z`);
  }

  return null;
}

function formatDisplay(d) {
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

  // Reserved/booked commonly rely on ordered qty.
  // Picked-up often relies on delivered qty.
  // Use the greater of the two to avoid undercounting.
  return Math.max(ordered, delivered, 0);
}

// ─── Availability builders ───────────────────────────────────────────────────

function buildBlockedSet(rentals, templateId, units, today, windowEnd) {
  const blocked = new Set();
  const cur = new Date(today);

  while (cur <= windowEnd) {
    const dayStr = toDateStr(cur);
    let used = 0;

    for (const rental of rentals) {
      if (rental.templateId !== templateId) continue;

      const s = parseOdooDate(rental.start_date);
      const e = parseOdooDate(rental.return_date);

      if (!s || !e) continue;

      const startStr = toDateStr(s);
      const endStr = toDateStr(e);

      // Fully inside active span
      if (startStr < dayStr && dayStr < endStr) {
        used += rental.qty;
        continue;
      }

      // Rental starts on this day: consumes the day
      if (startStr === dayStr) {
        used += rental.qty;
        continue;
      }

      // Rental ends on this day:
      // allow same-day turnover if it returns early enough
      if (endStr === dayStr) {
        const returnHourUtc = e.getUTCHours();

        // Conservative cutoff for early-morning returns
        // 12:00 UTC is early AM in Georgia depending on DST
        const EARLY_RETURN_CUTOFF_UTC = 12;

        if (returnHourUtc >= EARLY_RETURN_CUTOFF_UTC) {
          used += rental.qty;
        }
      }
    }

    if (used >= units) {
      blocked.add(dayStr);
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

    // Pull confirmed rental orders that still occupy inventory.
    const orders = await odooCall(
      uid,
      "sale.order",
      "search_read",
      [[
        ["is_rental_order", "=", true],
        ["state", "in", ["sale", "done"]],
        ["rental_return_date", "!=", false],
        ["rental_return_date", ">=", toDateStr(today)],
      ]],
      {
        fields: [
          "id",
          "name",
          "state",
          "rental_status",
          "rental_start_date",
          "rental_return_date",
          "order_line",
        ],
        limit: 500,
      }
    );

    if (!orders.length) {
      const available = {};
      for (const key of Object.keys(RENTAL_OPTIONS)) {
        available[key] = buildWindows(key, new Set(), today, windowEnd);
      }
      return res.status(200).json({ size, available });
    }

    // Pull all lines from those orders
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

    // Resolve product.product -> product template
    const productIds = [
      ...new Set(
        lines
          .map((line) => normalizeMany2oneId(line.product_id))
          .filter(Boolean)
      ),
    ];

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

    // Fast lookup for orders by id
    const orderById = new Map();
    for (const order of orders) {
      orderById.set(order.id, order);
    }

    // Build normalized active rentals from actual dumpster lines only
    const rentals = [];

    for (const line of lines) {
      const orderId = normalizeMany2oneId(line.order_id);
      const productId = normalizeMany2oneId(line.product_id);
      const templateId = productToTemplate.get(productId);
      const qty = qtyInUse(line);

      if (!orderId || !productId || !templateId) continue;
      if (qty <= 0) continue;

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
        state: order.state,
        status: order.rental_status,
        templateId,
        qty,
        start_date: order.rental_start_date,
        return_date: order.rental_return_date,
      });
    }

    // Build blocked dates for the requested dumpster size only
    const blocked = buildBlockedSet(
      rentals,
      fleet.templateId,
      fleet.units,
      today,
      windowEnd
    );

    // Build available windows
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
        orders: orders.map((o) => ({
          name: o.name,
          state: o.state,
          rental_status: o.rental_status,
          start: o.rental_start_date,
          end: o.rental_return_date,
        })),
        relevantRentals: rentals
          .filter((r) => r.templateId === fleet.templateId)
          .map((r) => ({
            order: r.order_name,
            state: r.state,
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
