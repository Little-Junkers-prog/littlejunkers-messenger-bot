// api/get-pricing.js
// Returns Supabase-backed pricing, service-area, ZIP, fee, and size metadata.
// This endpoint is intentionally thin; all normalization lives in lib/pricingService.js.

import {
  buildPublicPricingPayload,
  getPricingConfig,
  resolveTierPrice,
} from "../lib/pricingService";

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const config = await getPricingConfig();
    const zip = asString(req.query.zip);
    const tierKey = asString(req.query.tierKey || req.query.rentalOption);
    const size = asString(req.query.size || req.query.sizeYards || req.query.sizeCode);

    const payload = buildPublicPricingPayload(config, { zip });

    if (tierKey || size) {
      if (!tierKey || !size) {
        return res.status(400).json({
          success: false,
          error: "tierKey/rentalOption and size are both required for quote resolution.",
        });
      }

      payload.quote = resolveTierPrice(config, {
        tierKey,
        size,
        zip,
        zone: asString(req.query.zone),
      });
    }

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

    return res.status(200).json({
      success: true,
      ...payload,
    });
  } catch (error) {
    console.error("[get-pricing] FAILED", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to load pricing configuration",
    });
  }
}
