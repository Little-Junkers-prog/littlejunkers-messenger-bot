// api/update-booking-hold.js
// Sprint 14B-P0: Admin-to-funnel handoff updater.
//
// Customer-facing checkout lives in the book.littlejunkersllc.com repo.
// Admin creates a booking_holds row and sends the customer here with holdId.
// This endpoint updates that booking_holds row after the customer confirms or
// completes missing contact/address details. It keeps the legacy rentals-table
// fallback for older links.

import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";
import { getPricingConfig, resolveServiceAreaForZip } from "../lib/pricingService";

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

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function normalizePhone(value) {
  const raw = asString(value).replace(/\D/g, "");
  if (!raw) return null;
  return raw.length === 10 ? `+1${raw}` : raw.startsWith("1") ? `+${raw}` : raw;
}

function buildDeliveryAddress(address) {
  if (typeof address === "string") return asString(address);
  if (!address || typeof address !== "object") return "";
  return [address.street1, address.street2, address.city, address.state, address.zip]
    .map(asString)
    .filter(Boolean)
    .join(", ");
}

function cleanDeliveryAddressObject(address = {}) {
  if (!address || typeof address !== "object") {
    return {
      street1: "",
      street2: "",
      city: "",
      state: "GA",
      zip: "",
    };
  }

  return {
    street1: asString(address.street1 || address.street || address.address || address.full),
    street2: asString(address.street2),
    city: asString(address.city),
    state: asString(address.state, "GA") || "GA",
    zip: asString(address.zip),
  };
}

function isObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function countFilled(values = []) {
  return values.reduce((count, value) => count + (asString(value) ? 1 : 0), 0);
}

function classifyHandoffStage({ customerName, customerEmail, customerPhone, addressObject, hold }) {
  const metadata = hold?.metadata || {};
  const size = asString(hold?.size_yards || hold?.size_code || metadata.sizeYards || metadata.size_code);
  const dropoff = asString(hold?.dropoff_date || hold?.start_date || hold?.requested_start_at);
  const rentalOption = asString(hold?.rental_option || metadata.rentalOption || metadata.tierKey);
  const addressCount = countFilled([
    addressObject.street1,
    addressObject.city,
    addressObject.state,
    addressObject.zip,
  ]);
  const contactCount = countFilled([customerName, customerEmail, customerPhone]);

  if (contactCount >= 2 && addressCount >= 4 && size && dropoff && rentalOption) {
    return "confirm_and_pay";
  }

  if ((contactCount >= 1 || addressCount >= 2) && (size || dropoff || rentalOption)) {
    return "complete_missing_details";
  }

  return "start_funnel";
}

async function resolveServiceArea(zip) {
  if (!zip) return null;
  const pricingConfig = await getPricingConfig();
  const serviceArea = resolveServiceAreaForZip(pricingConfig, zip);
  if (!serviceArea.serviceable) {
    const err = new Error(serviceArea.error || "This ZIP is not currently in the service area.");
    err.statusCode = 400;
    throw err;
  }
  return serviceArea;
}

async function safelyLogEvent(supabase, payload) {
  try {
    const { error } = await supabase.from("events").insert(payload);
    if (error) console.warn("[update-booking-hold] event log skipped:", error.message);
  } catch (error) {
    console.warn("[update-booking-hold] event log skipped:", error.message);
  }
}

