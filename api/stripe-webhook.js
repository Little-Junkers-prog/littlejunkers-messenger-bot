// api/stripe-webhook.js
// On checkout.session.completed, converts a booking_holds row into a confirmed rental,
// creates a payment record, logs the event, and sends confirmation SMS.

import Stripe from "stripe";
import smsModule from "../lib/sms";
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";
import { markBookingHoldConverted } from "../lib/services/availabilityService";

const { sendSms } = smsModule;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const s = asString(value);
    if (s) return s;
  }
  return "";
}

function parseOptionalDateOnly(value) {
  const raw = asString(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function normalizeSizeYards(value) {
  const raw = asString(value).toUpperCase();
  const map = { "11YD": 11, "16YD": 16, "21YD": 21, "11 YARD": 11, "16 YARD": 16, "21 YARD": 21 };
  const exact = map[raw];
  if (exact) return exact;
  const match = raw.match(/\d+/);
  const yards = match ? Number(match[0]) : null;
  return [11, 16, 21].includes(yards) ? yards : null;
}

function inferZone(value) {
  const raw = asString(value).toLowerCase();
  if (raw === "zone2" || raw === "2" || raw === "b") return "zone2";
  if (raw === "zone3" || raw === "3" || raw === "c") return "zone3";
  return "local";
}

function normalizePhone(value) {
  const raw = asString(value).replace(/\D/g, "");
  if (!raw) return null;
  return raw.length === 10 ? `+1${raw}` : raw.startsWith("1") ? `+${raw}` : raw;
}

function formatShortDate(value) {
  const raw = asString(value);
  if (!raw) return "";
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

function pick(row, keys, fallback = null) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return fallback;
}

async function markLeadConverted(supabase, supabaseLeadId, rentalId) {
  if (!supabaseLeadId || !rentalId) return;
  const { error } = await supabase
    .from("leads")
    .update({
      converted: true,
      converted_rental_id: rentalId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", supabaseLeadId);
  if (error) {
    // Non-blocking — log but do not throw. Rental is already confirmed.
    console.error("[stripe-webhook] leads conversion update failed (non-blocking):", error.message);
  }
}

async function findConvertedRentalBySession(supabase, stripeSessionId) {
  if (!stripeSessionId) return null;
  const { data } = await supabase
    .from("rentals")
    .select("*")
    .eq("stripe_session_id", stripeSessionId)
    .maybeSingle();
  return data || null;
}

async function findBookingHold(supabase, holdId) {
  if (!holdId) return null;
  const { data, error } = await supabase
    .from("booking_holds")
    .select("*")
    .eq("id", holdId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function upsertCustomerFromSession(supabase, session, existingCustomerId) {
  const customerEmail = session.customer_details?.email || asString(session.metadata?.customer_email) || null;
  const customerPhone = normalizePhone(session.customer_details?.phone || asString(session.metadata?.customer_phone));
  const customerName = asString(session.metadata?.customer_name) || null;

  if (existingCustomerId) {
    await supabase
      .from("customers")
      .update({
        ...(customerEmail ? { email: customerEmail } : {}),
        ...(customerPhone ? { phone: customerPhone } : {}),
        ...(customerName ? { name: customerName } : {}),
      })
      .eq("id", existingCustomerId);
    return existingCustomerId;
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({
      name: customerName || "Unknown",
      phone: customerPhone || "0000000000",
      email: customerEmail || null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function createConfirmedRental(supabase, hold, session, customerId) {
  const meta = session.metadata || {};
  const sizeYards = normalizeSizeYards(
    pick(hold, ["size_yards", "size", "size_code"], null) ||
    meta.size_yards ||
    meta.size_code ||
    meta.dumpster_size
  );
  const zone = inferZone(meta.zone || pick(hold, ["zone"], "local"));
  const deliveryAddress = firstNonEmpty(
    meta.delivery_address,
    // Stripe collects billing address — use it as fallback if delivery address is missing
    (() => {
      const b = session.customer_details?.address;
      if (!b) return "";
      return [b.line1, b.line2, b.city, b.state, b.postal_code].filter(Boolean).join(", ");
    })(),
    pick(hold, ["delivery_address", "address"], ""),
    hold.metadata?.deliveryAddress,
    meta.area_label,
    "TBD"
  );
  const dropoffDate =
    parseOptionalDateOnly(pick(hold, ["start_date", "dropoff_date", "requested_start_at"], null)) ||
    parseOptionalDateOnly(meta.delivery_date) ||
    parseOptionalDateOnly(meta.selected_window_start);
  const scheduledReturn =
    parseOptionalDateOnly(pick(hold, ["return_date", "scheduled_return", "requested_end_at"], null)) ||
    parseOptionalDateOnly(meta.selected_window_end);
  const amountPaid = session.amount_total ? session.amount_total / 100 : null;
  const rentalDays = dropoffDate && scheduledReturn
    ? Math.max(1, Math.round((new Date(scheduledReturn) - new Date(dropoffDate)) / (1000 * 60 * 60 * 24)))
    : null;

  const payload = {
    status: "confirmed",
    customer_id: customerId,
    stripe_session_id: session.id,
    stripe_payment_id: session.payment_intent || null,
    amount_paid: amountPaid,
    payment_source: "funnel",
    size_yards: sizeYards,
    delivery_address: deliveryAddress,
    zone,
    dropoff_date: dropoffDate,
    scheduled_return: scheduledReturn,
    ...(rentalDays ? { rental_days: rentalDays } : {}),
    // notes: customer delivery instructions take priority over tier label.
    // delivery_notes comes from the Step 6 funnel textarea (gate codes, wood planks, placement, etc.)
    notes: firstNonEmpty(
      meta.delivery_notes,
      meta.rental_option,
      meta.tier_key,
      hold.metadata?.rentalOption
    ) || null,
  };

  const { data, error } = await supabase
    .from("rentals")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function createPaymentRecord(supabase, rental, session, customerId) {
  const { error } = await supabase.from("payments").insert({
    rental_id: rental.id,
    customer_id: customerId,
    source: "stripe",
    stripe_session_id: session.id,
    stripe_payment_id: session.payment_intent || null,
    amount: session.amount_total ? session.amount_total / 100 : 0,
    currency: session.currency || "usd",
    status: "received",
    payload: {
      stripe_session_id: session.id,
      payment_status: session.payment_status,
      customer_email: session.customer_details?.email || null,
    },
  });
  if (error) throw error;
}

async function logEvent(supabase, rentalId, customerId, session, holdId) {
  await supabase.from("events").insert({
    event_type: "payment_received",
    source: "funnel",
    rental_id: rentalId,
    customer_id: customerId,
    payload: {
      booking_hold_id: holdId,
      stripe_session_id: session.id,
      payment_intent: session.payment_intent,
      amount_total: session.amount_total,
      payment_status: session.payment_status,
    },
  });
}

async function sendConfirmationSms(rental, session) {
  const phone = normalizePhone(session.customer_details?.phone || asString(session.metadata?.customer_phone));
  if (!phone) return;

  const rentalOption = asString(session.metadata?.rental_option) || "rental";
  const sizeLabel = asString(session.metadata?.dumpster_size) || "dumpster";
  const dropoffText = formatShortDate(rental.dropoff_date || session.metadata?.delivery_date);
  const returnText = formatShortDate(rental.scheduled_return || session.metadata?.selected_window_end);
  const windowText = dropoffText && returnText
    ? `${dropoffText} to ${returnText}`
    : dropoffText || "your scheduled window";

  const body = `Little Junkers: Your dumpster booking is confirmed. We have you scheduled for your ${sizeLabel} ${rentalOption}. Delivery window: ${windowText}. Reply here or call 470-548-4733 with questions.`;

  try {
    await sendSms({ to: phone, body });
  } catch (err) {
    console.error("[stripe-webhook] SMS failed (non-blocking):", err.message);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  assertServerOnly();

  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET_SUPABASE;

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type !== "checkout.session.completed") {
    return res.status(200).json({ received: true });
  }

  const session = event.data.object;
  const meta = session.metadata || {};
  const holdId = asString(meta.booking_hold_id || meta.hold_id);
  const supabaseLeadId = asString(meta.supabase_lead_id);
  const supabase = getSupabaseAdmin();

  try {
    const alreadyConverted = await findConvertedRentalBySession(supabase, session.id);
    if (alreadyConverted) {
      console.log("[stripe-webhook] Already converted, skipping:", session.id);
      return res.status(200).json({ received: true });
    }

    const hold = await findBookingHold(supabase, holdId);
    if (!hold) {
      console.error("[stripe-webhook] No booking_hold found for holdId:", holdId, "session:", session.id);
      await supabase.from("events").insert({
        event_type: "payment_received_without_hold",
        source: "funnel",
        payload: { booking_hold_id: holdId, stripe_session_id: session.id, metadata: meta },
      });
      return res.status(200).json({ received: true, warning: "No booking hold found" });
    }

    const customerId = await upsertCustomerFromSession(supabase, session, hold.customer_id);
    const confirmedRental = await createConfirmedRental(supabase, hold, session, customerId);
    await markBookingHoldConverted({ holdId: hold.id, rentalId: confirmedRental.id, stripeSessionId: session.id });
    await markLeadConverted(supabase, supabaseLeadId, confirmedRental.id);
    await createPaymentRecord(supabase, confirmedRental, session, customerId);
    await logEvent(supabase, confirmedRental.id, customerId, session, hold.id);
    await sendConfirmationSms(confirmedRental, session);

    console.log("[stripe-webhook] Rental confirmed:", confirmedRental.id);
  } catch (err) {
    console.error("[stripe-webhook] Processing failed:", err);
  }

  return res.status(200).json({ received: true });
}
