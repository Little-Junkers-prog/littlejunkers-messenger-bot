// api/get-pricing.js
// Returns all pricing, zone, ZIP, and size metadata from Supabase in one parallel fetch.
// Vercel edge cache: 60s fresh, 5min stale-while-revalidate.
// Used by rent-a-dumpster.js, csr-quick-book.js, and complete-booking.js.

import { getSupabaseAdmin } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabaseAdmin();

    const [pricingRes, serviceAreasRes, zipCodesRes, sizesRes] = await Promise.all([
      supabase
        .from("pricing")
        .select("tier_key, display_label, duration_days, day_restriction, price_11yd, price_16yd, price_21yd, daily_overage")
        .order("duration_days", { ascending: true }),
      supabase
        .from("service_areas")
        .select("zone, label, delivery_fee, dry_run_fee"),
      supabase
        .from("zip_codes")
        .select("zip, zone, area_label"),
      supabase
        .from("dumpster_sizes")
        .select("size_yards, included_tons, height_ft, short_desc, long_desc"),
    ]);

    // Surface any Supabase errors
    for (const [name, result] of [
      ["pricing", pricingRes],
      ["service_areas", serviceAreasRes],
      ["zip_codes", zipCodesRes],
      ["dumpster_sizes", sizesRes],
    ]) {
      if (result.error) {
        console.error(`[get-pricing] Supabase error on ${name}:`, result.error.message);
        return res.status(500).json({ error: `Failed to load ${name}: ${result.error.message}` });
      }
    }

    // Shape pricing into the format the funnel expects
    // pricing keyed by tierKey for fast lookup, also returned as ordered array
    const pricing = (pricingRes.data || []).map((row) => ({
      tierKey:      row.tier_key,
      displayLabel: row.display_label,
      durationDays: row.duration_days,
      dayRestriction: row.day_restriction,   // null | "mon_tue"
      prices: {
        "11": row.price_11yd,
        "16": row.price_16yd,
        "21": row.price_21yd,
      },
      dailyOverage: row.daily_overage,
    }));

    // serviceAreas keyed by zone letter: { A: {...}, B: {...}, C: {...} }
    const serviceAreas = {};
    for (const row of (serviceAreasRes.data || [])) {
      serviceAreas[row.zone] = {
        zone:        row.zone,
        label:       row.label,
        deliveryFee: row.delivery_fee,
        dryRunFee:   row.dry_run_fee,
      };
    }

    // zipCodes keyed by ZIP string: { "30269": { zone: "A", areaLabel: "Peachtree City area" }, ... }
    const zipCodes = {};
    for (const row of (zipCodesRes.data || [])) {
      zipCodes[row.zip] = {
        zone:      row.zone,
        areaLabel: row.area_label,
      };
    }

    // sizes keyed by size_yards integer: { 11: {...}, 16: {...}, 21: {...} }
    const sizes = {};
    for (const row of (sizesRes.data || [])) {
      sizes[row.size_yards] = {
        includedTons: row.included_tons,
        heightFt:     row.height_ft,
        shortDesc:    row.short_desc,
        longDesc:     row.long_desc,
      };
    }

    // Vercel edge cache headers
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

    return res.status(200).json({ pricing, serviceAreas, zipCodes, sizes });
  } catch (err) {
    console.error("[get-pricing] Unexpected error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
