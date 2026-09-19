import { assertServerOnly, getSupabaseAdmin } from "./supabaseAdmin";
import { getPricingConfig, resolveTierPrice } from "./pricingService";

const VALID_CLASSES = new Set([11, 16, 21]);
const PUBLIC_FRESHNESS_DAYS = 45;

function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function latestByAttribute(rows) {
  const out = new Map();
  for (const row of rows || []) {
    const key = `${row.variant_id || "base"}:${row.attribute_name}`;
    if (!out.has(key)) out.set(key, row);
  }
  return out;
}

export async function getPublicComparison({ zip, sizeClass, tierKey = "3day" }) {
  assertServerOnly();
  const requestedClass = Number(sizeClass);
  if (!VALID_CLASSES.has(requestedClass)) throw new Error("sizeClass must be 11, 16, or 21");

  const supabase = getSupabaseAdmin();
  const cutoff = new Date(Date.now() - PUBLIC_FRESHNESS_DAYS * 86400000).toISOString();

  const [{ data: products, error: productError }, pricingConfig] = await Promise.all([
    supabase
      .from("comparison_products")
      .select("id,product_key,product_name,actual_size_yards,container_type,comparison_class_yards,provider:comparison_providers!inner(id,slug,name,website_url,logo_url,is_active)")
      .eq("is_active", true)
      .eq("comparison_class_yards", requestedClass)
      .eq("provider.is_active", true),
    getPricingConfig(),
  ]);
  if (productError) throw new Error(`Failed to load comparison products: ${productError.message}`);

  const productIds = (products || []).map((p) => p.id);
  let observations = [];
  if (productIds.length) {
    const result = await supabase
      .from("comparison_observations")
      .select("id,product_id,variant_id,attribute_name,value_text,value_numeric,value_boolean,value_json,unit,source_url,price_qualifier,verification_status,publication_status,conflict_type,booking_state,observed_at,valid_until,market_city,market_state,market_zip")
      .in("product_id", productIds)
      .eq("publication_status", "publishable")
      .gte("observed_at", cutoff)
      .or(`valid_until.is.null,valid_until.gte.${new Date().toISOString()}`)
      .order("observed_at", { ascending: false });
    if (result.error) throw new Error(`Failed to load comparison observations: ${result.error.message}`);
    observations = result.data || [];
  }

  const competitors = (products || []).map((product) => {
    const rows = observations.filter((row) => row.product_id === product.id && !row.variant_id);
    const attrs = latestByAttribute(rows);
    const price = attrs.get("base:price");
    const duration = attrs.get("base:duration_days");
    const tons = attrs.get("base:included_tons");
    if (!price) return null;
    return {
      provider: { slug: product.provider.slug, name: product.provider.name, websiteUrl: product.provider.website_url, logoUrl: product.provider.logo_url },
      product: { name: product.product_name, actualSizeYards: asNumber(product.actual_size_yards), containerType: product.container_type, comparisonClassYards: requestedClass },
      price: asNumber(price.value_numeric),
      durationDays: duration ? asNumber(duration.value_numeric) : null,
      includedTons: tons ? asNumber(tons.value_numeric) : null,
      bookingState: price.booking_state || null,
      verifiedAt: price.observed_at,
      sourceUrl: price.source_url,
      isLittleJunkers: false,
    };
  }).filter(Boolean);

  const ljQuote = resolveTierPrice(pricingConfig, { tierKey, size: String(requestedClass), zip });
  const littleJunkers = {
    provider: { slug: "little-junkers", name: "Little Junkers", websiteUrl: "https://littlejunkersllc.com", logoUrl: null },
    product: { name: `${requestedClass} Yard Dumpster`, actualSizeYards: requestedClass, containerType: "roll_off", comparisonClassYards: requestedClass },
    price: asNumber(ljQuote?.price ?? ljQuote?.basePrice ?? ljQuote?.total),
    durationDays: asNumber(ljQuote?.durationDays),
    includedTons: asNumber(ljQuote?.includedTons),
    deliveryFee: asNumber(ljQuote?.deliveryFee),
    isLittleJunkers: true,
  };

  return { zip: zip || null, sizeClassYards: requestedClass, freshnessDays: PUBLIC_FRESHNESS_DAYS, providers: [littleJunkers, ...competitors] };
}
