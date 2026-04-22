// api/sync-odoo-rental.js
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

const VALID_BOOKING_STATUSES = new Set([
  "paid_pending_review",
  "reserved",
  "on_rent",
  "completed",
  "cancelled",
]);

const VALID_READINESS_STATUSES = new Set([
  "ready",
  "needs_emptying",
]);

const VALID_SIZE_CODES = new Set(["11YD", "16YD", "21YD"]);

function applyCors(req, res) {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-odoo-sync-key");
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizeBookingStatus(value) {
  const raw = asString(value).toLowerCase();
  return VALID_BOOKING_STATUSES.has(raw) ? raw : null;
}

function normalizeReadinessStatus(value) {
  const raw = asString(value).toLowerCase();
  return VALID_READINESS_STATUSES.has(raw) ? raw : null;
}

function inferSizeCodeFromText(value) {
  const raw = asString(value).toUpperCase();
  if (!raw) return null;
  if (raw.includes("11YD") || raw.includes("11 YARD") || raw.includes("11Y")) return "11YD";
  if (raw.includes("16YD") || raw.includes("16 YARD") || raw.includes("16Y")) return "16YD";
  if (raw.includes("21YD") || raw.includes("21 YARD") || raw.includes("21Y")) return "21YD";
  return null;
}

function normalizeSizeCode(value) {
  const raw = asString(value).toUpperCase();
  if (!raw) return null;

  const aliases = {
    "11 YARD": "11YD",
    "16 YARD": "16YD",
    "21 YARD": "21YD",
  };

  const normalized = aliases[raw] || raw;
  return VALID_SIZE_CODES.has(normalized) ? normalized : inferSizeCodeFromText(normalized);
}

function parseOptionalDate(value, fieldName) {
  const raw = asString(value);
  if (!raw) return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return date.toISOString();
}

function parseOptionalDateOnly(value, fieldName) {
  const raw = asString(value);
  if (!raw) return null;

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return date.toISOString().slice(0, 10);
}

function extractRelationId(value) {
  if (Number.isFinite(value)) return value;

  const raw = asString(value);
  if (raw && /^\d+$/.test(raw)) {
    return Number(raw);
  }

  if (Array.isArray(value) && value.length > 0) {
    const first = value[0];
    if (Number.isFinite(first)) return first;
    if (typeof first === "string" && /^\d+$/.test(first)) return Number(first);
  }

  if (value && typeof value === "object") {
    if (Number.isFinite(value.id)) return value.id;
    if (typeof value.id === "string" && /^\d+$/.test(value.id)) return Number(value.id);
  }

  return null;
}

function extractRelationName(value) {
  if (Array.isArray(value) && value.length > 1) {
    return asString(value[1]);
  }

  if (value && typeof value === "object") {
    return asString(value.display_name || value.name);
  }

  return asString(value);
}

function deriveEvent(body, req) {
  return asString(body?.event || req.query?.event || body?._event).toLowerCase();
}

function deriveSaleOrderName(body) {
  return asString(
    body?.saleOrderName ||
    body?.orderName ||
    body?.name ||
    body?.order_reference ||
    extractRelationName(body?.order_id) ||
    extractRelationName(body?.sale_order_id)
  );
}

function deriveOdooLeadId(body) {
  return extractRelationId(
    body?.odooLeadId ??
    body?.leadId ??
    body?.opportunity_id ??
    body?.opportunityId
  );
}

function deriveOdooOrderId(body) {
  return extractRelationId(
    body?.odooOrderId ??
    body?.id ??
    body?._id ??
    body?.order_id ??
    body?.sale_order_id
  );
}

function deriveSizeCode(body) {
  return normalizeSizeCode(
    body?.sizeCode ||
    body?.dumpsterSizeCode ||
    body?.selectedSize ||
    body?.product_size ||
    extractRelationName(body?.product_id) ||
    body?.product_name
  );
}

function deriveBookingStatus(body, event) {
  const explicitStatus = normalizeBookingStatus(body?.status);
  if (explicitStatus) return explicitStatus;

  if (["confirmation", "confirm", "enrichment", "reservation"].includes(event)) {
    return "reserved";
  }

  if (["pickup", "delivered", "on_rent"].includes(event)) {
    return "on_rent";
  }

  if (["return", "returned", "complete", "completed"].includes(event)) {
    return "completed";
  }

  return null;
}

function deriveReadinessStatus(body, event) {
  const explicitReadiness = normalizeReadinessStatus(body?.readinessStatus);
  if (explicitReadiness) return explicitReadiness;

  if (["return", "returned", "complete", "completed"].includes(event)) {
    return "ready";
  }

  return null;
}

function buildMetadataPatch(body, normalized) {
  return {
    lastOdooSyncAt: new Date().toISOString(),
    odooSyncSource: asString(body?.syncSource || "odoo_webhook"),
    odooEvent: normalized.event || null,
    odooStatusRaw: asString(body?.odooStatus || body?.status || normalized.bookingStatus),
    odooOrderId: asString(body?.odooOrderId || normalized.odooOrderId),
    odooRentalOrderId: asString(body?.odooRentalOrderId),
    saleOrderName: normalized.saleOrderName,
    odooSizeCode: normalized.sizeCode,
    syncNotes: asString(body?.syncNotes),
    rawOdooModel: asString(body?._model),
    rawOdooId: asString(body?._id || body?.id),
  };
}

function mergeMetadata(existingMetadata, patch) {
  return {
    ...(existingMetadata || {}),
    ...patch,
  };
}

async function findUnitByCode(supabase, dumpsterUnitCode) {
  const unitCode = asString(dumpsterUnitCode);
  if (!unitCode) return null;

  const { data, error } = await supabase
    .from("dumpster_units")
    .select("id, unit_code, size_code, lifecycle_status, readiness_status")
    .eq("unit_code", unitCode)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function findBookingByLeadId(supabase, odooLeadId) {
  if (!Number.isFinite(odooLeadId)) {
    return null;
  }

  const { data, error } = await supabase
    .from("rental_bookings")
    .select("*")
    .eq("odoo_lead_id", odooLeadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function findBookingBySaleOrderName(supabase, saleOrderName) {
  const orderName = asString(saleOrderName);
  if (!orderName) {
    return null;
  }

  const { data, error } = await supabase
    .from("rental_bookings")
    .select("*")
    .or([
      `metadata->>saleOrderName.eq.${orderName}`,
      `metadata->>odooSaleOrderName.eq.${orderName}`,
      `metadata->>sale_order_name.eq.${orderName}`,
      `metadata->>odoo_order_name.eq.${orderName}`,
    ].join(","))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

async function findBooking(supabase, { odooLeadId, saleOrderName }) {
  const bookingByLeadId = await findBookingByLeadId(supabase, odooLeadId);
  if (bookingByLeadId) {
    return bookingByLeadId;
  }

  return findBookingBySaleOrderName(supabase, saleOrderName);
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

    const expectedSyncKey = process.env.ODOO_SYNC_KEY;
    if (!expectedSyncKey) {
      throw new Error("Missing ODOO_SYNC_KEY");
    }

    const body = req.body || {};
    const providedSyncKey =
      asString(req.headers["x-odoo-sync-key"]) ||
      asString(body?.syncToken) ||
      asString(req.query?.syncToken);

    if (providedSyncKey !== expectedSyncKey) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized sync request",
      });
    }

    const event = deriveEvent(body, req);
    const saleOrderName = deriveSaleOrderName(body);
    const odooLeadId = deriveOdooLeadId(body);
    const odooOrderId = deriveOdooOrderId(body);
    const bookingStatus = deriveBookingStatus(body, event);
    const readinessStatus = deriveReadinessStatus(body, event);
    const sizeCode = deriveSizeCode(body);

    if (!Number.isFinite(odooLeadId) && !saleOrderName) {
      return res.status(400).json({
        success: false,
        error: "Provide odooLeadId/opportunity_id or saleOrderName/name/order_id.",
      });
    }

    const scheduledStartAt = parseOptionalDate(
      body?.scheduledStartAt || body?.rental_start_date,
      "scheduledStartAt"
    );
    const scheduledEndAt = parseOptionalDate(
      body?.scheduledEndAt || body?.rental_return_date,
      "scheduledEndAt"
    );
    const actualDeliveredAt = parseOptionalDate(
      body?.actualDeliveredAt || (["pickup", "delivered", "on_rent"].includes(event) ? new Date().toISOString() : null),
      "actualDeliveredAt"
    );
    const actualPickedUpAt = parseOptionalDate(
      body?.actualPickedUpAt || (["return", "returned", "complete", "completed"].includes(event) ? new Date().toISOString() : null),
      "actualPickedUpAt"
    );
    const expectedReturnDate = parseOptionalDateOnly(
      body?.expectedReturnDate || body?.rental_return_date,
      "expectedReturnDate"
    );

    const hasBookingPatch = Boolean(
      bookingStatus ||
      sizeCode ||
      scheduledStartAt ||
      scheduledEndAt ||
      actualDeliveredAt ||
      actualPickedUpAt ||
      expectedReturnDate ||
      saleOrderName ||
      asString(odooOrderId) ||
      asString(body?.odooRentalOrderId) ||
      asString(body?.syncNotes) ||
      asString(body?.dumpsterUnitCode)
    );

    if (!hasBookingPatch && !readinessStatus) {
      return res.status(400).json({
        success: false,
        error: "Provide at least one booking update field or readinessStatus.",
      });
    }

    const supabase = getSupabaseAdmin();

    const booking = await findBooking(supabase, { odooLeadId, saleOrderName });
    if (!booking) {
      return res.status(404).json({
        success: false,
        error: Number.isFinite(odooLeadId)
          ? `No rental_bookings row found for odooLeadId ${odooLeadId} or saleOrderName ${saleOrderName || "(none)"}`
          : `No rental_bookings row found for saleOrderName ${saleOrderName}`,
      });
    }

    const unit = await findUnitByCode(supabase, body?.dumpsterUnitCode);

    const bookingPatch = {};
    if (bookingStatus) {
      bookingPatch.status = bookingStatus;
    }
    if (sizeCode) {
      bookingPatch.size_code = sizeCode;
    }
    if (scheduledStartAt) {
      bookingPatch.scheduled_start_at = scheduledStartAt;
    }
    if (scheduledEndAt) {
      bookingPatch.scheduled_end_at = scheduledEndAt;
    }
    if (actualDeliveredAt) {
      bookingPatch.actual_delivered_at = actualDeliveredAt;
    }
    if (actualPickedUpAt) {
      bookingPatch.actual_picked_up_at = actualPickedUpAt;
    }
    if (expectedReturnDate) {
      bookingPatch.expected_return_date = expectedReturnDate;
    }
    if (unit?.id) {
      bookingPatch.dumpster_unit_id = unit.id;
      if (!sizeCode && unit?.size_code) {
        bookingPatch.size_code = unit.size_code;
      }
    }

    if (Number.isFinite(odooLeadId) && booking.odoo_lead_id !== odooLeadId) {
      bookingPatch.odoo_lead_id = odooLeadId;
    }

    bookingPatch.metadata = mergeMetadata(
      booking.metadata,
      buildMetadataPatch(body, {
        event,
        bookingStatus,
        saleOrderName,
        sizeCode,
        odooOrderId,
      })
    );

    const { data: updatedBooking, error: bookingError } = await supabase
      .from("rental_bookings")
      .update(bookingPatch)
      .eq("id", booking.id)
      .select(
        "id, odoo_lead_id, size_code, dumpster_unit_id, status, scheduled_start_at, scheduled_end_at, actual_delivered_at, actual_picked_up_at, expected_return_date, metadata, updated_at"
      )
      .single();

    if (bookingError) {
      throw bookingError;
    }

    let updatedUnit = null;

    if (unit && readinessStatus) {
      const { data, error } = await supabase
        .from("dumpster_units")
        .update({
          readiness_status: readinessStatus,
        })
        .eq("id", unit.id)
        .select("id, unit_code, size_code, lifecycle_status, readiness_status, updated_at")
        .single();

      if (error) {
        throw error;
      }

      updatedUnit = data;
    }

    return res.status(200).json({
      success: true,
      message: "Odoo rental sync applied successfully.",
      lookupUsed: {
        odooLeadId: Number.isFinite(odooLeadId) ? odooLeadId : null,
        saleOrderName: saleOrderName || null,
        matchedBookingId: booking.id,
      },
      booking: updatedBooking,
      unit: updatedUnit,
    });
  } catch (error) {
    console.error("[sync-odoo-rental] FAILED", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to sync Odoo rental update",
    });
  }
}
