// api/create-booking-hold.js
// Creates a temporary booking hold in public.booking_holds.
// Holds reduce availability through public.availability_commitments.

import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";
import { createBookingHold } from "../lib/services/availabilityService";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

const VALID_SIZE_CODES = new Set(["11YD", "16YD", "21YD"]);

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

function asString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const s = asString(value);
    if (s) return s;
  }
  return "";
}

function normalizeSizeCode(value) {
  const raw = asString(value).toUpperCase();
  if (!raw) return null;
  if (VALID_SIZE_CODES.has(raw)) return raw;
  const map = {
    "11 YARD": "11YD", "16 YARD": "16YD", "21 YARD": "21YD",
  };
  return map[raw] || null;
}

function sizeCodeToYards(sizeCode) {
  const map = { "11YD": 11, "16YD": 16, "21YD": 21 };
  return map[sizeCode] || null;
}

function parseDateInput(value, fieldName) {
  const raw = asString(value);
  if (!raw) throw new Error(`Missing ${fieldName}`);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${fieldName}`);
  return date;
}

function toDateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function inferZone(value) {
  const raw = asString(value).toLowerCase();
  if (raw === "zone2" || raw === "2") return "zone2";
  if (raw === "zone3" || raw === "3") return "zone3";
  return "local";
}

function normalizePhone(value) {
  const raw = asString(value).replace(/\D/g, "");
  if (!raw) return null;
  return raw.length === 10 ? `+1${raw}` : raw.startsWith("1") ? `+${raw}` : raw;
}

function flattenAddress(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return [value.full, value.street1, value.street2, value.city, value.state, value.zip]
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

async function upsertCustomer({ supabase, customerName, customerEmail, customerPhone, deliveryAddress, zone }) {
  let customerId = null;

  if (customerPhone) {
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", customerPhone)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      if (customerName || customerEmail || deliveryAddress) {
        await supabase
          .from("customers")
          .update({
            ...(customerName ? { name: customerName } : {}),
            ...(customerEmail ? { email: customerEmail } : {}),
            ...(deliveryAddress ? { address: deliveryAddress } : {}),
            ...(zone ? { zone } : {}),
          })
          .eq("id", customerId);
      }
    }
  }

  if (!customerId) {
    const { data: newCustomer, error: customerError } = await supabase
      .from("customers")
      .insert({
        name: customerName || "Unknown",
        phone: customerPhone || "0000000000",
        email: customerEmail || null,
        address: deliveryAddress || null,
        zone,
      })
      .select("id")
      .single();

    if (customerError) throw customerError;
    customerId = newCustomer.id;
  }

  return customerId;
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  try {
    assertServerOnly();

    const body = req.body || {};
    const normalizedSizeCode = normalizeSizeCode(
      firstNonEmpty(body?.selectedSize, body?.recommendedSize, body?.sizeCode, body?.size)
    );

    if (!normalizedSizeCode) {
      return res.status(400).json({
        success: false,
        error: "Missing or invalid dumpster size. Use 11YD, 16YD, or 21YD.",
      });
    }

    const requestedStartAt = parseDateInput(
      firstNonEmpty(
        body?.selectedWindow?.startIso,
        body?.selectedWindow?.startDateTime,
        body?.selectedWindow?.start_at,
        body?.selectedWindow?.start,
        body?.requestedStartAt,
        body?.rentalStart
      ),
      "requestedStartAt"
    );

    const requestedEndAt = parseDateInput(
      firstNonEmpty(
        body?.selectedWindow?.endIso,
        body?.selectedWindow?.endDateTime,
        body?.selectedWindow?.end_at,
        body?.selectedWindow?.end,
        body?.requestedEndAt,
        body?.rentalEnd
      ),
      "requestedEndAt"
    );

    if (requestedEndAt <= requestedStartAt) {
      return res.status(400).json({
        success: false,
        error: "requestedEndAt must be after requestedStartAt.",
      });
    }

    const supabase = getSupabaseAdmin();
    const customerName = firstNonEmpty(body?.contact?.name, body?.customerName);
    const customerEmail = firstNonEmpty(body?.contact?.email, body?.customerEmail);
    const customerPhone = normalizePhone(firstNonEmpty(body?.contact?.phone, body?.customerPhone));
    const deliveryAddress = firstNonEmpty(flattenAddress(body?.deliveryAddress), body?.address);
    const zone = inferZone(firstNonEmpty(body?.zone, "local"));
    const sizeYards = sizeCodeToYards(normalizedSizeCode);
    const rentalDays = Math.max(1, Math.round((requestedEndAt - requestedStartAt) / (1000 * 60 * 60 * 24)));

    const customerId = await upsertCustomer({
      supabase,
      customerName,
      customerEmail,
      customerPhone,
      deliveryAddress,
      zone,
    });

    const holdType = firstNonEmpty(body?.holdType, body?.source === "manual" ? "manual_checkout_link" : "online_checkout");
    const { hold, availability, expiresAt, holdMinutes } = await createBookingHold({
      sizeYards,
      startDate: toDateOnly(requestedStartAt),
      endDate: toDateOnly(requestedEndAt),
      customerId,
      holdType,
      source: firstNonEmpty(body?.source, "funnel"),
      metadata: {
        customerName,
        customerEmail,
        customerPhone,
        deliveryAddress,
        zone,
        rentalDays,
        rentalOption: firstNonEmpty(body?.rentalOption),
      },
    });

    await supabase.from("events").insert({
      event_type: "booking_hold_created",
      source: "funnel",
      customer_id: customerId,
      payload: {
        hold_id: hold.id,
        sizeCode: normalizedSizeCode,
        availableUnitsBeforeHold: availability.availableUnits,
        requestedStartAt: requestedStartAt.toISOString(),
        requestedEndAt: requestedEndAt.toISOString(),
        expiresAt,
        holdMinutes,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Booking hold created successfully.",
      hold: {
        id: hold.id,
        booking_hold_id: hold.id,
        size_code: normalizedSizeCode,
        size_yards: sizeYards,
        dropoff_date: toDateOnly(requestedStartAt),
        scheduled_return: toDateOnly(requestedEndAt),
        rental_days: rentalDays,
        status: hold.status || "active",
        customer_id: customerId,
        expires_at: expiresAt,
        created_at: hold.created_at,
      },
      availability: {
        sizeCode: normalizedSizeCode,
        candidateUnits: availability.capacity,
        availableUnitsBeforeHold: availability.availableUnits,
        tightWindow: false,
      },
    });
  } catch (error) {
    console.error("[create-booking-hold] FAILED", error);

    if (error.availability) {
      return res.status(409).json({
        success: false,
        error: error.message || "No units available for the requested window.",
        availability: {
          sizeCode: error.availability.sizeCode,
          candidateUnits: error.availability.capacity,
          availableUnits: error.availability.availableUnits,
          blockedUnits: error.availability.usedCapacity,
        },
      });
    }

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create booking hold",
    });
  }
}
