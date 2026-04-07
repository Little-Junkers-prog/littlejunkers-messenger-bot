// api/availability.js
// Queries Odoo rental orders to return available delivery dates
// for a given dumpster size over the next 14 days.
//
// POST { size: "11 Yard" | "16 Yard" | "21 Yard" }
// Returns { available: { [rentalOptionKey]: [{ start, end, label }] } }

// ─── Fleet configuration ──────────────────────────────────────────────────────
// product.template IDs from Odoo Inventory — no variants on any product
const FLEET = {
  "11 Yard": { productId: 60, units: 3, name: "The Little Junker 11-Yard Dumpster" },
  "16 Yard": { productId: 4,  units: 2, name: "The Mighty Middler 16-Yard Dumpster" },
  "21 Yard": { productId: 46, units: 2, name: "The Big Junker 21-Yard Dumpster"     },
};

// ─── Rental option delivery day rules ────────────────────────────────────────
// Each option maps to specific day-of-week windows.
// 0 = Sunday, 1 = Monday, 2 = Tuesday, 3 = Wednesday, 4 = Thursday, 5 = Friday, 6 = Saturday
const RENTAL_OPTIONS = {
  "Early Bird":      { days: [1, 2],    durationDays: 2  }, // Mon or Tue delivery, 2-day
  "Weekend Warrior": { days: [5, 6, 1], durationDays: 3  }, // Fri delivery, return Mon
  "Base Rental":     { days: [1,2,3,4,5,6], durationDays: 2  }, // Any day, 2-day
  "Full Reset":      { days: [1,2,3,4,5,6], durationDays: 7  }, // Any day, 7-day
};

// ─── Odoo API helper ──────────────────────────────────────────────────────────
async function odooCall(model, method, args, kwargs = {}) {
  const url  = `${process.env.ODOO_URL}/web/dataset/call_kw`;
  const body = {
    jsonrpc: "2.0",
    method:  "call",
    params: {
      model,
      method,
      args,
      kwargs: { context: {}, ...kwargs },
    },
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.ODOO_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toDateStr(date) {
  // Returns "YYYY-MM-DD" in local time
  return date.toISOString().split("T")[0];
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function parseDateStr(str) {
  // Odoo returns "YYYY-MM-DD HH:MM:SS" — parse as UTC midnight
  if (!str) return null;
  return new Date(str.replace(" ", "T") + (str.length === 10 ? "T00:00:00Z" : "Z"));
}

function formatDisplayDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month:   "long",
    day:     "numeric",
    timeZone: "America/New_York",
  });
}

// ─── Core availability logic ──────────────────────────────────────────────────
// Returns a Set of date strings ("YYYY-MM-DD") that are fully blocked
// (all units of the requested size are on active rentals that day)
function computeBlockedDates(activeOrders, fleetUnits, windowStart, windowEnd) {
  const blocked = new Set();

  // For each day in the window, count how many units are out
  const cursor = new Date(windowStart);
  while (cursor <= windowEnd) {
    const dateStr = toDateStr(cursor);
    const dayMs   = cursor.getTime();

    let busyUnits = 0;
    for (const order of activeOrders) {
      const start = parseDateStr(order.rental_start_date);
      const end   = parseDateStr(order.rental_return_date);
      if (!start || !end) continue;

      // A unit is busy on this day if the rental overlaps
      // (start <= dayMs <= end)
      if (start.getTime() <= dayMs && dayMs <= end.getTime()) {
        busyUnits++;
      }
    }

    if (busyUnits >= fleetUnits) blocked.add(dateStr);
    cursor.setDate(cursor.getDate() + 1);
  }

  return blocked;
}

