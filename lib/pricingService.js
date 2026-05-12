// lib/pricingService.js
// Central Supabase-backed pricing, service-area, ZIP, and size metadata resolver.
// Keep customer-facing pages thin: business rules should live in Supabase and be
// normalized here before the frontend, checkout, or admin flows consume them.

import { getSupabaseAdmin, assertServerOnly } from "./supabaseAdmin";

const SIZE_CODE_TO_YARDS = {
  "11YD": 11,
  "16YD": 16,
  "21YD": 21,
};

const SIZE_LABEL_BY_YARDS = {
  11: "11 Yard",
  16: "16 Yard",
  21: "21 Yard",
};

// Temporary compatibility aliases while older callers are migrated off legacy names.
// New code should use Supabase tier keys directly.
const LEGACY_TIER_KEY_ALIASES = {
  "Early Bird": "2day_montue",
  "Base Rental": "2day_standard",
  "Weekend Warrior": "4day",
  "Full Reset": "7day",
  "2-Day Mon/Tue": "2day_montue",
  "2-Day Standard": "2day_standard",
  "4-Day": "4day",
  "7-Day": "7day",
};

function failIfSupabaseError(name, result) {
  if (result?.error) {
    throw new Error(`Failed to load ${name}: ${result.error.message}`);
  }
}

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export function normalizeZip(value) {
  const zip = asString(value).replace(/\D/g, "").slice(0, 5);
  return /^\d{5}$/.test(zip) ? zip : "";
}

export function normalizeZoneKey(value) {
  const raw = asString(value);
  const lower = raw.toLowerCase();
  if (lower === "local" || lower === "zone1" || lower === "1") return "A";
  if (lower === "zone2" || lower === "2") return "B";
  if (lower === "zone3" || lower === "3") return "C";
  return raw.toUpperCase();
}

export function zoneKeyToRentalZone(value) {
  const zone = normalizeZoneKey(value);
  if (zone === "B") return "zone2";
  if (zone === "C") return "zone3";
  return "local";
}

export function normalizeSizeYards(value) {
  const raw = asString(value).toUpperCase();
  if (SIZE_CODE_TO_YARDS[raw]) return SIZE_CODE_TO_YARDS[raw];

  const numberMatch = raw.match(/\d+/);
  if (!numberMatch) return null;

  const yards = Number(numberMatch[0]);
  return SIZE_LABEL_BY_YARDS[yards] ? yards : null;
}

export function sizeYardsToLabel(value) {
  const yards = normalizeSizeYards(value);
  return yards ? SIZE_LABEL_BY_YARDS[yards] : "";
}

export function sizeYardsToCode(value) {
  const yards = normalizeSizeYards(value);
  if (!yards) return "";
  return `${yards}YD`;
}

export function normalizeTierKey(value) {
  const raw = asString(value);
  if (!raw) return "";
  return LEGACY_TIER_KEY_ALIASES[raw] || raw;
}

export function formatTierLabel(tier) {
  return tier?.displayLabel || tier?.tierKey || "";
}

export async function getPricingConfig() {
  assertServerOnly();

  const supabase = getSupabaseAdmin();

  const [pricingRes, serviceAreasRes, zipCodesRes, sizesRes, feesRes] = await Promise.all([
    supabase
      .from("pricing")
      .select("tier_key, display_label, duration_days, day_restriction, price_11yd, price_16yd, price_21yd, daily_overage")
      .order("duration_days", { ascending: true })
      .order("tier_key", { ascending: true }),
    supabase
      .from("service_areas")
      .select("zone, label, delivery_fee, dry_run_fee")
      .order("zone", { ascending: true }),
    supabase
      .from("zip_codes")
      .select("zip, zone, area_label")
      .order("zip", { ascending: true }),
    supabase
      .from("dumpster_sizes")
      .select("size_yards, included_tons, height_ft, short_desc, long_desc")
      .order("size_yards", { ascending: true }),
    supabase
      .from("fees")
      .select("*")
      .order("id", { ascending: true }),
  ]);

  failIfSupabaseError("pricing", pricingRes);
  failIfSupabaseError("service_areas", serviceAreasRes);
  failIfSupabaseError("zip_codes", zipCodesRes);
  failIfSupabaseError("dumpster_sizes", sizesRes);
  failIfSupabaseError("fees", feesRes);

  const pricing = (pricingRes.data || []).map((row) => ({
    tierKey: row.tier_key,
    displayLabel: row.display_label,
    durationDays: row.duration_days,
    dayRestriction: row.day_restriction,
    dailyOverage: row.daily_overage,
    prices: {
      "11": Number(row.price_11yd || 0),
      "16": Number(row.price_16yd || 0),
      "21": Number(row.price_21yd || 0),
    },
  }));

  const pricingByTierKey = pricing.reduce((acc, tier) => {
    acc[tier.tierKey] = tier;
    return acc;
  }, {});

  const serviceAreas = (serviceAreasRes.data || []).reduce((acc, row) => {
    const zone = normalizeZoneKey(row.zone);
    acc[zone] = {
      zone,
      rentalZone: zoneKeyToRentalZone(zone),
      label: row.label,
      deliveryFee: Number(row.delivery_fee || 0),
      dryRunFee: Number(row.dry_run_fee || 0),
    };
    return acc;
  }, {});

  const zipCodes = (zipCodesRes.data || []).reduce((acc, row) => {
    const zip = normalizeZip(row.zip);
    const zone = normalizeZoneKey(row.zone);
    if (!zip) return acc;
    acc[zip] = {
      zip,
      zone,
      rentalZone: zoneKeyToRentalZone(zone),
      areaLabel: row.area_label || `ZIP ${zip} area`,
    };
    return acc;
  }, {});

  const sizes = (sizesRes.data || []).reduce((acc, row) => {
    const sizeYards = normalizeSizeYards(row.size_yards);
    if (!sizeYards) return acc;
    acc[String(sizeYards)] = {
      sizeYards,
      sizeCode: sizeYardsToCode(sizeYards),
      label: sizeYardsToLabel(sizeYards),
      includedTons: Number(row.included_tons || 0),
      heightFt: row.height_ft,
      shortDesc: row.short_desc,
      longDesc: row.long_desc,
    };
    return acc;
  }, {});

  return {
    pricing,
    pricingByTierKey,
    serviceAreas,
    zipCodes,
    sizes,
    fees: feesRes.data || [],
  };
}

