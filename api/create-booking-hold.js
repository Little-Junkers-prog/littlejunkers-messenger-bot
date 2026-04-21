// api/create-booking-hold.js
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";
import { getAvailabilitySnapshot } from "../lib/availability";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

const VALID_SIZE_CODES = new Set(["11YD", "16YD", "21YD"]);
const DEFAULT_HOLD_MINUTES = 15;

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

function normalizeSizeCode(value) {
  const raw = asString(value).toUpperCase();

  if (!raw) return null;
  if (VALID_SIZE_CODES.has(raw)) return raw;

  const map = {
    "11 YARD": "11YD",
    "16 YARD": "16YD",
    "21 YARD": "21YD",
    "11YD": "11YD",
    "16YD": "16YD",
    "21YD": "21YD",
  };

  return map[raw] || null;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const s = asString(value);
    if (s) return s;
  }
  return "";
}

function parseDateInput(value, fieldName) {
  const raw = asString(value);
  if (!raw) {
    throw new Error(`Missing ${fieldName}`);
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return date;
}

function toIsoString(value) {
  return value.toISOString();
}

function buildExpiry(now, requestedMinutes) {
  const minutes = requestedMinutes > 0 ? requestedMinutes : DEFAULT_HOLD_MINUTES;
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function deriveDeliveryDate(startDate) {
  return startDate.toISOString().slice(0, 10);
}

function buildMetadata(body, normalizedSizeCode, requestedStartAtIso, requestedEndAtIso) {
  return {
    source: "website_checkout_hold",
    funnelSource: firstNonEmpty(body?.funnelSource, "website_checkout"),
    leadId: body?.leadId ?? null,
    sizeCode: normalizedSizeCode,
    rentalOption: firstNonEmpty(body?.rentalOption),
    saleOrderName: firstNonEmpty(body?.saleOrderName, body?.orderName),
    odooOrderId: firstNonEmpty(body?.odooOrderId),
    odooRentalOrderId: firstNonEmpty(body?.odooRentalOrderId),
    selectedWindow: {
      start: firstNonEmpty(body?.selectedWindow?.start, body?.selectedWindow?.startDateTime, body?.requestedStartAt),
      end: firstNonEmpty(body?.selectedWindow?.end, body?.selectedWindow?.endDateTime, body?.requestedEndAt),
      startIso: requestedStartAtIso,
      endIso: requestedEndAtIso,
    },
    deliveryAddress: body?.deliveryAddress || null,
    areaLabel: firstNonEmpty(body?.areaLabel),
    zone: firstNonEmpty(body?.zone),
    zip: firstNonEmpty(body?.zip, body?.deliveryAddress?.zip),
  };
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed. Use POST.",
    });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({
      success: false,
      error: "Forbidden origin",
    });
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

    const now = new Date();
    const holdMinutes = asInteger(body?.holdMinutes, DEFAULT_HOLD_MINUTES);
    const expiresAt = buildExpiry(now, holdMinutes);

    const requestedStartAtIso = toIsoString(requestedStartAt);
    const requestedEndAtIso = toIsoString(requestedEndAt);
    const expiresAtIso = toIsoString(expiresAt);

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

    const customerName = firstNonEmpty(body?.contact?.name, body?.customerName);
    const customerEmail = firstNonEmpty(body?.contact?.email, body?.customerEmail);
    const rentalOption = firstNonEmpty(body?.rentalOption);
    const leadIdRaw = firstNonEmpty(body?.leadId);
    const odooLeadId = leadIdRaw ? Number(leadIdRaw) : null;

    const insertPayload = {
      size_code: normalizedSizeCode,
      requested_start_at: requestedStartAtIso,
      requested_end_at: requestedEndAtIso,
      delivery_date: deriveDeliveryDate(requestedStartAt),
      rental_option: rentalOption || null,
      status: "active",
      expires_at: expiresAtIso,
      odoo_lead_id: Number.isFinite(odooLeadId) ? odooLeadId : null,
      customer_name: customerName || null,
      customer_email: customerEmail || null,
      metadata: buildMetadata(body, normalizedSizeCode, requestedStartAtIso, requestedEndAtIso),
    };

    const { data, error } = await supabase
      .from("booking_holds")
      .insert(insertPayload)
      .select(
        "id, size_code, requested_start_at, requested_end_at, delivery_date, rental_option, status, expires_at, odoo_lead_id, customer_name, customer_email, created_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: "Booking hold created successfully.",
      hold: data,
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
