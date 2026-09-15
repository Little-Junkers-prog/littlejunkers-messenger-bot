import { assertServerOnly, getSupabaseAdmin } from "./supabaseAdmin";
import { getPricingConfig, resolveTierPrice } from "./pricingService";

const VALID_CLASSES = new Set([11, 16, 21]);
const VALID_TIER_KEYS = new Set(["3day", "5day", "7day"]);
const PUBLIC_FRESHNESS_DAYS = 45;

function asNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function latestByAttribute(rows) { const out = new Map(); for (const row of rows || []) { const key = `${row.variant_id || "base"}:${row.attribute_name}`; if (!out.has(key)) out.set(key, row); } return out; }
function observationMatchesMarket(row, zip) {
  if (row.market_zip) return row.market_zip === zip;
  return true;
}

export async function getPublicComparison({ zip, sizeClass, tierKey = "3day" }) {
  assertServerOnly();
  const requestedClass = Number(sizeClass);
  if (!VALID_CLASSES.has(requestedClass)) throw new Error("sizeClass must be 11, 16, or 21");
  if (!VALID_TIER_KEYS.has(tierKey)) throw new Error("tierKey must be 3day, 5day, or 7day");

  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - PUBLIC_FRESHNESS_DAYS * 86400000).toISOString();
  const [{ data: products, error: productError }, pricingConfig] = await Promise.all([
    supabase.from("comparison_products").select("id,product_key,product_name,actual_size_yards,container_type,comparison_class_yards,provider:comparison_providers!inner(id,slug,name,website_url,logo_url,is_active)").eq("is_active", true).eq("comparison_class_yards", requestedClass).eq("provider.is_active", true),
    getPricingConfig(),
  ]);
  if (productError) throw new Error(`Failed to load comparison products: ${productError.message}`);

  const productIds = (products || []).map((p) => p.id);
  let observations = [];
  if (productIds.length) {
    const result = await supabase.from("comparison_observations").select("id,product_id,variant_id,attribute_name,value_text,value_numeric,value_boolean,value_json,unit,source_url,price_qualifier,verification_status,publication_status,conflict_type,booking_state,observed_at,valid_until,market_city,market_state,market_zip").in("product_id", productIds).eq("publication_status", "publishable").gte("observed_at", cutoff).or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`).order("observed_at", { ascending: false });
    if (result.error) throw new Error(`Failed to load comparison observations: ${result.error.message}`);
    observations = (result.data || []).filter((row) => observationMatchesMarket(row, zip));
  }

  const competitors = (products || []).map((product) => {
    const rows = observations.filter((row) => row.product_id === product.id && !row.variant_id);
    const attrs = latestByAttribute(rows);
    const price = attrs.get("base:price");
    const duration = attrs.get("base:duration_days");
    const tons = attrs.get("base:included_tons");
    if (!price && !duration && !tons) return null;
    return {
      provider: { id: product.provider.id, slug: product.provider.slug, name: product.provider.name, websiteUrl: product.provider.website_url, logoUrl: product.provider.logo_url },
      product: { name: product.product_name, actualSizeYards: asNumber(product.actual_size_yards), containerType: product.container_type, comparisonClassYards: requestedClass },
      price: price ? asNumber(price.value_numeric) : null,
      priceStatus: price ? "published" : "not_published",
      durationDays: duration ? asNumber(duration.value_numeric) : null,
      includedTons: tons ? asNumber(tons.value_numeric) : null,
      bookingState: price?.booking_state || duration?.booking_state || tons?.booking_state || null,
      verifiedAt: price?.observed_at || duration?.observed_at || tons?.observed_at || null,
      sourceUrl: price?.source_url || duration?.source_url || tons?.source_url || null,
      isLittleJunkers: false,
    };
  }).filter(Boolean);

  const ljQuote = resolveTierPrice(pricingConfig, { tierKey, size: String(requestedClass), zip });
  const littleJunkers = {
    provider: { slug: "little-junkers", name: "Little Junkers", websiteUrl: "https://littlejunkersllc.com", logoUrl: null },
    product: { name: `${requestedClass} Yard Dumpster`, actualSizeYards: requestedClass, containerType: "roll_off", comparisonClassYards: requestedClass },
    price: asNumber(ljQuote.basePrice), priceStatus: "published",
    durationDays: asNumber(ljQuote.durationDays),
    includedTons: asNumber(pricingConfig.sizes?.[String(requestedClass)]?.includedTons),
    deliveryFee: asNumber(ljQuote.deliveryFee),
    isLittleJunkers: true,
  };

  competitors.sort((a, b) => a.provider.name.localeCompare(b.provider.name) || (a.product.actualSizeYards || 0) - (b.product.actualSizeYards || 0));
  return { zip: zip || null, sizeClassYards: requestedClass, freshnessDays: PUBLIC_FRESHNESS_DAYS, littleJunkers, providers: competitors };
}
