// api/create-payment-intent.js
// Creates a Stripe PaymentIntent for the embedded Payment Element flow.
// This replaces the hosted Checkout redirect (create-checkout.js) for Sprint 3+.
// create-checkout.js remains in place as an untouched fallback.

import Stripe from "stripe";
import {
  getPricingConfig,
  resolveTierPrice,
} from "../lib/pricingService";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function asMoneyCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseOptionalDate(value) {
  const raw = asString(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

// ── Server-side tier / delivery-day eligibility ───────────────────────────────
// Mirrors the same map in create-checkout.js. Both must stay in sync if new
// restriction keys are added in Supabase.
const DAY_RESTRICTION_MAP = {
  mon_tue: [1, 2], "mon/tue": [1, 2], montue: [1, 2], monday_tuesday: [1, 2],
  weekday: [1, 2, 3, 4, 5],
  mon: [1], tue: [2], wed: [3], thu: [4], fri: [5],
};

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ error: "Forbidden origin" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  try {
    const {
      bookingHoldId,
      supabaseLeadId,
      leadId,
      customerEmail,
      customerName,
      customerPhone,
      dumpsterSize,
      tierKey,
      basePrice,
      deliveryFee,
      zone,
      zip,
      deliveryDate,
      deliveryAddress,
      deliveryNotes,
      selectedWindow,
      requestedStartAt,
      requestedEndAt,
    } = req.body || {};

    // ── Required field validation ────────────────────────────────────────────
    if (!asString(bookingHoldId)) {
      return res.status(400).json({
        error: "Missing bookingHoldId. Create a Supabase hold before payment.",
      });
    }

    if (!dumpsterSize || !asString(tierKey)) {
      return res.status(400).json({
        error: "Missing dumpster size or tier key.",
      });
    }

    // ── Re-resolve pricing from Supabase (no client-provided prices trusted) ─
    const pricingConfig = await getPricingConfig();
    const quote = resolveTierPrice(pricingConfig, {
      tierKey: asString(tierKey),
      size: dumpsterSize,
      zip,
      zone,
    });

    const basePriceCents = asMoneyCents(quote.basePrice);
    const deliveryFeeCents = asMoneyCents(quote.deliveryFee);

    if (basePriceCents === null || deliveryFeeCents === null) {
      return res.status(400).json({ error: "Invalid Supabase pricing configuration." });
    }

    // ── Tier / delivery-day eligibility (server enforcement) ────────────────
    const tierConfig = pricingConfig.pricingByTierKey[quote.tierKey];
    const dayRestriction = tierConfig?.dayRestriction;
    if (dayRestriction) {
      const validDays = DAY_RESTRICTION_MAP[String(dayRestriction).toLowerCase().trim()];
      if (validDays) {
        const deliveryDateStr =
          selectedWindow?.startIso ||
          selectedWindow?.start ||
          requestedStartAt;
        if (deliveryDateStr) {
          const d = new Date(deliveryDateStr);
          const dayOfWeek = d.getUTCDay();
          if (!validDays.includes(dayOfWeek)) {
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const eligible = validDays.map((n) => dayNames[n]).join(" or ");
            console.error(
              `[create-payment-intent] Tier/day violation: tier=${quote.tierKey} restriction=${dayRestriction} deliveryDay=${dayNames[dayOfWeek]}`
            );
            return res.status(400).json({
              error: `The "${quote.displayLabel}" pricing is only available for ${eligible} delivery. Please select a valid delivery date.`,
              code: "TIER_DAY_INELIGIBLE",
            });
          }
        }
      }
    }

    // ── Build metadata (mirrors create-checkout.js shape for webhook parity) ─
    const selectedWindowStart =
      parseOptionalDate(selectedWindow?.startIso) ||
      parseOptionalDate(selectedWindow?.start) ||
      parseOptionalDate(requestedStartAt);

    const selectedWindowEnd =
      parseOptionalDate(selectedWindow?.endIso) ||
      parseOptionalDate(selectedWindow?.end) ||
      parseOptionalDate(requestedEndAt);

    const resolvedZone = asString(quote.serviceArea?.zone || zone);
    const resolvedRentalZone = asString(quote.serviceArea?.rentalZone || zone);

    const metadata = {
      booking_hold_id: asString(bookingHoldId),
      supabase_lead_id: asString(supabaseLeadId),
      odoo_lead_id: asString(leadId),
      customer_name: asString(customerName),
      customer_phone: asString(customerPhone),
      customer_email: asString(customerEmail),
      dumpster_size: asString(quote.sizeLabel),
      size_code: asString(quote.sizeCode),
      size_yards: asString(quote.sizeYards),
      rental_option: asString(quote.displayLabel),
      tier_key: asString(quote.tierKey),
      base_price: asString(quote.basePrice),
      delivery_fee: asString(quote.deliveryFee),
      total_price: asString(quote.totalPrice),
      zone: asString(resolvedRentalZone),
      service_area_zone: asString(resolvedZone),
      zip: asString(zip),
      area_label: asString(quote.serviceArea?.areaLabel),
      delivery_address: asString(deliveryAddress),
      delivery_notes: asString(deliveryNotes),
      delivery_date: asString(deliveryDate),
      selected_window_start: selectedWindowStart,
      selected_window_end: selectedWindowEnd,
    };

    // ── Create PaymentIntent ─────────────────────────────────────────────────
    const totalCents = basePriceCents + deliveryFeeCents;

    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: "usd",
      receipt_email: asString(customerEmail) || undefined,
      metadata,
      automatic_payment_methods: { enabled: true },
    });

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      quote: {
        tierKey: quote.tierKey,
        displayLabel: quote.displayLabel,
        sizeLabel: quote.sizeLabel,
        basePrice: quote.basePrice,
        deliveryFee: quote.deliveryFee,
        totalPrice: quote.totalPrice,
        zone: resolvedZone,
        rentalZone: resolvedRentalZone,
      },
    });
  } catch (error) {
    console.error("[create-payment-intent] Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to create payment intent",
    });
  }
}