async function updateCanonicalBookingHold({ supabase, holdId, body }) {
  const { data: existingHold, error: holdFetchError } = await supabase
    .from("booking_holds")
    .select("*")
    .eq("id", holdId)
    .maybeSingle();

  if (holdFetchError) throw holdFetchError;
  if (!existingHold) return null;

  const metadata = isObject(existingHold.metadata) ? existingHold.metadata : {};
  const contact = body.contact || {};
  const submittedAddress = body.deliveryAddress || {};
  const priorAddress = metadata.deliveryAddressObject || metadata.deliveryAddress || metadata.delivery_address || {};
  const addressObject = cleanDeliveryAddressObject(
    isObject(submittedAddress) && countFilled(Object.values(submittedAddress))
      ? submittedAddress
      : isObject(priorAddress)
        ? priorAddress
        : {}
  );

  const customerName = asString(contact.name || body.customerName || existingHold.customer_name || metadata.customerName);
  const customerEmail = asString(contact.email || body.customerEmail || existingHold.customer_email || metadata.customerEmail);
  const customerPhone = normalizePhone(contact.phone || body.customerPhone || existingHold.customer_phone || metadata.customerPhone);
  const zip = asString(body.zip || addressObject.zip || metadata.zip);
  const serviceArea = await resolveServiceArea(zip);
  const flattenedAddress = buildDeliveryAddress(addressObject) || asString(metadata.deliveryAddress) || "";
  const notes = asString(body.notes || metadata.notes || metadata.deliveryNotes);
  const handoffStage = classifyHandoffStage({
    customerName,
    customerEmail,
    customerPhone,
    addressObject,
    hold: existingHold,
  });

  const nextMetadata = {
    ...metadata,
    source: metadata.source || "admin_booking_handoff",
    funnelSource: body.funnelSource || metadata.funnelSource || "csr_booking_link",
    customerName: customerName || metadata.customerName || "",
    customerEmail: customerEmail || metadata.customerEmail || "",
    customerPhone: customerPhone || metadata.customerPhone || "",
    zip: zip || metadata.zip || "",
    zone: serviceArea?.rentalZone || body.zone || metadata.zone || "",
    serviceAreaZone: serviceArea?.zone || metadata.serviceAreaZone || "",
    areaLabel: serviceArea?.areaLabel || body.areaLabel || metadata.areaLabel || "",
    deliveryAddress: flattenedAddress,
    deliveryAddressObject: addressObject,
    notes,
    deliveryNotes: notes,
    handoffStage,
    customerConfirmedAt: new Date().toISOString(),
  };

  const holdPatch = {
    customer_name: customerName || null,
    customer_email: customerEmail || null,
    customer_phone: customerPhone || null,
    metadata: nextMetadata,
    updated_at: new Date().toISOString(),
  };

  const { data: updatedHold, error: holdUpdateError } = await supabase
    .from("booking_holds")
    .update(holdPatch)
    .eq("id", holdId)
    .select("*")
    .single();

  if (holdUpdateError) throw holdUpdateError;

  if (existingHold.customer_id) {
    const customerPatch = {
      ...(customerName ? { name: customerName } : {}),
      ...(customerEmail ? { email: customerEmail } : {}),
      ...(customerPhone ? { phone: customerPhone } : {}),
      ...(flattenedAddress ? { address: flattenedAddress } : {}),
      ...(addressObject.city ? { city: addressObject.city } : {}),
      ...(zip ? { zip } : {}),
      ...(serviceArea?.rentalZone ? { zone: serviceArea.rentalZone } : {}),
    };

    if (Object.keys(customerPatch).length) {
      const { error: customerUpdateError } = await supabase
        .from("customers")
        .update(customerPatch)
        .eq("id", existingHold.customer_id);
      if (customerUpdateError) throw customerUpdateError;
    }
  }

  await safelyLogEvent(supabase, {
    event_type: "booking_hold_updated",
    source: "customer_completion",
    customer_id: existingHold.customer_id || null,
    payload: {
      booking_hold_id: holdId,
      handoffStage,
      zip,
      serviceArea,
      customerUpdated: Boolean(existingHold.customer_id),
    },
  });

  return {
    success: true,
    message: "Booking hold updated successfully.",
    hold: {
      id: updatedHold.id,
      booking_hold_id: updatedHold.id,
      status: updatedHold.status,
      customer_name: updatedHold.customer_name,
      customer_email: updatedHold.customer_email,
      customer_phone: updatedHold.customer_phone,
      metadata: nextMetadata,
    },
    bookingHold: updatedHold,
    source: "booking_holds",
  };
}

