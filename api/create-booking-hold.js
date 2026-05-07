// api/create-booking-hold.js
// Sprint 2A: writes a pending rental row to public.rentals as the hold mechanism
// booking_holds table no longer used
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";
import { getAvailabilitySnapshot } from "../lib/availability";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

const VALID_SIZE_CODES = new Set(["11YD", "16YD", "21YD"]);
const DEFAULT_HOLD_MINUTES = 30;

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

function asInteger(v, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isInteger(n) ? n : fallback;
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

    const requestedStartAtIso = requestedStartAt.toISOString();
    const requestedEndAtIso = requestedEndAt.toISOString();
    const now = new Date();

    // Check availability before creating hold
    const availability = await getAvailabilitySnapshot({
      sizeCode: normalizedSizeCode,
      requestedStartAt: requestedStartAtIso,
      requestedEndAt: requestedEndAtIso,
      now,
    });

    if (availability.totals.availableUnits <= 0) {
      return res.status(409).json({
        success: false,
        error: "No units available for the requested window.",
        availability: {
          sizeCode: availability.request.sizeCode,
          candidateUnits: availability.totals.candidateUnits,
          availableUnits: availability.totals.availableUnits,
          blockedUnits: availability.totals.blockedUnits,
          tightWindow: availability.totals.tightWindow,
        },
      });
    }

    const supabase = getSupabaseAdmin();

    // Extract customer info
    const customerName = firstNonEmpty(body?.contact?.name, body?.customerName);
    const customerEmail = firstNonEmpty(body?.contact?.email, body?.customerEmail);
    const customerPhone = normalizePhone(
      firstNonEmpty(body?.contact?.phone, body?.customerPhone)
    );
    // deliveryAddress may arrive as a flat string, a { full } string, or a
    // { street1, street2, city, state, zip } object from the CSR manual form.
    // Flatten all cases to a single string before storing.
    const addrObj = body?.deliveryAddress;
    const flattenedAddress =
      typeof addrObj === "string"
        ? addrObj
        : addrObj && typeof addrObj === "object"
          ? [addrObj.full, addrObj.street1, addrObj.street2, addrObj.city, addrObj.state, addrObj.zip]
              .filter(Boolean).join(", ")
          : "";

    const deliveryAddress = firstNonEmpty(
      flattenedAddress,
      body?.address
    );
    const zone = inferZone(firstNonEmpty(body?.zone, "local"));
    const sizeYards = sizeCodeToYards(normalizedSizeCode);

    // Upsert customer by phone (if phone provided), otherwise insert
    let customerId = null;
    if (customerPhone) {
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("phone", customerPhone)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        // Update name/email if we have better data
        if (customerName || customerEmail) {
          await supabase
            .from("customers")
            .update({
              ...(customerName ? { name: customerName } : {}),
              ...(customerEmail ? { email: customerEmail } : {}),
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

    // Create pending rental as the hold
    const dropoffDate = toDateOnly(requestedStartAt);
    const scheduledReturn = toDateOnly(requestedEndAt);
    const rentalDays = Math.max(
      1,
      Math.round((requestedEndAt - requestedStartAt) / (1000 * 60 * 60 * 24))
    );

    const { data: rental, error: rentalError } = await supabase
      .from("rentals")
      .insert({
        customer_id: customerId,
        status: "pending",
        size_yards: sizeYards,
        delivery_address: deliveryAddress || "TBD",
        zone,
        dropoff_date: dropoffDate,
        scheduled_return: scheduledReturn,
        rental_days: rentalDays,
        payment_source: "funnel",
        notes: firstNonEmpty(body?.rentalOption) || null,
      })
      .select("id, status, size_yards, delivery_address, zone, dropoff_date, scheduled_return, rental_days, created_at")
      .single();

    if (rentalError) throw rentalError;

    // Log the hold event
    await supabase.from("events").insert({
      event_type: "availability_checked",
      source: "funnel",
      rental_id: rental.id,
      customer_id: customerId,
      payload: {
        sizeCode: normalizedSizeCode,
        availableUnitsBeforeHold: availability.totals.availableUnits,
        tightWindow: availability.totals.tightWindow,
        requestedStartAt: requestedStartAtIso,
        requestedEndAt: requestedEndAtIso,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Booking hold created successfully.",
      hold: {
        // Return as "hold" for backward compat with create-checkout.js which reads bookingHoldId
        id: rental.id,
        rental_id: rental.id,
        size_code: normalizedSizeCode,
        size_yards: rental.size_yards,
        dropoff_date: rental.dropoff_date,
        scheduled_return: rental.scheduled_return,
        rental_days: rental.rental_days,
        status: rental.status,
        customer_id: customerId,
        created_at: rental.created_at,
      },
      availability: {
        sizeCode: availability.request.sizeCode,
        candidateUnits: availability.totals.candidateUnits,
        availableUnitsBeforeHold: availability.totals.availableUnits,
        tightWindow: availability.totals.tightWindow,
      },
    });
  } catch (error) {
    console.error("[create-booking-hold] FAILED", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create booking hold",
    });
  }
}
