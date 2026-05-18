// lib/availability.js
// Backward-compatible wrapper around the shared availability service.
// New code should import from lib/services/availabilityService.js directly.

import { assertServerOnly } from "./supabaseAdmin";
import { evaluateWindow } from "./services/availabilityService";

function sizeCodeToYards(sizeCode) {
  const raw = String(sizeCode || "").toUpperCase();
  const map = { "11YD": 11, "16YD": 16, "21YD": 21 };
  return map[raw] || null;
}

function isTightWindow(startAtIso, now = new Date()) {
  const diffHours = (new Date(startAtIso).getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours <= 24;
}

export async function getAvailabilitySnapshot({
  sizeCode,
  requestedStartAt,
  requestedEndAt,
  now = new Date(),
}) {
  assertServerOnly();

  const sizeYards = sizeCodeToYards(sizeCode);
  if (!sizeYards) throw new Error(`Invalid sizeCode: ${sizeCode}`);

  const evaluation = await evaluateWindow({
    sizeYards,
    startDate: requestedStartAt,
    endDate: requestedEndAt,
    now,
    source: "legacyAvailabilityWrapper",
  });

  return {
    request: {
      sizeCode,
      sizeYards,
      requestedStartAt: new Date(requestedStartAt).toISOString(),
      requestedEndAt: new Date(requestedEndAt).toISOString(),
      evaluatedAt: now.toISOString(),
    },
    totals: {
      candidateUnits: evaluation.capacity,
      availableUnits: evaluation.availableUnits,
      blockedUnits: evaluation.usedCapacity,
      blockingRentals: evaluation.blockingCommitmentCount,
      blockingHolds: 0,
      unassignedBlockingRentals: 0,
      staleDeployedStatusUnits: 0,
      tightWindow: isTightWindow(requestedStartAt, now),
    },
    availableUnits: Array.from({ length: evaluation.availableUnits }, (_, index) => ({
      id: `capacity-${index + 1}`,
      size_yards: sizeYards,
      status: "available",
    })),
    blockedUnits: Array.from({ length: evaluation.usedCapacity }, (_, index) => ({
      id: `blocked-${index + 1}`,
      size_yards: sizeYards,
      status: "committed",
      blockingReason: evaluation.reason,
    })),
    debug: {
      evaluation,
    },
  };
}
