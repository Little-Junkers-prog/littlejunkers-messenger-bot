import { assertServerOnly, getSupabaseAdmin } from "./supabaseAdmin";

export const COMPARISON_EVENTS = new Set([
  "comparison_started",
  "comparison_location_resolved",
  "comparison_size_selected",
  "comparison_preview_viewed",
  "comparison_unlocked",
  "comparison_provider_detail_viewed",
  "comparison_provider_outbound_clicked",
  "comparison_lj_booking_clicked",
]);

const MARKET_BY_INPUT = new Map([
  ["30269", { city: "Peachtree City", state: "GA", zip: "30269" }],
  ["peachtree city", { city: "Peachtree City", state: "GA", zip: "30269" }],
  ["peachtree city ga", { city: "Peachtree City", state: "GA", zip: "30269" }],
  ["30214", { city: "Fayetteville", state: "GA", zip: "30214" }],
  ["fayetteville", { city: "Fayetteville", state: "GA", zip: "30214" }],
  ["fayetteville ga", { city: "Fayetteville", state: "GA", zip: "30214" }],
  ["30263", { city: "Newnan", state: "GA", zip: "30263" }],
  ["newnan", { city: "Newnan", state: "GA", zip: "30263" }],
  ["newnan ga", { city: "Newnan", state: "GA", zip: "30263" }],
]);

function cleanText(value, max = 120) {
  return String(value || "").trim().slice(0, max);
}

export function resolveComparisonMarket(input) {
  const raw = cleanText(input);
  const key = raw.toLowerCase().replace(/,\s*/g, " ").replace(/\s+/g, " ");
  return { input: raw, market: MARKET_BY_INPUT.get(key) || null };
}

export async function createComparisonSession({ locationInput = null } = {}) {
  assertServerOnly();
  const supabase = getSupabaseAdmin();
  const resolved = locationInput ? resolveComparisonMarket(locationInput) : { input: "", market: null };
  const row = {
    location_input: resolved.input || null,
    market_city: resolved.market?.city || null,
    market_state: resolved.market?.state || "GA",
    market_zip: resolved.market?.zip || null,
  };
  const { data, error } = await supabase.from("comparison_sessions").insert(row).select("id,market_city,market_state,market_zip,started_at").single();
  if (error) throw new Error(`Comparison session create failed: ${error.message}`);
  await recordComparisonEvent({ sessionId: data.id, eventName: "comparison_started", context: resolved.market ? { marketZip: resolved.market.zip } : {} });
  return data;
}

export async function updateComparisonSession(sessionId, patch) {
  assertServerOnly();
  const supabase = getSupabaseAdmin();
  const allowed = {};
  if (patch.locationInput !== undefined) allowed.location_input = cleanText(patch.locationInput) || null;
  if (patch.marketCity !== undefined) allowed.market_city = cleanText(patch.marketCity, 80) || null;
  if (patch.marketState !== undefined) allowed.market_state = cleanText(patch.marketState, 2).toUpperCase() || "GA";
  if (patch.marketZip !== undefined) allowed.market_zip = /^\d{5}$/.test(String(patch.marketZip || "")) ? String(patch.marketZip) : null;
  if (patch.selectedSizeYards !== undefined) {
    const size = Number(patch.selectedSizeYards);
    if (![11, 16, 21].includes(size)) throw new Error("Invalid comparison size");
    allowed.selected_size_yards = size;
  }
  if (patch.leadId !== undefined) allowed.lead_id = patch.leadId || null;
  if (patch.unlocked === true) allowed.unlocked_at = new Date().toISOString();
  allowed.updated_at = new Date().toISOString();
  const { data, error } = await supabase.from("comparison_sessions").update(allowed).eq("id", sessionId).select("id,market_city,market_state,market_zip,selected_size_yards,lead_id,unlocked_at").single();
  if (error) throw new Error(`Comparison session update failed: ${error.message}`);
  return data;
}

export async function recordComparisonEvent({ sessionId, eventName, providerId = null, context = {} }) {
  assertServerOnly();
  if (!COMPARISON_EVENTS.has(eventName)) throw new Error("Invalid comparison event");
  const supabase = getSupabaseAdmin();
  const safeContext = context && typeof context === "object" && !Array.isArray(context) ? context : {};
  const now = new Date().toISOString();
  const { error } = await supabase.from("comparison_events").insert({ session_id: sessionId, event_name: eventName, provider_id: providerId || null, event_context: safeContext });
  if (error) throw new Error(`Comparison event insert failed: ${error.message}`);
  await supabase.from("comparison_sessions").update({ last_event_at: now, updated_at: now }).eq("id", sessionId);
}
