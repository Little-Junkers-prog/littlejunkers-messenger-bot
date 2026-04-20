// api/availability-supabase.js
import { getAvailabilitySnapshot } from "../lib/availability";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

const VALID_SIZE_CODES = new Set(["11YD", "16YD", "21YD"]);

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
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return false;
  }

  return value.toLowerCase() === "true";
}

function normalizeSizeCode(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return VALID_SIZE_CODES.has(normalized) ? normalized : null;
}

function getQueryParam(req, ...keys) {
  for (const key of keys) {
    const value = req.query[key];

    if (Array.isArray(value)) {
      if (value.length > 0) {
        return value[0];
      }
      continue;
    }

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function isValidDateInput(value) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function buildExample() {
  return "/api/availability-supabase?sizeCode=16YD&requestedStartAt=2026-04-21T14:00:00-04:00&requestedEndAt=2026-04-24T18:00:00-04:00";
}

function summarizeAvailability(snapshot, includeDebug = false) {
  const hasSizeLevelBlackout = snapshot.totals.sizeLevelBlackouts > 0;

  return {
    success: true,
    message: "Availability snapshot fetched successfully.",
    request: snapshot.request,
    availability: {
      sizeCode: snapshot.request.sizeCode,
      candidateUnits: snapshot.totals.candidateUnits,
      availableUnits: snapshot.totals.availableUnits,
      blockedUnits: snapshot.totals.blockedUnits,
      isAvailable: snapshot.totals.availableUnits > 0 && !hasSizeLevelBlackout,
      isTightWindow: snapshot.totals.tightWindow,
      hasSizeLevelBlackout,
      blockingSummary: {
        bookings: snapshot.totals.blockingBookings,
        holds: snapshot.totals.blockingHolds,
        blackouts: snapshot.totals.blockingBlackouts,
        sizeLevelBlackouts: snapshot.totals.sizeLevelBlackouts,
        unassignedBlockingBookings: snapshot.totals.unassignedBlockingBookings,
      },
    },
    availableUnits: snapshot.availableUnits,
    blockedUnits: snapshot.blockedUnits,
    ...(includeDebug ? { debug: snapshot.debug } : {}),
  };
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ error: "Forbidden origin" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use GET.",
    });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({
      success: false,
      error: "Forbidden origin",
    });
  }

  try {
    const rawSizeCode = getQueryParam(req, "sizeCode", "size", "dumpsterSize");
    const requestedStartAt = getQueryParam(
      req,
      "requestedStartAt",
      "start",
      "startAt"
    );
    const requestedEndAt = getQueryParam(
      req,
      "requestedEndAt",
      "end",
      "endAt"
    );
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
      return res.status(400).json({
        success: false,
        error: "Missing or invalid requestedStartAt.",
        example: buildExample(),
      });
    }

    if (!isValidDateInput(requestedEndAt)) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid requestedEndAt.",
        example: buildExample(),
      });
    }

    const snapshot = await getAvailabilitySnapshot({
      sizeCode,
      requestedStartAt,
      requestedEndAt,
    });

    return res.status(200).json(summarizeAvailability(snapshot, includeDebug));
  } catch (error) {
    console.error("[availability-supabase] FAILED", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch availability snapshot",
    });
  }
}
