// api/availability.js
// Thin customer-facing availability endpoint.
// The funnel calls this route; all availability decisions live in lib/services/availabilityService.js.

import { assertServerOnly } from "../lib/supabaseAdmin";
import { normalizeSizeYards } from "../lib/pricingService";
import { getAvailabilityCalendar } from "../lib/services/availabilityService";

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

    const calendar = await getAvailabilityCalendar({ sizeYards: normalizedSizeYards });

    return res.status(200).json({
      size,
      sizeYards: calendar.sizeYards,
      available: calendar.available,
      blockedDates: calendar.blockedDates,
      debug: process.env.NODE_ENV !== "production" || process.env.AVAILABILITY_DEBUG === "true"
        ? calendar.debug
        : undefined,
    });
  } catch (err) {
    console.error("[availability] FAILED", err);

    return res.status(500).json({
      error: err.message || "Failed to load availability",
    });
  }
}
