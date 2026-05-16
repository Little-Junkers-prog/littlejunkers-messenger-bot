// lib/availability.js
// Queries public.units and public.rentals (Supabase source of truth)
import { getSupabaseAdmin, assertServerOnly } from "./supabaseAdmin";

// Rental statuses that block availability
const BLOCKING_RENTAL_STATUSES = ["confirmed", "active"];

// Pending rentals with a stripe_session_id are in-flight Stripe checkouts — soft block
const HOLD_RENTAL_STATUS = "pending";
const HOLD_EXPIRY_MINUTES = 30;

function toIsoString(value, fieldName) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date for ${fieldName}`);
  }
  return date.toISOString();
}

function isTightWindow(startAtIso, now = new Date()) {
  const diffHours = (new Date(startAtIso).getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours <= 24;
}

function sizeCodeToYards(sizeCode) {
  const map = { "11YD": 11, "16YD": 16, "21YD": 21 };
  return map[sizeCode] || null;
}

function buildUnitResult(unit, reason) {
  return {
    id: unit.id,
    name: unit.name,
    size_yards: unit.size_yards,
    status: unit.status,
    blockingReason: reason,
  };
}

async function getCandidateUnits(supabase, sizeYards) {
  const { data, error } = await supabase
    .from("units")
    .select("id, name, size_yards, status")
    .eq("size_yards", sizeYards)
    .neq("status", "maintenance")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

async function getBlockingRentals(supabase, sizeYards, dropoffDate, returnDate) {
  const { data, error } = await supabase
    .from("rentals")
    .select("id, unit_id, size_yards, status, dropoff_date, scheduled_return")
    .eq("size_yards", sizeYards)
    .in("status", BLOCKING_RENTAL_STATUSES)
    .lt("dropoff_date", returnDate)
    .gt("scheduled_return", dropoffDate);

  if (error) throw error;
  return data ?? [];
}

async function getPendingHolds(supabase, sizeYards, dropoffDate, returnDate) {
  const holdCutoff = new Date(Date.now() - HOLD_EXPIRY_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("rentals")
    .select("id, unit_id, size_yards, status, dropoff_date, scheduled_return, stripe_session_id, created_at")
    .eq("size_yards", sizeYards)
    .eq("status", HOLD_RENTAL_STATUS)
    .not("stripe_session_id", "is", null)
    .lt("dropoff_date", returnDate)
    .gt("scheduled_return", dropoffDate)
    .gte("created_at", holdCutoff);

  if (error) throw error;
  return data ?? [];
}

export async function getAvailabilitySnapshot({
  sizeCode,
  requestedStartAt,
  requestedEndAt,
  now = new Date(),
}) {
  assertServerOnly();

  if (!sizeCode) throw new Error("sizeCode is required");

  const sizeYards = sizeCodeToYards(sizeCode);
  if (!sizeYards) throw new Error(`Invalid sizeCode: ${sizeCode}`);

  const startAtIso = toIsoString(requestedStartAt, "requestedStartAt");
  const endAtIso = toIsoString(requestedEndAt, "requestedEndAt");
  const nowIso = toIsoString(now, "now");

  if (new Date(endAtIso) <= new Date(startAtIso)) {
    throw new Error("requestedEndAt must be after requestedStartAt");
  }

  // Sprint 2A schema uses date columns (not timestamptz) for dropoff/return
  const dropoffDate = startAtIso.slice(0, 10);
  const returnDate = endAtIso.slice(0, 10);

  const supabase = getSupabaseAdmin();

  const [candidateUnits, blockingRentals, pendingHolds] = await Promise.all([
    getCandidateUnits(supabase, sizeYards),
    getBlockingRentals(supabase, sizeYards, dropoffDate, returnDate),
    getPendingHolds(supabase, sizeYards, dropoffDate, returnDate),
  ]);

  const unitMap = new Map(candidateUnits.map((u) => [u.id, u]));
  const availableUnitIds = new Set(candidateUnits.map((u) => u.id));
  const blockedUnits = [];
  const deployedStatusUnits = candidateUnits.filter((unit) => unit.status === "deployed");

  // Do not hard-block unit.status === deployed by itself.
  // Unit status can drift from the rental board when returns/cancellations/edits happen.
  // The source of truth for customer-facing availability is overlapping rental commitments.
  // Deployed status is kept in debug so operators can spot and correct stale unit records.

  // Remove units tied to confirmed/active rentals in this window
  const assignedBlocks = [];
  const unassignedBlockingRentals = blockingRentals.filter((r) => !r.unit_id);

  for (const rental of blockingRentals) {
    if (!rental.unit_id) continue;
    const unit = unitMap.get(rental.unit_id);
    if (!unit || !availableUnitIds.has(unit.id)) continue;
    availableUnitIds.delete(unit.id);
    blockedUnits.push(buildUnitResult(unit, `rental:${rental.status}`));
    assignedBlocks.push(rental.id);
  }

  // Consume one available unit per unassigned confirmed/active rental.
  // Older records may not have unit_id populated, but they still represent a fleet commitment.
  const unassignedBlocks = [];
  for (const rental of unassignedBlockingRentals) {
    if (availableUnitIds.size === 0) break;
    const firstId = availableUnitIds.values().next().value;
    const unit = unitMap.get(firstId);
    if (!unit) continue;
    availableUnitIds.delete(firstId);
    blockedUnits.push(buildUnitResult(unit, `rental:${rental.status}:unassigned`));
    unassignedBlocks.push(rental.id);
  }

  // Consume one available unit per active pending hold
  const holdBlocks = [];
  for (const hold of pendingHolds) {
    if (availableUnitIds.size === 0) break;
    const firstId = availableUnitIds.values().next().value;
    const unit = unitMap.get(firstId);
    if (!unit) continue;
    availableUnitIds.delete(firstId);
    blockedUnits.push(buildUnitResult(unit, `hold:${hold.id}`));
    holdBlocks.push(hold.id);
  }

  const availableUnits = Array.from(availableUnitIds).map((id) => unitMap.get(id));
  const tightWindow = isTightWindow(startAtIso, now);

  return {
    request: {
      sizeCode,
      sizeYards,
      requestedStartAt: startAtIso,
      requestedEndAt: endAtIso,
      evaluatedAt: nowIso,
    },
    totals: {
      candidateUnits: candidateUnits.length,
      availableUnits: availableUnits.length,
      blockedUnits: blockedUnits.length,
      blockingRentals: blockingRentals.length,
      blockingHolds: pendingHolds.length,
      unassignedBlockingRentals: unassignedBlockingRentals.length,
      staleDeployedStatusUnits: deployedStatusUnits.length,
      tightWindow,
    },
    availableUnits,
    blockedUnits,
    debug: {
      blockingRentals,
      pendingHolds,
      assignedBlocks,
      unassignedBlocks,
      holdBlocks,
      deployedStatusUnits,
    },
  };
}
