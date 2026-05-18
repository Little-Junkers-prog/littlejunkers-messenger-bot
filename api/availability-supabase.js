// api/availability-supabase.js
// Legacy CSR availability endpoint kept for csr-quick-book.js.
// It now delegates to the canonical availability service so CSR no longer
// drops into the false "all dates shown as open" degraded state.

import { getAvailabilityCalendar, evaluateWindow } from "../lib/services/availabilityService";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

const VALID_SIZE_CODES = new Set(["11YD", "16YD", "21YD"]);
const SIZE_CODE_TO_YARDS = { "11YD": 11, "16YD": 16, "21YD": 21 };

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return value.toLowerCase() === "true";
}

function normalizeSizeCode(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return VALID_SIZE_CODES.has(normalized) ? normalized : null;
}

function getQueryParam(req, ...keys) {
  for (const key of keys) {
    const value = req.query[key];
    if (Array.isArray(value)) {
      if (value.length > 0) return value[0];
      continue;
    }
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function isValidDateInput(value) {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function buildExample() {
  return "/api/availability-supabase?sizeCode=16YD&requestedStartAt=2026-04-21T14:00:00-04:00&requestedEndAt=2026-04-24T18:00:00-04:00";
}

function hasAnyAvailableWindow(calendar) {
  if (!calendar?.available) return false;
  return Object.values(calendar.available).some((windows) => Array.isArray(windows) && windows.length > 0);
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ error: "Forbidden origin" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use GET." });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  try {
    const rawSizeCode = getQueryParam(req, "sizeCode", "size", "dumpsterSize");
    const requestedStartAt = getQueryParam(req, "requestedStartAt", "start", "startAt");
    const requestedEndAt = getQueryParam(req, "requestedEndAt", "end", "endAt");
    const includeDebug = parseBoolean(getQueryParam(req, "debug"));

    const sizeCode = normalizeSizeCode(rawSizeCode);
    if (!sizeCode) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid sizeCode. Use one of: 11YD, 16YD, 21YD.",
        example: buildExample(),
      });
    }
    if (!isValidDateInput(requestedStartAt)) {
      return res.status(400).json({ success: false, error: "Missing or invalid requestedStartAt.", example: buildExample() });
    }
    if (!isValidDateInput(requestedEndAt)) {
      return res.status(400).json({ success: false, error: "Missing or invalid requestedEndAt.", example: buildExample() });
    }

    const sizeYards = SIZE_CODE_TO_YARDS[sizeCode];
    const [windowEvaluation, calendar] = await Promise.all([
      evaluateWindow({
        sizeYards,
        startDate: requestedStartAt,
        endDate: requestedEndAt,
        source: "availability-supabase-legacy-csr",
      }),
      getAvailabilityCalendar({ sizeYards }),
    ]);

    const anyAvailableWindow = hasAnyAvailableWindow(calendar);

    return res.status(200).json({
      success: true,
      message: "Availability snapshot fetched successfully.",
      request: {
        sizeCode,
        sizeYards,
        requestedStartAt,
        requestedEndAt,
        evaluatedAt: new Date().toISOString(),
      },
      availability: {
        sizeCode,
        candidateUnits: windowEvaluation.capacity,
        availableUnits: windowEvaluation.availableUnits,
        blockedUnits: windowEvaluation.usedCapacity,
        // CSR passes a broad 90-day range. Treat the calendar as healthy if the
        // canonical service can find any valid bookable windows for this size.
        // Date-level validation still happens when create-booking-hold runs.
        isAvailable: anyAvailableWindow,
        isTightWindow: false,
        hasSizeLevelBlackout: false,
        blockingSummary: {
          rentals: windowEvaluation.blockingCommitmentCount,
          holds: 0,
          unassignedBlockingRentals: 0,
        },
      },
      blockedDates: calendar.blockedDates || [],
      available: calendar.available || {},
      ...(includeDebug ? { debug: { windowEvaluation, calendar: calendar.debug } } : {}),
    });
  } catch (error) {
    console.error("[availability-supabase] FAILED", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch availability snapshot",
    });
  }
}
