// api/availability.js
// Supabase-backed rental availability.
// Source of truth:
// - public.units    -> physical dumpster inventory and maintenance state
// - public.rentals  -> confirmed/active rentals and short-lived Stripe pending holds
// - public.pricing  -> rental tier keys, durations, and day restrictions

import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";
import {
  getPricingConfig,
  normalizeSizeYards,
} from "../lib/pricingService";

const BLOCKING_RENTAL_STATUSES = ["confirmed", "active"];
const HOLD_RENTAL_STATUS = "pending";
const HOLD_EXPIRY_MINUTES = 30;
const WINDOW_DAYS = 90;
const MAX_WINDOWS_PER_TIER = 4;

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDisplay(d) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function normalizeDateRange(row) {
  const start = parseDateOnly(row.dropoff_date);
  const end = parseDateOnly(row.scheduled_return);
  if (!start || !end) return null;
  return { start, end };
}

function dateRangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function getTierValidDays(tier) {
  const restriction = String(tier.dayRestriction || "").toLowerCase();

  if (restriction === "mon_tue") return [1, 2];

  // Backward-compatible rule for the current pricing schema: the standard 2-day
  // tier excludes Mon/Tue because those days belong to the discounted tier.
  if (tier.tierKey === "2day_standard") return [0, 3, 4, 5, 6];

  return null;
}

function isStartDayAllowed(d, tier) {
  const validDays = getTierValidDays(tier);
  return !validDays || validDays.includes(d.getDay());
}

function buildBlockedDates({ rentals, units, sizeYards, today, windowEnd }) {
  const unitsForSize = units.filter((u) => Number(u.size_yards) === sizeYards);
  const activeUnitIds = new Set(
    unitsForSize
      .filter((u) => u.status !== "maintenance")
      .map((u) => u.id)
  );

  const unitCapacity = activeUnitIds.size;
  const staleDeployedUnitIds = new Set(
    unitsForSize
      .filter((u) => u.status === "deployed")
      .map((u) => u.id)
  );

  const blocked = new Set();
  const cur = new Date(today);

  while (cur <= windowEnd) {
    const nextDay = addDays(cur, 1);
    let used = 0;

    for (const rental of rentals) {
      if (Number(rental.size_yards) !== sizeYards) continue;

      const range = normalizeDateRange(rental);
      if (!range) continue;

      if (!dateRangesOverlap(cur, nextDay, range.start, range.end)) continue;

      // Assigned rentals consume their assigned unit. Unassigned rentals still
      // consume one unit of capacity because the operation has committed space.
      used += 1;
    }

    if (unitCapacity <= 0 || used >= unitCapacity) {
      blocked.add(toDateStr(cur));
    }

    cur.setDate(cur.getDate() + 1);
  }

  return {
    blocked,
    unitCapacity,
    staleDeployedUnitCount: staleDeployedUnitIds.size,
  };
}

function isWindowClear(start, durationDays, blocked, today, windowEnd) {
  if (start <= today) return false;
  if (start > windowEnd) return false;

  for (let i = 0; i < durationDays; i += 1) {
    const day = addDays(start, i);
    if (day > windowEnd) return false;
    if (blocked.has(toDateStr(day))) return false;
  }

  return true;
}

function buildWindows(tier, blocked, today, windowEnd) {
  const durationDays = Number(tier.durationDays || 0);
  if (!durationDays) return [];

  const windows = [];
  const cur = addDays(today, 1);

  while (cur <= windowEnd && windows.length < MAX_WINDOWS_PER_TIER) {
    if (isStartDayAllowed(cur, tier) && isWindowClear(cur, durationDays, blocked, today, windowEnd)) {
      const end = addDays(cur, durationDays);
      windows.push({
        start: toDateStr(cur),
        end: toDateStr(end),
        startLabel: formatDisplay(cur),
        endLabel: formatDisplay(end),
        startIso: cur.toISOString(),
        endIso: end.toISOString(),
      });
    }

    cur.setDate(cur.getDate() + 1);
  }

  return windows;
}

async function getUnitsAndRentals(supabase, sizeYards, today, windowEnd) {
  const holdCutoff = new Date(Date.now() - HOLD_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const [unitsRes, blockingRentalsRes, pendingHoldsRes] = await Promise.all([
    supabase
      .from("units")
      .select("id, name, size_yards, status")
      .eq("size_yards", sizeYards),
    supabase
      .from("rentals")
      .select("id, unit_id, size_yards, status, dropoff_date, scheduled_return")
      .eq("size_yards", sizeYards)
      .in("status", BLOCKING_RENTAL_STATUSES)
      .lt("dropoff_date", toDateStr(addDays(windowEnd, 1)))
      .gt("scheduled_return", toDateStr(today)),
    supabase
      .from("rentals")
      .select("id, unit_id, size_yards, status, dropoff_date, scheduled_return, stripe_session_id, created_at")
      .eq("size_yards", sizeYards)
      .eq("status", HOLD_RENTAL_STATUS)
      .not("stripe_session_id", "is", null)
      .lt("dropoff_date", toDateStr(addDays(windowEnd, 1)))
      .gt("scheduled_return", toDateStr(today))
      .gte("created_at", holdCutoff),
  ]);

  if (unitsRes.error) throw unitsRes.error;
  if (blockingRentalsRes.error) throw blockingRentalsRes.error;
  if (pendingHoldsRes.error) throw pendingHoldsRes.error;

  return {
    units: unitsRes.data || [],
    rentals: [
      ...(blockingRentalsRes.data || []),
      ...(pendingHoldsRes.data || []),
    ],
    blockingRentals: blockingRentalsRes.data || [],
    pendingHolds: pendingHoldsRes.data || [],
  };
}

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

  try {
    assertServerOnly();

    const { size, sizeYards, sizeCode } = req.body || {};
    const normalizedSizeYards = normalizeSizeYards(sizeYards || sizeCode || size);

    if (!normalizedSizeYards) {
      return res.status(400).json({ error: "Invalid size" });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = addDays(today, WINDOW_DAYS);

    const supabase = getSupabaseAdmin();
    const pricingConfig = await getPricingConfig();
    const { units, rentals, blockingRentals, pendingHolds } = await getUnitsAndRentals(
      supabase,
      normalizedSizeYards,
      today,
      windowEnd
    );

    const { blocked, unitCapacity, staleDeployedUnitCount } = buildBlockedDates({
      rentals,
      units,
      sizeYards: normalizedSizeYards,
      today,
      windowEnd,
    });

    const available = {};
    for (const tier of pricingConfig.pricing) {
      available[tier.tierKey] = buildWindows(tier, blocked, today, windowEnd);
    }

    return res.status(200).json({
      size,
      sizeYards: normalizedSizeYards,
      available,
      blockedDates: [...blocked].sort(),
      debug: process.env.NODE_ENV !== "production" || process.env.AVAILABILITY_DEBUG === "true"
        ? {
            unitCount: units.length,
            activeUnitCount: units.filter((u) => u.status !== "maintenance").length,
            unitCapacity,
            staleDeployedUnitCount,
            blockingRentalCount: blockingRentals.length,
            pendingHoldCount: pendingHolds.length,
            tierKeys: pricingConfig.pricing.map((t) => t.tierKey),
          }
        : undefined,
    });
  } catch (err) {
    console.error("[availability] FAILED", err);

    return res.status(500).json({
      error: err.message || "Failed to load availability",
    });
  }
}
