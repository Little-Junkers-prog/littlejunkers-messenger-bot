// api/availability-v2.js
import { getAvailabilitySnapshot } from "../lib/availability";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

const FLEET = {
  "11 Yard": { sizeCode: "11YD" },
  "16 Yard": { sizeCode: "16YD" },
  "21 Yard": { sizeCode: "21YD" },
};

const RENTAL_OPTIONS = {
  "Early Bird": { days: [1, 2], duration: 2 },
  "Weekend Warrior": { days: [5], duration: 4 },
  "Base Rental": { days: [1, 2, 3, 4, 5, 6], duration: 2 },
  "Full Reset": { days: [1, 2, 3, 4, 5], duration: 7 },
};

const LOOKAHEAD_DAYS = 21;
const MAX_WINDOWS_PER_OPTION = 4;
const TIMEZONE = "America/New_York";

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function formatDisplay(date) {
  const safe = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
  return safe.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function getNewYorkOffset(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  }).formatToParts(date);

  const zonePart = parts.find((part) => part.type === "timeZoneName")?.value || "GMT-4";
  const match = zonePart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);

  if (!match) {
    return "-04:00";
  }

  const [, sign, hours, minutes] = match;
  return `${sign}${String(hours).padStart(2, "0")}:${minutes || "00"}`;
}

function buildWindowIso(dateStr, hour, minute = 0) {
  const probe = new Date(`${dateStr}T12:00:00Z`);
  const offset = getNewYorkOffset(probe);
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${dateStr}T${hh}:${mm}:00${offset}`;
}

async function isWindowAvailable(sizeCode, startDate, duration, now) {
  const endDate = addDays(startDate, duration);
  const snapshot = await getAvailabilitySnapshot({
    sizeCode,
    requestedStartAt: buildWindowIso(toDateStr(startDate), 14),
    requestedEndAt: buildWindowIso(toDateStr(endDate), 18),
    now,
  });

  return snapshot.totals.availableUnits > 0 && snapshot.totals.sizeLevelBlackouts === 0;
}

async function buildWindowsForOption(optionKey, sizeCode, today, windowEnd, now) {
  const option = RENTAL_OPTIONS[optionKey];
  const windows = [];
  const cursor = addDays(today, 1);

  while (cursor <= windowEnd && windows.length < MAX_WINDOWS_PER_OPTION) {
    if (option.days.includes(cursor.getDay())) {
      const available = await isWindowAvailable(sizeCode, cursor, option.duration, now);

      if (available) {
        const endDate = addDays(cursor, option.duration);
        const startStr = toDateStr(cursor);
        const endStr = toDateStr(endDate);

        windows.push({
          start: startStr,
          end: endStr,
          startLabel: formatDisplay(cursor),
          endLabel: formatDisplay(endDate),
          startIso: buildWindowIso(startStr, 14),
          endIso: buildWindowIso(endStr, 18),
        });
      }
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return windows;
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ error: "Forbidden origin" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  const { size } = req.body || {};

  if (!size || !FLEET[size]) {
    return res.status(400).json({ error: "Invalid size" });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const now = new Date();
  const windowEnd = addDays(today, LOOKAHEAD_DAYS);

  try {
    const { sizeCode } = FLEET[size];
    const available = {};

    for (const optionKey of Object.keys(RENTAL_OPTIONS)) {
      available[optionKey] = await buildWindowsForOption(optionKey, sizeCode, today, windowEnd, now);
    }

    return res.status(200).json({ size, available });
  } catch (error) {
    console.error("[availability-v2] FAILED", error);

    return res.status(200).json({
      size,
      available: {
        "Early Bird": [],
        "Weekend Warrior": [],
        "Base Rental": [],
        "Full Reset": [],
      },
      degraded: true,
      degradedReason: error.message,
    });
  }
}
