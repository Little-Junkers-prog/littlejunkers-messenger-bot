// lib/randy/businessTools.js
// Server-only Supabase and SMS tools used by Randy.

import twilio from "twilio";
import { getSupabaseAdmin, assertServerOnly } from "../supabaseAdmin";
import {
  getPricingConfig,
  resolveServiceAreaForZip,
  resolveTierPrice,
  normalizeSizeYards,
  sizeYardsToLabel,
} from "../pricingService";

const BLOCKING_RENTAL_STATUSES = ["confirmed", "active"];
const HOLD_RENTAL_STATUS = "pending";
const HOLD_EXPIRY_MINUTES = 30;
const WINDOW_DAYS = 45;
const MAX_WINDOWS_PER_TIER = 3;

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDisplay(d) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function getTierValidDays(tier) {
  const restriction = String(tier.dayRestriction || "").toLowerCase();
  if (restriction === "mon_tue") return [1, 2];
  if (tier.tierKey === "2day_standard") return [0, 3, 4, 5, 6];
  return null;
}

function isStartDayAllowed(d, tier) {
  const validDays = getTierValidDays(tier);
  return !validDays || validDays.includes(d.getDay());
}

function normalizeDateRange(row) {
  const start = parseDateOnly(row.dropoff_date);
  const end = parseDateOnly(row.scheduled_return);
  if (!start || !end) return null;
  return { start, end };
}

function dateRangesOverlap(startA, endA, startB, endB) {
  return startA < endB && endA > startB;
}

function buildBlockedDates({ rentals, units, sizeYards, today, windowEnd }) {
  const unitsForSize = units.filter((u) => Number(u.size_yards) === sizeYards);
  const activeUnitIds = new Set(
    unitsForSize.filter((u) => u.status !== "maintenance").map((u) => u.id)
  );
  const deployedUnitIds = new Set(
    unitsForSize.filter((u) => u.status === "deployed").map((u) => u.id)
  );

  const unitCapacity = activeUnitIds.size;
  const blocked = new Set();
  const cur = new Date(today);

  while (cur <= windowEnd) {
    const nextDay = addDays(cur, 1);
    let used = deployedUnitIds.size;

    for (const rental of rentals) {
      if (Number(rental.size_yards) !== sizeYards) continue;
      const range = normalizeDateRange(rental);
      if (!range) continue;
      if (!dateRangesOverlap(cur, nextDay, range.start, range.end)) continue;
      used += 1;
    }

    if (unitCapacity <= 0 || used >= unitCapacity) {
      blocked.add(toDateStr(cur));
    }

    cur.setDate(cur.getDate() + 1);
  }

  return blocked;
}

function isWindowClear(start, durationDays, blocked, today, windowEnd) {
  if (start <= today || start > windowEnd) return false;
  for (let i = 0; i < durationDays; i += 1) {
    const day = addDays(start, i);
    if (day > windowEnd) return false;
    if (blocked.has(toDateStr(day))) return false;
  }
  return true;
}

function buildWindows(tier, blocked, today, windowEnd) {
  const durationDays = Number(tier.durationDays || 0);
  if (!durationDays) return [];

  const windows = [];
  const cur = addDays(today, 1);

  while (cur <= windowEnd && windows.length < MAX_WINDOWS_PER_TIER) {
    if (isStartDayAllowed(cur, tier) && isWindowClear(cur, durationDays, blocked, today, windowEnd)) {
      const end = addDays(cur, durationDays);
      windows.push({
        tierKey: tier.tierKey,
        displayLabel: tier.displayLabel,
        durationDays,
        start: toDateStr(cur),
        end: toDateStr(end),
        startLabel: formatDisplay(cur),
        endLabel: formatDisplay(end),
      });
    }
    cur.setDate(cur.getDate() + 1);
  }

  return windows;
}

async function getUnitsAndRentals(supabase, sizeYards, today, windowEnd) {
  const holdCutoff = new Date(Date.now() - HOLD_EXPIRY_MINUTES * 60 * 1000).toISOString();
  const [unitsRes, blockingRentalsRes, pendingHoldsRes] = await Promise.all([
    supabase.from("units").select("id, name, size_yards, status").eq("size_yards", sizeYards),
    supabase
      .from("rentals")
      .select("id, customer_id, unit_id, size_yards, status, dropoff_date, scheduled_return")
      .eq("size_yards", sizeYards)
      .in("status", BLOCKING_RENTAL_STATUSES)
      .lt("dropoff_date", toDateStr(addDays(windowEnd, 1)))
      .gt("scheduled_return", toDateStr(today)),
    supabase
      .from("rentals")
      .select("id, customer_id, unit_id, size_yards, status, dropoff_date, scheduled_return, created_at")
      .eq("size_yards", sizeYards)
      .eq("status", HOLD_RENTAL_STATUS)
      .lt("dropoff_date", toDateStr(addDays(windowEnd, 1)))
      .gt("scheduled_return", toDateStr(today))
      .gte("created_at", holdCutoff),
  ]);

  if (unitsRes.error) throw unitsRes.error;
  if (blockingRentalsRes.error) throw blockingRentalsRes.error;
  if (pendingHoldsRes.error) throw pendingHoldsRes.error;

  return {
    units: unitsRes.data || [],
    rentals: [...(blockingRentalsRes.data || []), ...(pendingHoldsRes.data || [])],
  };
}

