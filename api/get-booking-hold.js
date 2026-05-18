// api/get-booking-hold.js
// Booking hold reader for the new booking_holds flow with legacy rentals fallback.
// Preserves the old response shape so complete-booking.js keeps working.

import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";
import {
  getPricingConfig,
  resolveTierPrice,
  sizeYardsToCode,
  sizeYardsToLabel,
  zoneKeyToRentalZone,
  normalizeSizeYards,
} from "../lib/pricingService";

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
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseNotesForTierKey(notes) {
  const raw = asString(notes);
  if (!raw) return "";
  const known = ["2day_montue", "2day_standard", "4day", "7day", "Early Bird", "Base Rental", "Weekend Warrior", "Full Reset"];
  return known.find((key) => raw === key || raw.includes(key)) || raw;
}

function dateOnlyToIso(value) {
  const raw = asString(value);
  if (!raw) return "";
  const date = new Date(`${raw.slice(0, 10)}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function dateTimeToIso(value) {
  const raw = asString(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? dateOnlyToIso(raw) : date.toISOString();
}

function sizeCodeFromHold(hold) {
  const explicit = asString(hold.size_code).toUpperCase();
  if (explicit) return explicit;
  const yards = normalizeSizeYards(hold.size_yards || hold.dumpster_size || hold.size);
  return yards ? sizeYardsToCode(yards) : "";
}

function sizeLabelFromCode(sizeCode) {
  const yards = normalizeSizeYards(sizeCode);
  return yards ? sizeYardsToLabel(yards) : "";
}

function buildAddressFromMetadata(metadata = {}) {
  const addr = metadata.deliveryAddress || metadata.delivery_address || null;
  if (typeof addr === "string") return addr;
  if (addr && typeof addr === "object") {
    return [addr.street1, addr.street2, addr.city, addr.state, addr.zip].filter(Boolean).join(", ");
  }
  return "";
}

async function resolveQuote({ rentalOption, sizeLabel, zip, zone }) {
  if (!rentalOption) return null;
  try {
    const pricingConfig = await getPricingConfig();
    return resolveTierPrice(pricingConfig, {
      tierKey: rentalOption,
      size: sizeLabel,
      zip,
      zone,
    });
  } catch (quoteError) {
    console.error("[get-booking-hold] quote resolution failed:", quoteError.message);
    return null;
  }
}

function buildLegacyRentalHold(rental, quote) {
  const customer = rental.customers || {};
  const sizeCode = sizeYardsToCode(rental.size_yards);
  const selectedWindow = {
    start: rental.dropoff_date,
    end: rental.scheduled_return,
    startIso: dateOnlyToIso(rental.dropoff_date),
    endIso: dateOnlyToIso(rental.scheduled_return),
  };
  const rentalOption = parseNotesForTierKey(rental.notes);
  const metadata = {
    source: "rentals_table",
    rentalId: rental.id,
    rentalOption: quote?.tierKey || rentalOption,
    displayLabel: quote?.displayLabel,
    selectedWindow,
    zone: quote?.serviceArea?.rentalZone || zoneKeyToRentalZone(rental.zone),
    serviceAreaZone: quote?.serviceArea?.zone,
    zip: asString(customer.zip),
    areaLabel: quote?.serviceArea?.areaLabel || asString(customer.city || customer.zip),
    deliveryAddress: rental.delivery_address,
    ...(quote
      ? {
          basePrice: quote.basePrice,
          deliveryFee: quote.deliveryFee,
          totalPrice: quote.totalPrice,
          priceBreakdown: {
            basePrice: quote.basePrice,
            deliveryFee: quote.deliveryFee,
            totalPrice: quote.totalPrice,
          },
        }
      : {}),
  };

  return {
    id: rental.id,
    rental_id: rental.id,
    size_code: sizeCode,
    requested_start_at: selectedWindow.startIso,
    requested_end_at: selectedWindow.endIso,
    delivery_date: rental.dropoff_date,
    rental_option: quote?.tierKey || rentalOption,
    status: rental.status,
    customer_name: customer.name || null,
    customer_email: customer.email || null,
    metadata,
    created_at: rental.created_at,
  };
}

function buildBookingHoldShape(hold, quote) {
  const metadata = hold.metadata || {};
  const sizeCode = sizeCodeFromHold(hold);
  const selectedWindow = {
    start: hold.delivery_date || hold.start_date || asString(hold.requested_start_at).slice(0, 10),
    end: hold.return_date || asString(hold.requested_end_at).slice(0, 10),
    startIso: dateTimeToIso(hold.requested_start_at || hold.delivery_date || hold.start_date),
    endIso: dateTimeToIso(hold.requested_end_at || hold.return_date),
  };
  const rentalOption = asString(hold.rental_option || metadata.rentalOption || metadata.tierKey || metadata.tier_key);
  const zip = asString(hold.zip || metadata.zip || metadata.deliveryAddress?.zip);
  const areaLabel = asString(metadata.areaLabel || metadata.area_label || zip);
  const deliveryAddress = asString(hold.delivery_address) || buildAddressFromMetadata(metadata);

  return {
    id: hold.id,
    booking_hold_id: hold.id,
    size_code: sizeCode,
    requested_start_at: selectedWindow.startIso,
    requested_end_at: selectedWindow.endIso,
    delivery_date: selectedWindow.start,
    rental_option: quote?.tierKey || rentalOption,
    status: hold.status,
    customer_name: hold.customer_name || metadata.customerName || null,
    customer_email: hold.customer_email || metadata.customerEmail || null,
    metadata: {
      ...metadata,
      source: "booking_holds_table",
      bookingHoldId: hold.id,
      rentalOption: quote?.tierKey || rentalOption,
      displayLabel: quote?.displayLabel || metadata.displayLabel,
      selectedWindow,
      zone: quote?.serviceArea?.rentalZone || metadata.zone || hold.zone || "local",
      serviceAreaZone: quote?.serviceArea?.zone || metadata.serviceAreaZone,
      zip,
      areaLabel: quote?.serviceArea?.areaLabel || areaLabel,
      deliveryAddress,
      ...(quote
        ? {
            basePrice: quote.basePrice,
            deliveryFee: quote.deliveryFee,
            totalPrice: quote.totalPrice,
            priceBreakdown: {
              basePrice: quote.basePrice,
              deliveryFee: quote.deliveryFee,
              totalPrice: quote.totalPrice,
            },
          }
        : {}),
    },
    created_at: hold.created_at,
  };
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use GET." });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  try {
    assertServerOnly();

    const holdId = asString(req.query.holdId || req.query.id);

    if (!holdId) {
      return res.status(400).json({ success: false, error: "Missing holdId." });
    }

    const supabase = getSupabaseAdmin();

    const { data: holdRow, error: holdError } = await supabase
      .from("booking_holds")
      .select("*")
      .eq("id", holdId)
      .maybeSingle();

    if (holdError) throw holdError;

    if (holdRow) {
      const sizeCode = sizeCodeFromHold(holdRow);
      const sizeLabel = sizeLabelFromCode(sizeCode);
      const metadata = holdRow.metadata || {};
      const rentalOption = asString(holdRow.rental_option || metadata.rentalOption || metadata.tierKey || metadata.tier_key);
      const quote = await resolveQuote({
        rentalOption,
        sizeLabel,
        zip: asString(holdRow.zip || metadata.zip || metadata.deliveryAddress?.zip),
        zone: asString(holdRow.zone || metadata.zone),
      });
      const hold = buildBookingHoldShape(holdRow, quote);
      return res.status(200).json({ success: true, hold, bookingHold: holdRow, source: "booking_holds" });
    }

    const { data: rental, error: rentalError } = await supabase
      .from("rentals")
      .select("id, customer_id, status, size_yards, delivery_address, zone, dropoff_date, scheduled_return, rental_days, amount_paid, notes, created_at, customers(id, name, phone, email, address, city, zip, zone)")
      .eq("id", holdId)
      .maybeSingle();

    if (rentalError) throw rentalError;

    if (!rental) {
      return res.status(404).json({ success: false, error: "Booking hold not found." });
    }

    const rentalOption = parseNotesForTierKey(rental.notes);
    const quote = await resolveQuote({
      rentalOption,
      sizeLabel: sizeYardsToLabel(rental.size_yards),
      zip: rental.customers?.zip,
      zone: rental.zone,
    });
    const hold = buildLegacyRentalHold(rental, quote);

    return res.status(200).json({ success: true, hold, rental, source: "rentals" });
  } catch (error) {
    console.error("[get-booking-hold] FAILED", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to load booking hold" });
  }
}
