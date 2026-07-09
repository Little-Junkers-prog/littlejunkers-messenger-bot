// api/create-checkout.js
import Stripe from "stripe";
import {
  getPricingConfig,
  resolveTierPrice,
} from "../lib/pricingService";
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";
import { evaluateWindow } from "../lib/services/availabilityService";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

const DEFAULT_RECHECK_HOLD_MINUTES = 30;

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

function getBaseUrl(req) {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.SITE_URL) return process.env.SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return req.headers.origin || "https://book.littlejunkersllc.com";
}

function parseOptionalDate(value) {
  const raw = asString(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function dateOnly(value) {
  const raw = asString(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function holdSizeYards(hold = {}) {
  const direct = Number(hold.size_yards || hold.dumpster_size || hold.size);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const code = asString(hold.size_code).toUpperCase();
  if (code === "11YD") return 11;
  if (code === "16YD") return 16;
  if (code === "21YD") return 21;
  return null;
}

function holdStartDate(hold = {}) {
  const metadata = hold.metadata || {};
  const selectedWindow = metadata.selectedWindow || metadata.selected_window || {};
  return dateOnly(
    hold.start_date ||
    hold.delivery_date ||
    hold.dropoff_date ||
    hold.requested_start_at ||
    selectedWindow.start ||
    selectedWindow.startIso ||
    selectedWindow.start_at
  );
}

function holdEndDate(hold = {}) {
  const metadata = hold.metadata || {};
  const selectedWindow = metadata.selectedWindow || metadata.selected_window || {};
  return dateOnly(
    hold.return_date ||
    hold.scheduled_return ||
    hold.requested_end_at ||
    selectedWindow.end ||
    selectedWindow.endIso ||
    selectedWindow.end_at
  );
}

function isTerminalHoldStatus(status) {
  return ["cancelled", "canceled", "converted", "completed", "released"].includes(asString(status).toLowerCase());
}

function isExpiredHold(hold = {}, now = new Date()) {
  const status = asString(hold.status).toLowerCase();
  if (status === "expired") return true;
  const expiresAt = hold.expires_at ? new Date(hold.expires_at) : null;
  return Boolean(expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt <= now);
}

async function getRecheckHoldMinutes(supabase) {
  try {
    const { data, error } = await supabase
      .from("availability_settings")
      .select("setting_key, setting_value, active")
      .eq("setting_key", "hold_expiry_minutes")
      .eq("active", true)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const minutes = Number(data?.setting_value);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_RECHECK_HOLD_MINUTES;
  } catch (error) {
    console.warn("[create-checkout] availability_settings lookup skipped:", error.message);
    return DEFAULT_RECHECK_HOLD_MINUTES;
  }
}

async function validateCheckoutHold({ supabase, holdId, quote, selectedWindowStart, selectedWindowEnd }) {
  const { data: hold, error } = await supabase
    .from("booking_holds")
    .select("*")
    .eq("id", holdId)
    .maybeSingle();

  if (error) throw error;
  if (!hold) {
    const err = new Error("Booking hold not found. Please restart checkout so we can confirm availability.");
    err.statusCode = 404;
    err.code = "BOOKING_HOLD_NOT_FOUND";
    throw err;
  }

  if (isTerminalHoldStatus(hold.status)) {
    const err = new Error("This booking link has already been completed or released. Please start a fresh booking request.");
    err.statusCode = 409;
    err.code = "BOOKING_HOLD_CLOSED";
    throw err;
  }

  const requestStart = dateOnly(selectedWindowStart);
  const requestEnd = dateOnly(selectedWindowEnd);
  const storedStart = holdStartDate(hold);
  const storedEnd = holdEndDate(hold);
  const storedSize = holdSizeYards(hold);

  if ((storedSize && storedSize !== Number(quote.sizeYards)) ||
    (storedStart && requestStart && storedStart !== requestStart) ||
    (storedEnd && requestEnd && storedEnd !== requestEnd)) {
    const err = new Error("This booking link no longer matches the selected dumpster window. Please restart checkout so we can confirm availability.");
    err.statusCode = 409;
    err.code = "BOOKING_HOLD_CONTEXT_MISMATCH";
    throw err;
  }

  if (!isExpiredHold(hold)) {
    return {
      hold,
      refreshed: false,
      availability: null,
      checkoutHoldState: "active_hold",
    };
  }

  if (!requestStart || !requestEnd) {
    const err = new Error("This booking link needs a fresh availability check, but the selected window is missing. Please choose a drop-off date again.");
    err.statusCode = 409;
    err.code = "HOLD_EXPIRED_WINDOW_MISSING";
    throw err;
  }

  const availability = await evaluateWindow({
    sizeYards: quote.sizeYards,
    startDate: requestStart,
    endDate: requestEnd,
    source: "stripe-checkout-expired-hold-recheck",
    audit: true,
  });

  if (!availability.available) {
    const err = new Error("Your original reservation window has passed, and that dumpster/date is no longer available. Please choose another available date.");
    err.statusCode = 409;
    err.code = "HOLD_EXPIRED_WINDOW_UNAVAILABLE";
    err.availability = availability;
    throw err;
  }

  const recheckHoldMinutes = await getRecheckHoldMinutes(supabase);
  const refreshedExpiresAt = new Date(Date.now() + recheckHoldMinutes * 60 * 1000).toISOString();
  const metadata = hold.metadata && typeof hold.metadata === "object" ? hold.metadata : {};
  const nextMetadata = {
    ...metadata,
    lateIntentRecoveredAt: new Date().toISOString(),
    priorExpiresAt: hold.expires_at || null,
    recheckedAvailability: {
      availableUnits: availability.availableUnits,
      reason: availability.reason,
      source: "stripe-checkout-expired-hold-recheck",
    },
  };

  const { data: refreshedHold, error: updateError } = await supabase
    .from("booking_holds")
    .update({
      status: "active",
      expires_at: refreshedExpiresAt,
      metadata: nextMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", holdId)
    .select("*")
    .single();

  if (updateError) throw updateError;

  return {
    hold: refreshedHold,
    refreshed: true,
    refreshedExpiresAt,
    recheckHoldMinutes,
    availability,
    checkoutHoldState: "expired_hold_rechecked_available",
  };
}

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
    assertServerOnly();

    const {
      leadId,
      supabaseLeadId,
      bookingHoldId,
      holdId,
      customerEmail,
      customerName,
      customerPhone,
      dumpsterSize,
      rentalOption,
      tierKey,
      zone,
      zip,
      areaLabel,
      deliveryDate,
      selectedWindow,
      requestedStartAt,
      requestedEndAt,
      saleOrderName,
      orderName,
      odooOrderId,
      odooRentalOrderId,
      deliveryAddress,
      deliveryNotes,
    } = req.body || {};

    const resolvedHoldId = asString(bookingHoldId || holdId);
    if (!resolvedHoldId) {
      return res.status(400).json({
        error: "Missing bookingHoldId. Create a Supabase hold before checkout.",
      });
    }

    const requestedTierKey = asString(tierKey || rentalOption);
    if (!dumpsterSize || !requestedTierKey) {
      return res.status(400).json({
        error: "Missing dumpster size or rental option.",
      });
    }

    const pricingConfig = await getPricingConfig();
    const quote = resolveTierPrice(pricingConfig, {
      tierKey: requestedTierKey,
      size: dumpsterSize,
      zip,
      zone,
    });

    const basePriceCents = asMoneyCents(quote.basePrice);
    const deliveryFeeCents = asMoneyCents(quote.deliveryFee);

    if (basePriceCents === null || deliveryFeeCents === null) {
      return res.status(400).json({ error: "Invalid Supabase pricing configuration." });
    }

    // Server-side tier / delivery-day eligibility enforcement.
    // This is the authoritative pricing integrity check. The UI calendar also
    // blocks invalid dates, but this server validation is the final gate before
    // any money moves. If a client bypasses the UI, this catches it.
    const tierConfig = pricingConfig.pricingByTierKey[quote.tierKey];
    const dayRestriction = tierConfig?.dayRestriction;
    if (dayRestriction) {
      const DAY_RESTRICTION_MAP = {
        mon_tue: [1, 2], "mon/tue": [1, 2], montue: [1, 2], monday_tuesday: [1, 2],
        weekday: [1, 2, 3, 4, 5],
        mon: [1], tue: [2], wed: [3], thu: [4], fri: [5],
      };
      const validDays = DAY_RESTRICTION_MAP[String(dayRestriction).toLowerCase().trim()];
      if (validDays) {
        const deliveryDateStr =
          selectedWindow?.startIso ||
          selectedWindow?.start ||
          requestedStartAt;
        if (deliveryDateStr) {
          const deliveryDate = new Date(deliveryDateStr);
          const dayOfWeek = deliveryDate.getUTCDay();
          if (!validDays.includes(dayOfWeek)) {
            const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
            const eligible = validDays.map((d) => dayNames[d]).join(" or ");
            console.error(`[create-checkout] Tier/day violation: tier=${quote.tierKey} restriction=${dayRestriction} deliveryDay=${dayNames[dayOfWeek]}`);
            return res.status(400).json({
              error: `The "${quote.displayLabel}" pricing is only available for ${eligible} delivery. Please select a valid delivery date.`,
              code: "TIER_DAY_INELIGIBLE",
            });
          }
        }
      }
    }

    const selectedWindowStart =
      parseOptionalDate(selectedWindow?.startIso) ||
      parseOptionalDate(selectedWindow?.startDateTime) ||
      parseOptionalDate(selectedWindow?.start_at) ||
      parseOptionalDate(selectedWindow?.start) ||
      parseOptionalDate(requestedStartAt);

    const selectedWindowEnd =
      parseOptionalDate(selectedWindow?.endIso) ||
      parseOptionalDate(selectedWindow?.endDateTime) ||
      parseOptionalDate(selectedWindow?.end_at) ||
      parseOptionalDate(selectedWindow?.end) ||
      parseOptionalDate(requestedEndAt);

    const supabase = getSupabaseAdmin();
    const holdValidation = await validateCheckoutHold({
      supabase,
      holdId: resolvedHoldId,
      quote,
      selectedWindowStart,
      selectedWindowEnd,
    });

    const resolvedSaleOrderName = asString(saleOrderName || orderName);
    const resolvedLeadId = asString(leadId);
    const resolvedAreaLabel = asString(areaLabel || quote.serviceArea?.areaLabel);
    const resolvedZone = asString(quote.serviceArea?.zone || zone);
    const resolvedRentalZone = asString(quote.serviceArea?.rentalZone || zone);
    const resolvedDeliveryAddress = asString(deliveryAddress);

    const lineItems = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${quote.sizeLabel} - ${quote.displayLabel}`,
            description: "Includes delivery, pickup, and allotted tonnage.",
          },
          unit_amount: basePriceCents,
        },
        quantity: 1,
      },
    ];

    if (deliveryFeeCents > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `${quote.serviceArea?.zoneLabel || "Extended Area"} Delivery Fee`,
          },
          unit_amount: deliveryFeeCents,
        },
        quantity: 1,
      });
    }

    const baseUrl = getBaseUrl(req);

    const metadata = {
      odoo_lead_id: resolvedLeadId,
      supabase_lead_id: String(supabaseLeadId || ""),
      booking_hold_id: resolvedHoldId,
      hold_id: resolvedHoldId,
      checkout_hold_state: String(holdValidation.checkoutHoldState || ""),
      hold_rechecked_at: holdValidation.refreshed ? String(new Date().toISOString()) : "",
      hold_recheck_expires_at: String(holdValidation.refreshedExpiresAt || ""),
      customer_name: String(customerName || ""),
      customer_phone: String(customerPhone || ""),
      customer_email: String(customerEmail || ""),
      dumpster_size: String(quote.sizeLabel),
      size_code: String(quote.sizeCode),
      size_yards: String(quote.sizeYards),
      rental_option: String(quote.displayLabel),
      tier_key: String(quote.tierKey),
      base_price: String(quote.basePrice),
      delivery_fee: String(quote.deliveryFee),
      total_price: String(quote.totalPrice),
      zone: String(resolvedRentalZone || ""),
      service_area_zone: String(resolvedZone || ""),
      zip: String(zip || ""),
      area_label: String(resolvedAreaLabel || ""),
      delivery_address: String(resolvedDeliveryAddress || ""),
      delivery_notes: String(deliveryNotes || ""),
      delivery_date: String(deliveryDate || ""),
      selected_window_start: String(selectedWindowStart || ""),
      selected_window_end: String(selectedWindowEnd || ""),
      sale_order_name: String(resolvedSaleOrderName || ""),
      odoo_order_id: String(odooOrderId || ""),
      odoo_rental_order_id: String(odooRentalOrderId || ""),
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: customerEmail || undefined,
      phone_number_collection: {
        enabled: true,
      },
      billing_address_collection: "required",
      line_items: lineItems,
      metadata,
      payment_intent_data: {
        metadata,
      },
      success_url: `${baseUrl}/book?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/complete-booking?holdId=${encodeURIComponent(resolvedHoldId)}`,
    });

    return res.status(200).json({
      url: session.url,
      sessionId: session.id,
      bookingHoldId: resolvedHoldId,
      hold: {
        id: holdValidation.hold?.id || resolvedHoldId,
        checkoutHoldState: holdValidation.checkoutHoldState,
        refreshed: holdValidation.refreshed,
        expiresAt: holdValidation.refreshedExpiresAt || holdValidation.hold?.expires_at || null,
      },
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
    console.error("[Stripe Checkout Error]:", error);

    return res.status(error.statusCode || 500).json({
      error: error.message || "Failed to create checkout session",
      code: error.code || "CHECKOUT_CREATE_FAILED",
      availability: error.availability || null,
    });
  }
}
