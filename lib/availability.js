// lib/availability.js
import { getSupabaseAdmin, assertServerOnly } from "./supabaseAdmin";

const BLOCKING_BOOKING_STATUSES = ["paid_pending_review", "reserved", "on_rent"];
const BLOCKING_HOLD_STATUS = "active";
const ACTIVE_UNIT_STATUS = "active";
const READY_STATUS = "ready";
const NEEDS_EMPTYING_STATUS = "needs_emptying";

function toIsoString(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date for ${fieldName}`);
  }

  return date.toISOString();
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function isTightWindow(startAtIso, now = new Date()) {
  const start = new Date(startAtIso).getTime();
  const current = now.getTime();
  const diffHours = (start - current) / (1000 * 60 * 60);

  return diffHours <= 24;
}

function indexUnitsById(units) {
  const map = new Map();

  for (const unit of units) {
    map.set(unit.id, unit);
  }

  return map;
}

function buildUnitResult(unit, reason) {
  return {
    id: unit.id,
    unit_code: unit.unit_code,
    size_code: unit.size_code,
    lifecycle_status: unit.lifecycle_status,
    readiness_status: unit.readiness_status,
    blockingReason: reason,
  };
}

async function getCandidateUnits(supabase, sizeCode) {
  const { data, error } = await supabase
    .from("dumpster_units")
    .select("id, unit_code, size_code, lifecycle_status, readiness_status")
    .eq("size_code", sizeCode)
    .eq("lifecycle_status", ACTIVE_UNIT_STATUS)
    .order("unit_code", { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getBlockingBookings(supabase, sizeCode, startAtIso, endAtIso) {
  const { data, error } = await supabase
    .from("rental_bookings")
    .select(
      "id, size_code, dumpster_unit_id, status, scheduled_start_at, scheduled_end_at, delivery_date, expected_return_date"
    )
    .eq("size_code", sizeCode)
    .in("status", BLOCKING_BOOKING_STATUSES)
    .lt("scheduled_start_at", endAtIso)
    .gt("scheduled_end_at", startAtIso);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getBlockingHolds(supabase, sizeCode, startAtIso, endAtIso, nowIso) {
  const { data, error } = await supabase
    .from("booking_holds")
    .select(
      "id, size_code, status, requested_start_at, requested_end_at, expires_at, stripe_checkout_session_id, odoo_lead_id"
    )
    .eq("size_code", sizeCode)
    .eq("status", BLOCKING_HOLD_STATUS)
    .gt("expires_at", nowIso)
    .lt("requested_start_at", endAtIso)
    .gt("requested_end_at", startAtIso);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function getBlockingBlackouts(supabase, sizeCode, startAtIso, endAtIso) {
  const { data, error } = await supabase
    .from("blackout_dates")
    .select("id, scope, dumpster_unit_id, size_code, start_at, end_at, reason, notes")
    .lt("start_at", endAtIso)
    .gt("end_at", startAtIso);

  if (error) {
    throw error;
  }

  return (data ?? []).filter((row) => {
    if (row.scope === "size" && row.size_code === sizeCode) {
      return true;
    }

    if (row.scope === "unit") {
      return true;
    }

    return false;
  });
}

function applyReadinessRules(units, startAtIso, now = new Date()) {
  const tightWindow = isTightWindow(startAtIso, now);

  const available = [];
  const blocked = [];

  for (const unit of units) {
    if (unit.readiness_status === READY_STATUS) {
      available.push(unit);
      continue;
    }

    if (unit.readiness_status === NEEDS_EMPTYING_STATUS) {
      if (tightWindow) {
        blocked.push(buildUnitResult(unit, "needs_emptying_tight_window"));
      } else {
        available.push(unit);
      }
      continue;
    }

    blocked.push(buildUnitResult(unit, "unknown_readiness_status"));
  }

  return { available, blocked, tightWindow };
}

export async function getAvailabilitySnapshot({
  sizeCode,
  requestedStartAt,
  requestedEndAt,
  now = new Date(),
}) {
  assertServerOnly();

  if (!sizeCode) {
    throw new Error("sizeCode is required");
  }

  const startAtIso = toIsoString(requestedStartAt, "requestedStartAt");
  const endAtIso = toIsoString(requestedEndAt, "requestedEndAt");
  const nowIso = toIsoString(now, "now");

  if (new Date(endAtIso) <= new Date(startAtIso)) {
    throw new Error("requestedEndAt must be after requestedStartAt");
  }

  const supabase = getSupabaseAdmin();

  const [candidateUnits, bookings, holds, blackouts] = await Promise.all([
    getCandidateUnits(supabase, sizeCode),
    getBlockingBookings(supabase, sizeCode, startAtIso, endAtIso),
    getBlockingHolds(supabase, sizeCode, startAtIso, endAtIso, nowIso),
    getBlockingBlackouts(supabase, sizeCode, startAtIso, endAtIso),
  ]);

  const unitMap = indexUnitsById(candidateUnits);
  const readiness = applyReadinessRules(candidateUnits, startAtIso, now);

  const blockedUnits = [...readiness.blocked];
  const availableUnitIds = new Set(readiness.available.map((unit) => unit.id));

  const sizeLevelBlackouts = [];
  const unitLevelBlackouts = [];

  for (const blackout of blackouts) {
    if (blackout.scope === "size" && blackout.size_code === sizeCode) {
      sizeLevelBlackouts.push(blackout);
      continue;
    }

    if (blackout.scope === "unit" && blackout.dumpster_unit_id) {
      unitLevelBlackouts.push(blackout);
    }
  }

  for (const blackout of unitLevelBlackouts) {
    const unit = unitMap.get(blackout.dumpster_unit_id);

    if (!unit || !availableUnitIds.has(unit.id)) {
      continue;
    }

    availableUnitIds.delete(unit.id);
    blockedUnits.push(buildUnitResult(unit, `blackout:${blackout.reason}`));
  }

  const assignedBookingBlocks = [];
  const unassignedBookingCount = bookings.filter(
    (booking) => !booking.dumpster_unit_id
  ).length;

  for (const booking of bookings) {
    if (!booking.dumpster_unit_id) {
      continue;
    }

    const unit = unitMap.get(booking.dumpster_unit_id);

    if (!unit || !availableUnitIds.has(unit.id)) {
      continue;
    }

    availableUnitIds.delete(unit.id);
    blockedUnits.push(buildUnitResult(unit, `booking:${booking.status}`));
    assignedBookingBlocks.push(booking.id);
  }

  const availableAfterAssignedBookings = Array.from(availableUnitIds).map((id) =>
    unitMap.get(id)
  );

  const holdBlocks = [];
  let remainingAvailableIds = new Set(availableAfterAssignedBookings.map((u) => u.id));

  for (const hold of holds) {
    if (remainingAvailableIds.size === 0) {
      break;
    }

    const firstAvailableId = remainingAvailableIds.values().next().value;
    const unit = unitMap.get(firstAvailableId);

    if (!unit) {
      continue;
    }

    remainingAvailableIds.delete(firstAvailableId);
    blockedUnits.push(buildUnitResult(unit, `hold:${hold.id}`));
    holdBlocks.push(hold.id);
  }

  const availableUnits = Array.from(remainingAvailableIds).map((id) => unitMap.get(id));

  let availableUnitCount = availableUnits.length;

  if (sizeLevelBlackouts.length > 0) {
    availableUnitCount = 0;
  }

  return {
    request: {
      sizeCode,
      requestedStartAt: startAtIso,
      requestedEndAt: endAtIso,
      evaluatedAt: nowIso,
    },
    totals: {
      candidateUnits: candidateUnits.length,
      availableUnits: availableUnitCount,
      blockedUnits: blockedUnits.length,
      blockingBookings: bookings.length,
      blockingHolds: holds.length,
      blockingBlackouts: blackouts.length,
      sizeLevelBlackouts: sizeLevelBlackouts.length,
      unassignedBlockingBookings: unassignedBookingCount,
      tightWindow: readiness.tightWindow,
    },
    availableUnits: sizeLevelBlackouts.length > 0 ? [] : availableUnits,
    blockedUnits,
    debug: {
      bookings,
      holds,
      blackouts,
      assignedBookingBlocks,
      holdBlocks,
    },
  };
}
