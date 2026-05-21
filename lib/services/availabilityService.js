// lib/services/availabilityService.js
// Shared Supabase-backed availability engine.
// Source of truth:
// - public.dumpster_units
// - public.availability_commitments
// - public.availability_settings
// - public.booking_holds
// - public.availability_audit_log

import { getSupabaseAdmin, assertServerOnly } from "../supabaseAdmin";
import { getPricingConfig, normalizeSizeYards, sizeYardsToCode, sizeYardsToLabel } from "../pricingService";

const DEFAULT_WINDOW_DAYS = 90;
const DEFAULT_ONLINE_HOLD_MINUTES = 10;
const DEFAULT_MANUAL_HOLD_MINUTES = 30;
const MAX_WINDOWS_PER_TIER = 4;
// Covers both legacy "status" values and dumpster_units readiness_status / lifecycle_status values.
const NON_RENTABLE_UNIT_STATUSES = new Set([
  "maintenance", "retired", "unavailable", "out_of_service",
  "inactive", "decommissioned", "repair", "damaged",
]);
const DEFAULT_BLOCKING_STATUSES = ["confirmed", "active"];

export function toDateStr(d) {
  const date = d instanceof Date ? d : new Date(d);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function pick(row, keys, fallback = null) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return fallback;
}

function pickNumber(row, keys, fallback = 0) {
  const n = Number(pick(row, keys, fallback));
  return Number.isFinite(n) ? n : fallback;
}

function formatDisplay(d) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function dateRangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function getTierValidDays(tier) {
  const restriction = String(tier?.dayRestriction || "").toLowerCase();
  if (restriction === "mon_tue") return [1, 2];
  if (tier?.tierKey === "2day_standard") return [0, 3, 4, 5, 6];
  return null;
}

function isStartDayAllowed(d, tier) {
  const validDays = getTierValidDays(tier);
  return !validDays || validDays.includes(d.getDay());
}

async function getAvailabilitySettings(supabase) {
  const defaults = {
    holdExpiryMinutes: DEFAULT_MANUAL_HOLD_MINUTES,
    onlineHoldExpiryMinutes: DEFAULT_ONLINE_HOLD_MINUTES,
    manualHoldExpiryMinutes: DEFAULT_MANUAL_HOLD_MINUTES,
    availabilityWindowDays: DEFAULT_WINDOW_DAYS,
    sameDayTurnaroundAllowed: true,
    blockingRentalStatuses: DEFAULT_BLOCKING_STATUSES,
  };

  const { data, error } = await supabase.from("availability_settings").select("*").limit(20);
  if (error) {
    console.warn("[availabilityService] availability_settings unavailable; using defaults:", error.message);
    return defaults;
  }

  const rows = data || [];
  const byKey = rows.reduce((acc, row) => {
    const key = pick(row, ["key", "setting_key", "name"], "");
    if (key) acc[key] = pick(row, ["value", "setting_value"], row);
    return acc;
  }, {});
  const singleton = rows[0] || {};

  const holdExpiryMinutes = Number(byKey.hold_expiry_minutes || pick(singleton, ["hold_expiry_minutes", "holdExpiryMinutes"], defaults.holdExpiryMinutes));
  const onlineHoldExpiryMinutes = Number(byKey.online_hold_expiry_minutes || pick(singleton, ["online_hold_expiry_minutes", "onlineHoldExpiryMinutes"], DEFAULT_ONLINE_HOLD_MINUTES));
  const manualHoldExpiryMinutes = Number(byKey.manual_hold_expiry_minutes || pick(singleton, ["manual_hold_expiry_minutes", "manualHoldExpiryMinutes"], holdExpiryMinutes || DEFAULT_MANUAL_HOLD_MINUTES));
  const availabilityWindowDays = Number(byKey.availability_window_days || pick(singleton, ["availability_window_days", "availabilityWindowDays"], DEFAULT_WINDOW_DAYS));
  const sameDayRaw = byKey.same_day_turnaround_allowed ?? pick(singleton, ["same_day_turnaround_allowed", "sameDayTurnaroundAllowed"], true);
  const blockingRaw = byKey.blocking_rental_statuses ?? pick(singleton, ["blocking_rental_statuses", "blockingRentalStatuses"], DEFAULT_BLOCKING_STATUSES);

  return {
    holdExpiryMinutes: Number.isFinite(holdExpiryMinutes) ? holdExpiryMinutes : defaults.holdExpiryMinutes,
    onlineHoldExpiryMinutes: Number.isFinite(onlineHoldExpiryMinutes) ? onlineHoldExpiryMinutes : defaults.onlineHoldExpiryMinutes,
    manualHoldExpiryMinutes: Number.isFinite(manualHoldExpiryMinutes) ? manualHoldExpiryMinutes : defaults.manualHoldExpiryMinutes,
    availabilityWindowDays: Number.isFinite(availabilityWindowDays) ? availabilityWindowDays : defaults.availabilityWindowDays,
    sameDayTurnaroundAllowed: sameDayRaw === true || String(sameDayRaw).toLowerCase() === "true",
    blockingRentalStatuses: Array.isArray(blockingRaw) ? blockingRaw : DEFAULT_BLOCKING_STATUSES,
  };
}

