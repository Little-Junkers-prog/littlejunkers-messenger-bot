// lib/randy/businessTools.js
// Server-only Supabase and SMS tools used by Randy.
// Availability is provided by the shared availability service so Randy cannot drift from the funnel.

import twilio from "twilio";
import { getSupabaseAdmin, assertServerOnly } from "../supabaseAdmin";
import {
  getPricingConfig,
  resolveServiceAreaForZip,
  resolveTierPrice,
  normalizeSizeYards,
  sizeYardsToLabel,
} from "../pricingService";
import { getTierAvailability, addDays } from "../services/availabilityService";

const WINDOW_DAYS = 45;
const MAX_WINDOWS_PER_TIER = 3;

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getSalesContext({ zip, sizeYards, tierKey = "2day_standard" } = {}) {
  assertServerOnly();
  const config = await getPricingConfig();
  const normalizedSizeYards = normalizeSizeYards(sizeYards) || 11;
  const serviceArea = zip ? resolveServiceAreaForZip(config, zip) : null;

  let price = null;
  if (zip && serviceArea?.serviceable) {
    price = resolveTierPrice(config, { tierKey, sizeYards: normalizedSizeYards, zip });
  }

  return { config, serviceArea, price, sizeYards: normalizedSizeYards, sizeLabel: sizeYardsToLabel(normalizedSizeYards) };
}

export async function getAvailabilityContext({ sizeYards, zip } = {}) {
  assertServerOnly();
  const normalizedSizeYards = normalizeSizeYards(sizeYards) || 11;
  const pricingConfig = await getPricingConfig();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = addDays(today, WINDOW_DAYS);

  const tiers = [];
  for (const tier of pricingConfig.pricing) {
    let price = null;
    if (zip) {
      try {
        price = resolveTierPrice(pricingConfig, { tierKey: tier.tierKey, sizeYards: normalizedSizeYards, zip });
      } catch (err) {
        price = null;
      }
    }
    const windows = await getTierAvailability({ sizeYards: normalizedSizeYards, tier, today, windowEnd, maxWindows: MAX_WINDOWS_PER_TIER, price });
    tiers.push({ tier, price, windows });
  }

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
  if (sanitizedEmail) customerQuery = customerQuery.ilike("email", sanitizedEmail);
  else customerQuery = customerQuery.ilike("phone", `%${sanitizedPhone.slice(-4)}%`);

  const customersRes = await customerQuery;
  if (customersRes.error) throw customersRes.error;
  const customerIds = (customersRes.data || []).map((c) => c.id).filter(Boolean);
  if (!customerIds.length) return null;

  let rentalQuery = supabase
    .from("rentals")
    .select("id, customer_id, size_yards, status, dropoff_date, scheduled_return, delivery_address, zip_code")
    .in("customer_id", customerIds)
    .in("status", ["confirmed", "active"])
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

  if (!accountSid || !authToken || (!messagingServiceSid && !from)) return { sent: false, error: "Twilio is not configured" };

  const client = twilio(accountSid, authToken);
  const messagePayload = {
    to,
    body: `Little Junkers: here is your direct booking link from Randy: ${url}\n\nReply STOP to unsubscribe.`,
  };
  if (messagingServiceSid) messagePayload.messagingServiceSid = messagingServiceSid;
  else messagePayload.from = from;

  const message = await client.messages.create(messagePayload);
  return { sent: true, sid: message.sid };
}