export async function getSalesContext({ zip, sizeYards, tierKey = "2day_standard" } = {}) {
  assertServerOnly();
  const config = await getPricingConfig();
  const normalizedSizeYards = normalizeSizeYards(sizeYards) || 11;
  const serviceArea = zip ? resolveServiceAreaForZip(config, zip) : null;

  let price = null;
  if (zip && serviceArea?.serviceable) {
    price = resolveTierPrice(config, {
      tierKey,
      sizeYards: normalizedSizeYards,
      zip,
    });
  }

  return {
    config,
    serviceArea,
    price,
    sizeYards: normalizedSizeYards,
    sizeLabel: sizeYardsToLabel(normalizedSizeYards),
  };
}

export async function getAvailabilityContext({ sizeYards }) {
  assertServerOnly();
  const normalizedSizeYards = normalizeSizeYards(sizeYards) || 11;
  const supabase = getSupabaseAdmin();
  const pricingConfig = await getPricingConfig();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = addDays(today, WINDOW_DAYS);

  const { units, rentals } = await getUnitsAndRentals(supabase, normalizedSizeYards, today, windowEnd);
  const blocked = buildBlockedDates({ rentals, units, sizeYards: normalizedSizeYards, today, windowEnd });
  const tiers = pricingConfig.pricing.map((tier) => ({
    tier,
    windows: buildWindows(tier, blocked, today, windowEnd),
  }));

  return {
    sizeYards: normalizedSizeYards,
    sizeLabel: sizeYardsToLabel(normalizedSizeYards),
    tiers,
    soonest: tiers.flatMap((t) => t.windows).sort((a, b) => a.start.localeCompare(b.start))[0] || null,
  };
}

export async function createRandySession(payload = {}) {
  assertServerOnly();
  const supabase = getSupabaseAdmin();
  const row = {
    source: "randy_chat",
    status: payload.status || "open",
    phone: payload.phone || null,
    email: payload.email || null,
    zip_code: payload.zip || null,
    project_type: payload.projectType || null,
    recommended_size_yards: payload.sizeYards || null,
    conversation_summary: payload.summary || null,
    metadata: payload.metadata || {},
  };

  const { data, error } = await supabase.from("randy_sessions").insert(row).select("id").single();
  if (error) {
    // The table may not exist yet in early rollout. Do not break the chat.
    console.warn("[randy] randy_sessions insert skipped:", error.message);
    return null;
  }
  return data;
}

export async function findActiveRentalForCustomer({ phone, email, zip }) {
  assertServerOnly();
  const supabase = getSupabaseAdmin();
  const sanitizedPhone = String(phone || "").replace(/\D/g, "");
  const sanitizedEmail = String(email || "").trim().toLowerCase();

  if (!sanitizedPhone && !sanitizedEmail) return null;

  let customerQuery = supabase.from("customers").select("id, name, phone, email").limit(5);
  if (sanitizedEmail) {
    customerQuery = customerQuery.ilike("email", sanitizedEmail);
  } else {
    customerQuery = customerQuery.ilike("phone", `%${sanitizedPhone.slice(-4)}%`);
  }

  const customersRes = await customerQuery;
  if (customersRes.error) throw customersRes.error;
  const customerIds = (customersRes.data || []).map((c) => c.id).filter(Boolean);
  if (!customerIds.length) return null;

  let rentalQuery = supabase
    .from("rentals")
    .select("id, customer_id, size_yards, status, dropoff_date, scheduled_return, delivery_address, zip_code")
    .in("customer_id", customerIds)
    .in("status", ["confirmed", "active", "pending"])
    .order("scheduled_return", { ascending: false })
    .limit(3);

  if (zip) rentalQuery = rentalQuery.eq("zip_code", zip);

  const rentalsRes = await rentalQuery;
  if (rentalsRes.error) throw rentalsRes.error;
  const rental = (rentalsRes.data || [])[0];
  if (!rental) return null;

  const customer = (customersRes.data || []).find((c) => c.id === rental.customer_id) || null;
  return { customer, rental };
}

export function buildPrefilledBookingUrl({ sessionId, zip, sizeYards, projectType } = {}) {
  const base = process.env.NEXT_PUBLIC_BOOKING_URL || process.env.BOOKING_URL || "https://book.littlejunkersllc.com/rent-a-dumpster";
  const url = new URL(base);
  url.searchParams.set("source", "randy");
  if (sessionId) url.searchParams.set("randy_session", sessionId);
  if (zip) url.searchParams.set("zip", zip);
  if (sizeYards) url.searchParams.set("size", `${sizeYards}`);
  if (projectType) url.searchParams.set("project", projectType);
  return url.toString();
}

export async function sendBookingLinkByText({ to, url }) {
  assertServerOnly();
  if (!to || !url) return { sent: false, error: "Missing phone or URL" };

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || (!messagingServiceSid && !from)) {
    return { sent: false, error: "Twilio is not configured" };
  }

  const client = twilio(accountSid, authToken);
  const messagePayload = {
    to,
    body: `Little Junkers: here is your direct booking link from Randy: ${url}`,
  };

  if (messagingServiceSid) {
    messagePayload.messagingServiceSid = messagingServiceSid;
  } else {
    messagePayload.from = from;
  }

  const message = await client.messages.create(messagePayload);

  return { sent: true, sid: message.sid };
}