function normalizeUnit(row) {
  // dumpster_units uses size_code (e.g. "11YD") not size_yards.
  // Try size_code first, then fall back to numeric columns for legacy schemas.
  const sizeYards = normalizeSizeYards(pick(row, ["size_code", "sizeCode", "size_yards", "sizeYards", "yards", "size"]));

  // dumpster_units uses readiness_status ("ready" | "deployed" | …) and
  // lifecycle_status ("active" | "maintenance" | "retired" | …).
  // Map to the single "status" the rest of the service depends on.
  const readiness = asString(pick(row, ["readiness_status", "status", "unit_status"], "ready")).toLowerCase();
  const lifecycle = asString(pick(row, ["lifecycle_status"], "active")).toLowerCase();

  // A unit is non-rentable if its lifecycle is out of service, OR if
  // readiness maps to a non-rentable state.
  let status = readiness || "ready";
  if (["retired", "out_of_service", "inactive"].includes(lifecycle)) {
    status = lifecycle;
  }

  return {
    id: pick(row, ["id", "unit_id", "dumpster_unit_id"]),
    name: pick(row, ["unit_code", "name", "unit_number", "label"], ""),
    sizeYards,
    sizeCode: sizeYards ? sizeYardsToCode(sizeYards) : "",
    status,
    raw: row,
  };
}

function normalizeCommitment(row) {
  const sizeYards = normalizeSizeYards(pick(row, ["size_yards", "sizeYards", "yards", "size", "size_code", "sizeCode", "dumpster_size"]));
  const start = parseDateOnly(pick(row, [
    "start_date",
    "dropoff_date",
    "requested_start_date",
    "requested_start_at",
    "start_at",
    "starts_at",
    "start",
    "commitment_start",
    "commitment_start_date",
    "window_start",
    "blocked_start_date",
  ]));
  const end = parseDateOnly(pick(row, [
    "return_date",
    "scheduled_return",
    "end_date",
    "requested_end_date",
    "requested_end_at",
    "end_at",
    "ends_at",
    "end",
    "commitment_end",
    "commitment_end_date",
    "window_end",
    "blocked_end_date",
  ]));
  // availability_commitments view uses "commitment_type" not "type".
  const type = asString(pick(row, ["commitment_type", "type", "source", "kind"], "commitment")).toLowerCase();
  const status = asString(pick(row, ["status", "rental_status", "hold_status"], "active")).toLowerCase();
  const scope = asString(pick(row, ["scope", "blackout_scope"], "")).toLowerCase();
  const expiresAtRaw = pick(row, ["expires_at", "hold_expires_at", "expiresAt"], null);
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;

  return {
    id: pick(row, ["id", "commitment_id", "rental_id", "hold_id", "blackout_id"]),
    type,
    status,
    scope,
    sizeYards,
    sizeCode: sizeYards ? sizeYardsToCode(sizeYards) : "",
    unitId: pick(row, ["dumpster_unit_id", "unit_id"], null),
    quantity: Math.max(1, pickNumber(row, ["quantity", "capacity_units", "units_blocked"], 1)),
    start,
    end,
    expiresAt,
    raw: row,
  };
}

function isCommitmentActive(commitment, now = new Date()) {
  if (!commitment.start || !commitment.end) return false;
  if (commitment.expiresAt && commitment.expiresAt <= now) return false;
  if (["cancelled", "canceled", "expired", "released", "converted", "completed"].includes(commitment.status)) return false;
  return true;
}

function isGlobalBlackout(commitment) {
  return commitment.scope === "global" || commitment.type === "global_blackout" || (commitment.type.includes("blackout") && !commitment.sizeYards && !commitment.unitId);
}