async function updateLegacyRentalHold({ supabase, holdId, body }) {
  const { data: existingRental, error: fetchError } = await supabase
    .from("rentals")
    .select("id, customer_id, status, size_yards, delivery_address, zone, notes, customers(id, name, phone, email, address, city, zip, zone)")
    .eq("id", holdId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (!existingRental) return null;

  const contact = body.contact || {};
  const deliveryAddress = body.deliveryAddress || {};
  const customerName = asString(contact.name || body.customerName);
  const customerEmail = asString(contact.email || body.customerEmail);
  const customerPhone = normalizePhone(contact.phone || body.customerPhone);
  const zip = asString(body.zip || deliveryAddress.zip || existingRental.customers?.zip);
  const flattenedAddress = buildDeliveryAddress(deliveryAddress) || existingRental.delivery_address || "TBD";

  const serviceArea = await resolveServiceArea(zip);

  const customerPatch = {
    ...(customerName ? { name: customerName } : {}),
    ...(customerEmail ? { email: customerEmail } : {}),
    ...(customerPhone ? { phone: customerPhone } : {}),
    ...(flattenedAddress && flattenedAddress !== "TBD" ? { address: flattenedAddress } : {}),
    ...(asString(deliveryAddress.city) ? { city: asString(deliveryAddress.city) } : {}),
    ...(zip ? { zip } : {}),
    ...(serviceArea?.rentalZone ? { zone: serviceArea.rentalZone } : {}),
  };

  const customerId = existingRental.customer_id;
  if (customerId && Object.keys(customerPatch).length) {
    const { error: customerUpdateError } = await supabase
      .from("customers")
      .update(customerPatch)
      .eq("id", customerId);
    if (customerUpdateError) throw customerUpdateError;
  }

  const rentalPatch = {
    delivery_address: flattenedAddress,
    ...(serviceArea?.rentalZone ? { zone: serviceArea.rentalZone } : {}),
    notes: [
      asString(existingRental.notes),
      asString(body.notes),
      asString(body.funnelSource ? `source:${body.funnelSource}` : ""),
    ].filter(Boolean).join(" | ") || null,
  };

  const { data: updatedRental, error: rentalUpdateError } = await supabase
    .from("rentals")
    .update(rentalPatch)
    .eq("id", holdId)
    .select("id, customer_id, status, size_yards, delivery_address, zone, dropoff_date, scheduled_return, rental_days, amount_paid, notes, created_at")
    .single();

  if (rentalUpdateError) throw rentalUpdateError;

  await safelyLogEvent(supabase, {
    event_type: "rental_updated",
    source: "customer_completion",
    rental_id: updatedRental.id,
    customer_id: customerId,
    payload: {
      holdId,
      zip,
      serviceArea,
      customerUpdated: Object.keys(customerPatch).length > 0,
    },
  });

  return {
    success: true,
    message: "Legacy rental updated successfully.",
    hold: {
      id: updatedRental.id,
      rental_id: updatedRental.id,
      status: updatedRental.status,
      metadata: {
        source: "rentals_table",
        zone: serviceArea?.rentalZone || updatedRental.zone,
        serviceAreaZone: serviceArea?.zone,
        zip,
        areaLabel: serviceArea?.areaLabel,
        deliveryAddress: flattenedAddress,
        customerPhone,
        customerEmail,
        notes: asString(body.notes),
        customerCompletedAt: new Date().toISOString(),
      },
    },
    rental: updatedRental,
    source: "rentals",
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
    return res.status(405).json({ success: false, error: "Method not allowed. Use POST." });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  try {
    assertServerOnly();

    const body = req.body || {};
    const holdId = asString(body.holdId || body.bookingHoldId);

    if (!holdId) {
      return res.status(400).json({ success: false, error: "Missing holdId." });
    }

    const supabase = getSupabaseAdmin();

    const bookingHoldResult = await updateCanonicalBookingHold({ supabase, holdId, body });
    if (bookingHoldResult) return res.status(200).json(bookingHoldResult);

    const legacyRentalResult = await updateLegacyRentalHold({ supabase, holdId, body });
    if (legacyRentalResult) return res.status(200).json(legacyRentalResult);

    return res.status(404).json({
      success: false,
      error: "Booking hold not found.",
      code: "BOOKING_HOLD_NOT_FOUND",
      holdId,
    });
  } catch (error) {
    console.error("[update-booking-hold] FAILED", error);

    return res.status(error.statusCode || 500).json({
      success: false,
      error: error.message || "Failed to update booking hold",
    });
  }
}
