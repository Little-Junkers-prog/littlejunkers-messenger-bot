// api/inventory-counts.js
// CSR inventory counts from shared availability service.

import { assertServerOnly } from "../lib/supabaseAdmin";
import { getCsrAvailabilitySummary } from "../lib/services/availabilityService";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

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

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ error: "Forbidden origin" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  try {
    assertServerOnly();
    const { counts, units } = await getCsrAvailabilitySummary();

    return res.status(200).json({
      success: true,
      message: "Inventory counts fetched successfully.",
      counts,
      units,
      rentalsCounted: Object.values(counts.bySize).reduce((sum, bucket) => sum + bucket.reserved, 0),
    });
  } catch (error) {
    console.error("[inventory-counts] FAILED", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch inventory counts",
    });
  }
}