function evaluateWindowFromData({ sizeYards, startDate, endDate, capacityBySize, commitments }) {
  const normalizedSizeYards = normalizeSizeYards(sizeYards);
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!normalizedSizeYards || !start || !end || end <= start) {
    throw new Error("Valid sizeYards, startDate, and endDate are required");
  }

  const sizeCode = sizeYardsToCode(normalizedSizeYards);
  const capacity = capacityBySize[sizeCode]?.total || 0;
  const overlapping = commitments.filter((commitment) => dateRangesOverlap(start, end, commitment.start, commitment.end));
  const globalBlackout = overlapping.find(isGlobalBlackout) || null;
  const usedCapacity = globalBlackout ? capacity : overlapping.reduce((sum, commitment) => {
    if (isGlobalBlackout(commitment)) return sum;
    if (commitment.sizeYards && commitment.sizeYards !== normalizedSizeYards) return sum;
    return sum + commitment.quantity;
  }, 0);
  const availableUnits = Math.max(0, capacity - usedCapacity);

  return {
    sizeYards: normalizedSizeYards,
    sizeCode,
    start: toDateStr(start),
    end: toDateStr(end),
    capacity,
    usedCapacity,
    availableUnits,
    available: availableUnits > 0 && !globalBlackout,
    globalBlackout: Boolean(globalBlackout),
    blockingCommitmentCount: overlapping.length,
    reason: globalBlackout ? "global_blackout" : availableUnits > 0 ? "available" : "capacity_full",
  };
}

export async function getFleetCapacity({ sizeYards } = {}) {
  assertServerOnly();
  const supabase = getSupabaseAdmin();
  const normalizedSizeYards = normalizeSizeYards(sizeYards);
  let query = supabase.from("dumpster_units").select("*");
  // dumpster_units uses size_code ("11YD") not a numeric size_yards column.
  if (normalizedSizeYards) query = query.eq("size_code", sizeYardsToCode(normalizedSizeYards));
  const { data, error } = await query;
  if (error) throw error;

  const units = (data || []).map(normalizeUnit).filter((unit) => unit.sizeYards);
  const rentableUnits = units.filter((unit) => !NON_RENTABLE_UNIT_STATUSES.has(unit.status));
  const bySize = rentableUnits.reduce((acc, unit) => {
    const key = unit.sizeCode;
    if (!acc[key]) acc[key] = { sizeYards: unit.sizeYards, total: 0, units: [] };
    acc[key].total += 1;
    acc[key].units.push(unit);
    return acc;
  }, {});

  return { units, rentableUnits, bySize };
}

export async function getActiveCommitments({ sizeYards, startDate, endDate, now = new Date() } = {}) {
  assertServerOnly();
  const supabase = getSupabaseAdmin();
  const normalizedSizeYards = normalizeSizeYards(sizeYards);
  const start = parseDateOnly(startDate) || new Date(new Date().setHours(0, 0, 0, 0));
  const end = parseDateOnly(endDate) || addDays(start, DEFAULT_WINDOW_DAYS);

  // Do not filter by date in Supabase here. availability_commitments is a view
  // assembled from multiple sources, and its physical column names may change.
  // Pull the normalized rows and apply the half-open overlap rule in code so a
  // column-name mismatch cannot make the live funnel fall back to "all open".
  const { data, error } = await supabase
    .from("availability_commitments")
    .select("*");

  if (error) throw error;

  return (data || [])
    .map(normalizeCommitment)
    .filter((commitment) => isCommitmentActive(commitment, now))
    .filter((commitment) => dateRangesOverlap(start, end, commitment.start, commitment.end))
    .filter((commitment) => {
      if (!normalizedSizeYards) return true;
      return isGlobalBlackout(commitment) || !commitment.sizeYards || commitment.sizeYards === normalizedSizeYards;
    });
}

export async function evaluateWindow({ sizeYards, startDate, endDate, now = new Date(), audit = false, source = "availabilityService" } = {}) {
  assertServerOnly();
  const normalizedSizeYards = normalizeSizeYards(sizeYards);
  if (!normalizedSizeYards) throw new Error("Valid sizeYards is required");

  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end <= start) throw new Error("Valid startDate and endDate are required");

  const [{ bySize }, commitments] = await Promise.all([
    getFleetCapacity({ sizeYards: normalizedSizeYards }),
    getActiveCommitments({ sizeYards: normalizedSizeYards, startDate: start, endDate: end, now }),
  ]);

  const result = evaluateWindowFromData({ sizeYards: normalizedSizeYards, startDate: start, endDate: end, capacityBySize: bySize, commitments });
  if (audit) await logAvailabilityDecision({ source, decision: result, request: { sizeYards, startDate, endDate } });
  return result;
}

