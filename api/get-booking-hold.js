// api/get-booking-hold.js
// Backward-compatible hold reader backed by public.rentals.
// create-booking-hold.js now creates a pending rental row instead of writing to booking_holds.
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";
import {
  getPricingConfig,
  resolveTierPrice,
  sizeYardsToCode,
  sizeYardsToLabel,
  zoneKeyToRentalZone,
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
    const { data: rental, error } = await supabase
      .from("rentals")
      .select("id, customer_id, status, size_yards, delivery_address, zone, dropoff_date, scheduled_return, rental_days, amount_paid, notes, created_at, customers(id, name, phone, email, address, city, zip, zone)")
      .eq("id", holdId)
      .maybeSingle();

    if (error) throw error;

    if (!rental) {
      return res.status(404).json({ success: false, error: "Booking hold not found." });
    }

    const customer = rental.customers || {};
    const sizeCode = sizeYardsToCode(rental.size_yards);
    const sizeLabel = sizeYardsToLabel(rental.size_yards);
    const selectedWindow = {
      start: rental.dropoff_date,
      end: rental.scheduled_return,
      startIso: dateOnlyToIso(rental.dropoff_date),
      endIso: dateOnlyToIso(rental.scheduled_return),
    };

    const rentalOption = parseNotesForTierKey(rental.notes);
    let quote = null;
    let metadata = {
      source: "rentals_table",
      rentalId: rental.id,
      rentalOption,
      selectedWindow,
      zone: zoneKeyToRentalZone(rental.zone),
      zip: asString(customer.zip),
      areaLabel: asString(customer.city || customer.zip),
      deliveryAddress: rental.delivery_address,
    };

    if (rentalOption) {
      try {
        const pricingConfig = await getPricingConfig();
        quote = resolveTierPrice(pricingConfig, {
          tierKey: rentalOption,
          size: sizeLabel || rental.size_yards,
          zip: customer.zip,
          zone: rental.zone,
        });
        metadata = {
          ...metadata,
          rentalOption: quote.tierKey,
          displayLabel: quote.displayLabel,
          basePrice: quote.basePrice,
          deliveryFee: quote.deliveryFee,
          totalPrice: quote.totalPrice,
          priceBreakdown: {
            basePrice: quote.basePrice,
            deliveryFee: quote.deliveryFee,
            totalPrice: quote.totalPrice,
          },
          zone: quote.serviceArea?.rentalZone || metadata.zone,
          serviceAreaZone: quote.serviceArea?.zone,
          areaLabel: quote.serviceArea?.areaLabel || metadata.areaLabel,
        };
      } catch (quoteError) {
        console.error("[get-booking-hold] quote resolution failed:", quoteError.message);
      }
    }

    // Return the old hold shape so complete-booking.js keeps working while the
    // customer page is migrated to rentals terminology.
    const hold = {
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

    return res.status(200).json({ success: true, hold, rental });
  } catch (error) {
    console.error("[get-booking-hold] FAILED", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to load booking hold" });
  }
}