// Build available delivery date windows for a specific rental option
function getAvailableWindows(optionKey, blocked, windowStart, windowEnd) {
  const option  = RENTAL_OPTIONS[optionKey];
  if (!option) return [];

  const windows = [];
  const cursor  = new Date(windowStart);
  // Start from tomorrow at minimum
  cursor.setDate(cursor.getDate() + 1);

  while (cursor <= windowEnd) {
    const dow = cursor.getDay(); // 0-6

    if (option.days.includes(dow)) {
      // Check that all days of this rental window are available
      let windowClear = true;
      for (let i = 0; i < option.durationDays; i++) {
        const checkDay = addDays(cursor, i);
        if (blocked.has(toDateStr(checkDay))) {
          windowClear = false;
          break;
        }
      }

      if (windowClear) {
        const endDate = addDays(cursor, option.durationDays);
        windows.push({
          start:       toDateStr(cursor),
          end:         toDateStr(endDate),
          startLabel:  formatDisplayDate(cursor),
          endLabel:    formatDisplayDate(endDate),
          // ISO strings for the funnel to pass back on submit
          startIso:    cursor.toISOString(),
          endIso:      endDate.toISOString(),
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return windows;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS for local dev
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { size } = req.body || {};

  if (!size || !FLEET[size]) {
    return res.status(400).json({ error: "Invalid size. Must be '11 Yard', '16 Yard', or '21 Yard'." });
  }

  const fleet = FLEET[size];

  try {
    // ── 1. Define the 14-day look-ahead window ──
    const today      = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd  = addDays(today, 21); // 21 days to give buffer for 7-day rentals

    // ── 2. Query Odoo for active rental orders containing this product ──
    // We search sale.order.line where:
    //   - product_id.product_tmpl_id = our template ID  (or search by name)
    //   - The parent order's rental_status is 'pickup' (Reserved) or 'pickedup' (Picked Up)
    //   - rental_return_date >= today (still active or future)
    //
    // Odoo 18: rental orders are sale.order records with is_rental_order = True
    // Order lines are sale.order.line with is_rental = True

    const domain = [
      ["product_id.product_tmpl_id", "=", fleet.productId],
      ["is_rental", "=", true],
      ["order_id.rental_status", "in", ["pickup", "pickedup"]],
      ["return_date", ">=", toDateStr(today)],
    ];

    const fields = [
      "rental_start_date",
      "return_date",
      "order_id",
      "product_id",
    ];

    const lines = await odooCall(
      "sale.order.line",
      "search_read",
      [domain],
      { fields, limit: 200 }
    );

    // Normalize: map return_date → rental_return_date for consistency
    const activeOrders = lines.map(l => ({
      rental_start_date:  l.rental_start_date,
      rental_return_date: l.return_date,
      order_id:           l.order_id,
    }));

    // ── 3. Compute blocked dates ──
    const blocked = computeBlockedDates(activeOrders, fleet.units, today, windowEnd);

    // ── 4. Build available windows for each rental option ──
    const available = {};
    for (const key of Object.keys(RENTAL_OPTIONS)) {
      const windows = getAvailableWindows(key, blocked, today, windowEnd);
      // Return max 4 windows per option (roughly 2 weeks of opportunities)
      available[key] = windows.slice(0, 4);
    }

    // ── 5. Include debug info in non-production ──
    const debug = process.env.NODE_ENV !== "production" ? {
      queriedProductId: fleet.productId,
      fleetUnits:       fleet.units,
      activeOrderCount: activeOrders.length,
      blockedDates:     [...blocked].sort(),
    } : undefined;

    return res.status(200).json({
      size,
      available,
      ...(debug ? { debug } : {}),
    });

  } catch (err) {
    console.error("[availability] Odoo query failed:", err.message);

    // Graceful degradation — return all dates open rather than blocking the funnel
    // The funnel will show dates but note "subject to confirmation"
    const today     = new Date();
    const available = {};
    for (const key of Object.keys(RENTAL_OPTIONS)) {
      available[key] = getAvailableWindows(key, new Set(), today, addDays(today, 21)).slice(0, 4);
    }

    return res.status(200).json({
      size,
      available,
      degraded: true, // funnel uses this to show "subject to confirmation" copy
    });
  }
}