function isWindowClear(start, durationDays, blocked, today, windowEnd) {
  if (start <= today || start > windowEnd) return false;
  for (let i = 0; i < durationDays; i += 1) {
    const day = addDays(start, i);
    if (day > windowEnd || blocked.has(toDateStr(day))) return false;
  }
  return true;
}

function buildWindows(tier, blocked, today, windowEnd, maxWindows = MAX_WINDOWS_PER_TIER, price = null) {
  const durationDays = Number(tier?.durationDays || 0);
  if (!durationDays) return [];
  const windows = [];
  const cur = addDays(today, 1);
  while (cur <= windowEnd && windows.length < maxWindows) {
    if (isStartDayAllowed(cur, tier) && isWindowClear(cur, durationDays, blocked, today, windowEnd)) {
      const end = addDays(cur, durationDays);
      windows.push({
        tierKey: tier.tierKey,
        displayLabel: tier.displayLabel,
        durationDays,
        start: toDateStr(cur),
        end: toDateStr(end),
        startLabel: formatDisplay(cur),
        endLabel: formatDisplay(end),
        startIso: cur.toISOString(),
        endIso: end.toISOString(),
        ...(price !== null ? { price } : {}),
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return windows;
}

function buildBlockedDatesFromData({ sizeYards, today, windowEnd, capacityBySize, commitments }) {
  const normalizedSizeYards = normalizeSizeYards(sizeYards);
  const blocked = new Set();
  const cur = new Date(today);
  while (cur <= windowEnd) {
    const nextDay = addDays(cur, 1);
    const result = evaluateWindowFromData({
      sizeYards: normalizedSizeYards,
      startDate: cur,
      endDate: nextDay,
      capacityBySize,
      commitments,
    });
    if (!result.available) blocked.add(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return blocked;
}

export async function getTierAvailability({ sizeYards, tier, today, windowEnd, maxWindows = MAX_WINDOWS_PER_TIER, price = null } = {}) {
  const normalizedSizeYards = normalizeSizeYards(sizeYards);
  const [{ bySize }, commitments] = await Promise.all([
    getFleetCapacity({ sizeYards: normalizedSizeYards }),
    getActiveCommitments({ sizeYards: normalizedSizeYards, startDate: today, endDate: windowEnd }),
  ]);
  const blocked = buildBlockedDatesFromData({ sizeYards: normalizedSizeYards, today, windowEnd, capacityBySize: bySize, commitments });
  return buildWindows(tier, blocked, today, windowEnd, maxWindows, price);
}

export async function getAvailabilityCalendar({ sizeYards, maxWindows = MAX_WINDOWS_PER_TIER } = {}) {
  assertServerOnly();
  const normalizedSizeYards = normalizeSizeYards(sizeYards);
  if (!normalizedSizeYards) throw new Error("Valid sizeYards is required");
  const supabase = getSupabaseAdmin();
  const settings = await getAvailabilitySettings(supabase);
  const pricingConfig = await getPricingConfig();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = addDays(today, settings.availabilityWindowDays || DEFAULT_WINDOW_DAYS);

  const [{ bySize }, commitments] = await Promise.all([
    getFleetCapacity({ sizeYards: normalizedSizeYards }),
    getActiveCommitments({ sizeYards: normalizedSizeYards, startDate: today, endDate: windowEnd }),
  ]);

  const blocked = buildBlockedDatesFromData({ sizeYards: normalizedSizeYards, today, windowEnd, capacityBySize: bySize, commitments });
  const available = {};
  for (const tier of pricingConfig.pricing) {
    available[tier.tierKey] = buildWindows(tier, blocked, today, windowEnd, maxWindows);
  }

  const sizeCode = sizeYardsToCode(normalizedSizeYards);
  return {
    sizeYards: normalizedSizeYards,
    sizeCode,
    available,
    blockedDates: [...blocked].sort(),
    debug: {
      capacity: bySize[sizeCode]?.total || 0,
      commitmentCount: commitments.length,
      settings,
      tierKeys: pricingConfig.pricing.map((t) => t.tierKey),
    },
  };
}

export async function getCsrAvailabilitySummary() {
  assertServerOnly();
  const { units, bySize } = await getFleetCapacity();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = addDays(today, 1);
  const commitments = await getActiveCommitments({ startDate: today, endDate: tomorrow });
  const counts = {
    totalUnits: units.length,
    bySize: {
      "11YD": { total: 0, available: 0, deployed: 0, maintenance: 0, reserved: 0, ready: 0 },
      "16YD": { total: 0, available: 0, deployed: 0, maintenance: 0, reserved: 0, ready: 0 },
      "21YD": { total: 0, available: 0, deployed: 0, maintenance: 0, reserved: 0, ready: 0 },
    },
  };

  for (const unit of units) {
    const bucket = counts.bySize[unit.sizeCode];
    if (!bucket) continue;
    bucket.total += 1;
    if (unit.status === "deployed") bucket.deployed += 1;
    else if (NON_RENTABLE_UNIT_STATUSES.has(unit.status)) bucket.maintenance += 1;
    else bucket.available += 1;
  }

  for (const sizeCode of Object.keys(counts.bySize)) {
    const yards = normalizeSizeYards(sizeCode);
    const evalNow = evaluateWindowFromData({ sizeYards: yards, startDate: today, endDate: tomorrow, capacityBySize: bySize, commitments });
    const bucket = counts.bySize[sizeCode];
    bucket.ready = evalNow.availableUnits;
    bucket.reserved = Math.max(0, (bySize[sizeCode]?.total || 0) - evalNow.availableUnits);
  }

  return { counts, units: units.map((u) => u.raw) };
}

function getHoldMinutes(type, settings) {
  const t = asString(type || "online_checkout").toLowerCase();
  if (t === "manual_checkout_link" || t === "manual") return settings.manualHoldExpiryMinutes || DEFAULT_MANUAL_HOLD_MINUTES;
  return settings.onlineHoldExpiryMinutes || DEFAULT_ONLINE_HOLD_MINUTES;
}

export async function createBookingHold({ sizeYards, startDate, endDate, customerId = null, holdType = "online_checkout", holdMinutesOverride = null, source = "funnel", metadata = {} } = {}) {
  assertServerOnly();
  const supabase = getSupabaseAdmin();
  const settings = await getAvailabilitySettings(supabase);
  const evaluation = await evaluateWindow({ sizeYards, startDate, endDate, source: "createBookingHold", audit: true });
  if (!evaluation.available) {
    const err = new Error("No units available for the requested window.");
    err.availability = evaluation;
    throw err;
  }

  const holdMinutes = holdMinutesOverride || getHoldMinutes(holdType, settings);
  const expiresAt = new Date(Date.now() + holdMinutes * 60 * 1000).toISOString();
  const normalizedSizeYards = normalizeSizeYards(sizeYards);
  const normalizedSizeCode = sizeYardsToCode(normalizedSizeYards);
  const start = toDateStr(parseDateOnly(startDate));
  const end = toDateStr(parseDateOnly(endDate));

  // Build timestamps for requested_start_at / requested_end_at (NOT NULL on table).
  // Use noon UTC to avoid timezone boundary issues.
  const requestedStartAt = `${start}T12:00:00+00:00`;
  const requestedEndAt = `${end}T12:00:00+00:00`;

  const base = {
    size_code: normalizedSizeCode,
    size_yards: normalizedSizeYards,
    requested_start_at: requestedStartAt,
    requested_end_at: requestedEndAt,
    delivery_date: start,
    rental_option: asString(metadata?.rentalOption || holdType || ""),
    hold_type: holdType,
    status: "active",
    start_date: start,
    return_date: end,
    dropoff_date: start,
    scheduled_return: end,
    expires_at: expiresAt,
    source,
    metadata,
  };

  // Single attempt — all required columns are now present.
  const attempts = [base];

  let lastError = null;
  for (const payload of attempts) {
    const { data, error } = await supabase.from("booking_holds").insert(payload).select("*").single();
    if (!error) return { hold: data, availability: evaluation, expiresAt, holdMinutes };
    lastError = error;
    if (!String(error.message || "").includes("column")) break;
  }
  throw lastError;
}

export async function markBookingHoldConverted({ holdId, rentalId, stripeSessionId } = {}) {
  assertServerOnly();
  const supabase = getSupabaseAdmin();
  const payloads = [
    { status: "converted", converted_at: new Date().toISOString(), rental_id: rentalId, stripe_session_id: stripeSessionId },
    { status: "converted", rental_id: rentalId },
    { status: "converted" },
  ];
  for (const payload of payloads) {
    const { error } = await supabase.from("booking_holds").update(payload).eq("id", holdId);
    if (!error) return true;
  }
  return false;
}

export async function logAvailabilityDecision({ source = "availabilityService", request = {}, decision = {} } = {}) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("availability_audit_log").insert({
      source,
      request,
      decision,
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[availabilityService] audit log skipped:", err.message);
  }
}

export function summarizeSizeLabel(value) {
  const yards = normalizeSizeYards(value);
  return yards ? sizeYardsToLabel(yards) : "";
}