export function resolveServiceAreaForZip(config, zipValue) {
  const zip = normalizeZip(zipValue);
  const zipEntry = zip ? config.zipCodes[zip] : null;
  if (!zipEntry) {
    return {
      serviceable: false,
      zip,
      error: "ZIP is not currently in the service area.",
    };
  }

  const serviceArea = config.serviceAreas[zipEntry.zone];
  if (!serviceArea) {
    return {
      serviceable: false,
      zip,
      error: "ZIP is mapped to a missing service area.",
    };
  }

  return {
    serviceable: true,
    zip,
    areaLabel: zipEntry.areaLabel,
    zone: serviceArea.zone,
    rentalZone: serviceArea.rentalZone,
    zoneLabel: serviceArea.label,
    deliveryFee: serviceArea.deliveryFee,
    dryRunFee: serviceArea.dryRunFee,
  };
}

export function resolveTierPrice(config, { tierKey, rentalOption, size, sizeYards, zip, zone }) {
  const normalizedTierKey = normalizeTierKey(tierKey || rentalOption);
  const tier = config.pricingByTierKey[normalizedTierKey];
  const yards = normalizeSizeYards(sizeYards || size);

  if (!tier) {
    throw new Error(`Unknown pricing tier: ${tierKey || rentalOption || "missing"}`);
  }

  if (!yards) {
    throw new Error(`Unknown dumpster size: ${sizeYards || size || "missing"}`);
  }

  let serviceArea = null;
  if (zip) {
    serviceArea = resolveServiceAreaForZip(config, zip);
    if (!serviceArea.serviceable) throw new Error(serviceArea.error);
  } else if (zone) {
    const zoneKey = normalizeZoneKey(zone);
    const area = config.serviceAreas[zoneKey];
    if (!area) throw new Error(`Unknown service area: ${zone}`);
    serviceArea = {
      serviceable: true,
      zone: area.zone,
      rentalZone: area.rentalZone,
      zoneLabel: area.label,
      deliveryFee: area.deliveryFee,
      dryRunFee: area.dryRunFee,
    };
  }

  const basePrice = Number(tier.prices[String(yards)] || 0);
  if (!basePrice) {
    throw new Error(`Missing price for ${yards} yard / ${normalizedTierKey}`);
  }

  const deliveryFee = Number(serviceArea?.deliveryFee || 0);

  return {
    tierKey: tier.tierKey,
    displayLabel: tier.displayLabel,
    durationDays: tier.durationDays,
    dayRestriction: tier.dayRestriction,
    dailyOverage: tier.dailyOverage,
    sizeYards: yards,
    sizeCode: sizeYardsToCode(yards),
    sizeLabel: sizeYardsToLabel(yards),
    basePrice,
    deliveryFee,
    totalPrice: basePrice + deliveryFee,
    serviceArea,
  };
}

export function buildPublicPricingPayload(config, { zip } = {}) {
  const serviceArea = zip ? resolveServiceAreaForZip(config, zip) : null;
  const deliveryFee = serviceArea?.serviceable ? serviceArea.deliveryFee : 0;

  const tiers = config.pricing.map((tier) => ({
    tierKey: tier.tierKey,
    displayLabel: tier.displayLabel,
    durationDays: tier.durationDays,
    dayRestriction: tier.dayRestriction,
    dailyOverage: tier.dailyOverage,
    prices: tier.prices,
  }));

  const pricedOptions = config.pricing.map((tier) => ({
    tierKey: tier.tierKey,
    displayLabel: tier.displayLabel,
    durationDays: tier.durationDays,
    dayRestriction: tier.dayRestriction,
    dailyOverage: tier.dailyOverage,
    prices: Object.entries(tier.prices).reduce((acc, [yards, basePrice]) => {
      acc[yards] = {
        sizeYards: Number(yards),
        sizeCode: sizeYardsToCode(yards),
        sizeLabel: sizeYardsToLabel(yards),
        basePrice,
        deliveryFee,
        totalPrice: basePrice + deliveryFee,
      };
      return acc;
    }, {}),
  }));

  return {
    serviceArea,
    pricing: tiers,
    pricedOptions,
    serviceAreas: config.serviceAreas,
    zipCodes: config.zipCodes,
    sizes: config.sizes,
    fees: config.fees,
  };
}
