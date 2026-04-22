// api/update-booking-hold.js
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

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

function mergeMetadata(existingMetadata, patch) {
  return {
    ...(existingMetadata || {}),
    ...(patch || {}),
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

    const { data: existing, error: fetchError } = await supabase
      .from("booking_holds")
      .select("id, status, metadata")
      .eq("id", holdId)
      .maybeSingle();

    if (fetchError) {
      throw fetchError;
    }

    if (!existing) {
      return res.status(404).json({ success: false, error: "Booking hold not found." });
    }

    const contact = body.contact || {};
    const deliveryAddress = body.deliveryAddress || {};

    const metadataPatch = {
      source: "csr_customer_completion",
      funnelSource: asString(body.funnelSource || "csr_quick_book"),
      areaLabel: asString(body.areaLabel),
      zone: asString(body.zone),
      zip: asString(body.zip || deliveryAddress.zip),
      deliveryAddress: {
        street1: asString(deliveryAddress.street1),
        street2: asString(deliveryAddress.street2),
        city: asString(deliveryAddress.city),
        state: asString(deliveryAddress.state || "GA"),
        zip: asString(deliveryAddress.zip),
      },
      customerPhone: asString(contact.phone || body.customerPhone),
      customerEmail: asString(contact.email || body.customerEmail),
      notes: asString(body.notes),
      customerCompletedAt: new Date().toISOString(),
    };

    const updatePayload = {
      customer_name: asString(contact.name || body.customerName) || null,
      customer_email: asString(contact.email || body.customerEmail) || null,
      metadata: mergeMetadata(existing.metadata, metadataPatch),
    };

    const { data, error } = await supabase
      .from("booking_holds")
      .update(updatePayload)
      .eq("id", holdId)
      .select("id, status, customer_name, customer_email, metadata, requested_start_at, requested_end_at, rental_option, size_code")
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: "Booking hold updated successfully.",
      hold: data,
    });
  } catch (error) {
    console.error("[update-booking-hold] FAILED", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to update booking hold",
    });
  }
}
