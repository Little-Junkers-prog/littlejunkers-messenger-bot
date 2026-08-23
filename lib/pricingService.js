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

const TIER_SORT_ORDER = {
  "2day_montue": 10,
  "2day_standard": 20,
  "4day": 30,
  "7day": 40,
};

function failIfSupabaseError(name, result, { optional = false } = {}) {
  if (result?.error && !optional) {
    throw new Error(`Failed to load ${name}: ${result.error.message}`);
  }
}

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function pick(row, keys, fallback = null) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return fallback;
}

function pickNumber(row, keys, fallback = 0) {
  const value = pick(row, keys, fallback);
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizePricingRow(row) {
  const tierKey = normalizeTierKey(pick(row, ["tier_key", "tierKey", "key", "rental_option", "rentalOption", "name"], ""));

  return {
    tierKey,
    displayLabel: pick(row, ["display_label", "displayLabel", "label", "name"], tierKey),
    badgeTag: pick(row, ["badge_tag", "badgeTag"], null),
    durationDays: pickNumber(row, ["duration_days", "durationDays", "duration", "rental_days", "rentalDays", "days"], 0),
    dayRestriction: pick(row, ["day_restriction", "dayRestriction", "restriction", "delivery_days"], null),
    dailyOverage: pickNumber(row, ["daily_overage", "dailyOverage", "daily_overage_fee", "overage_fee"], 0),
    prices: {
      "11": pickNumber(row, ["price_11yd", "price_11_yard", "price_11yard", "price_11", "yard_11", "yard11", "eleven_yard", "elevenYard", "price11"], 0),
      "16": pickNumber(row, ["price_16yd", "price_16_yard", "price_16yard", "price_16", "yard_16", "yard16", "sixteen_yard", "sixteenYard", "price16"], 0),
      "21": pickNumber(row, ["price_21yd", "price_21_yard", "price_21yard", "price_21", "yard_21", "yard21", "twentyone_yard", "twentyOneYard", "price21"], 0),
    },
  };
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

  const [configRes, sizesRes] = await Promise.all([
    supabase.rpc("get_pricing_config"),
    supabase.from("dumpster_sizes").select("*"),
  ]);

  failIfSupabaseError("pricing_config", configRes);
  failIfSupabaseError("dumpster_sizes", sizesRes);

  const config = configRes.data || {};
  const pricingRes = { data: config.pricing || [], error: null };
  const serviceAreasRes = { data: config.serviceAreas || [], error: null };
  const zipCodesRes = { data: config.zipCodes || [], error: null };
  const feesRes = { data: config.fees || [], error: null };

  const pricing = (pricingRes.data || [])
    .map(normalizePricingRow)
    .filter((tier) => tier.tierKey)
    .sort((a, b) => {
      const orderA = TIER_SORT_ORDER[a.tierKey] ?? 999;
      const orderB = TIER_SORT_ORDER[b.tierKey] ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return Number(a.durationDays || 0) - Number(b.durationDays || 0);
    });

  const pricingByTierKey = pricing.reduce((acc, tier) => {
    acc[tier.tierKey] = tier;
    return acc;
  }, {});

  const serviceAreas = (serviceAreasRes.data || []).reduce((acc, row) => {
    const zone = normalizeZoneKey(pick(row, ["zone", "zone_key", "zoneKey", "key", "name"]));
    if (!zone) return acc;
    acc[zone] = {
      zone,
      rentalZone: zoneKeyToRentalZone(zone),
      label: pick(row, ["label", "display_label", "displayLabel", "name"], `${zone} Area`),
      deliveryFee: pickNumber(row, ["delivery_fee", "deliveryFee", "fee", "zone_fee", "zoneFee"], 0),
      dryRunFee: pickNumber(row, ["dry_run_fee", "dryRunFee", "dry_run", "dryRun"], 0),
    };
    return acc;
  }, {});

  const zipCodes = (zipCodesRes.data || []).reduce((acc, row) => {
    const zip = normalizeZip(pick(row, ["zip", "zipcode", "zip_code", "zipCode", "postal_code", "postalCode"]));
    const zone = normalizeZoneKey(pick(row, ["zone", "zone_key", "zoneKey", "service_area", "serviceArea"]));
    if (!zip) return acc;
    acc[zip] = {
      zip,
      zone,
      rentalZone: zoneKeyToRentalZone(zone),
      areaLabel: pick(row, ["area_label", "areaLabel", "city", "label", "name"], `ZIP ${zip} area`),
    };
    return acc;
  }, {});

  const sizes = (sizesRes.data || []).reduce((acc, row) => {
    const sizeYards = normalizeSizeYards(pick(row, ["size_yards", "sizeYards", "yards", "size", "label", "name"]));
    if (!sizeYards) return acc;
    acc[String(sizeYards)] = {
      sizeYards,
      sizeCode: pick(row, ["size_code", "sizeCode", "code"], sizeYardsToCode(sizeYards)),
      label: pick(row, ["label", "display_label", "displayLabel", "name"], sizeYardsToLabel(sizeYards)),
      includedTons: pickNumber(row, ["included_tons", "includedTons", "tons", "included_tonnage"], 0),
      heightFt: pick(row, ["height_ft", "heightFt", "height"], null),
      shortDesc: pick(row, ["short_desc", "shortDesc", "description", "best_for"], null),
      longDesc: pick(row, ["long_desc", "longDesc", "long_description"], null),
      truckLoads: pick(row, ["truck_loads", "truckLoads"], null),
      projectScale: pick(row, ["project_scale", "projectScale"], null),
      bestUse: pick(row, ["best_use", "bestUse"], null),
    };
    return acc;
  }, {});

  return {
    pricing,
    pricingByTierKey,
    serviceAreas,
    zipCodes,
    sizes,
    fees: feesRes.error ? [] : feesRes.data || [],
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
    badgeTag: tier.badgeTag,
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
    badgeTag: tier.badgeTag,
    durationDays: tier.durationDays,
    dayRestriction: tier.dayRestriction,
    dailyOverage: tier.dailyOverage,
    prices: tier.prices,
  }));

  const pricedOptions = config.pricing.map((tier) => ({
    tierKey: tier.tierKey,
    displayLabel: tier.displayLabel,
    badgeTag: tier.badgeTag,
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
