// api/update-booking-hold.js
// Backward-compatible hold updater backed by public.rentals.
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

    const { data: existingRental, error: fetchError } = await supabase
      .from("rentals")
      .select("id, customer_id, status, size_yards, delivery_address, zone, notes, customers(id, name, phone, email, address, city, zip, zone)")
      .eq("id", holdId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (!existingRental) {
      return res.status(404).json({ success: false, error: "Booking hold not found." });
    }

    const contact = body.contact || {};
    const deliveryAddress = body.deliveryAddress || {};
    const customerName = asString(contact.name || body.customerName);
    const customerEmail = asString(contact.email || body.customerEmail);
    const customerPhone = normalizePhone(contact.phone || body.customerPhone);
    const zip = asString(body.zip || deliveryAddress.zip || existingRental.customers?.zip);
    const flattenedAddress = buildDeliveryAddress(deliveryAddress) || existingRental.delivery_address || "TBD";

    let serviceArea = null;
    if (zip) {
      const pricingConfig = await getPricingConfig();
      serviceArea = resolveServiceAreaForZip(pricingConfig, zip);
      if (!serviceArea.serviceable) {
        return res.status(400).json({ success: false, error: serviceArea.error });
      }
    }

    const customerPatch = {
      ...(customerName ? { name: customerName } : {}),
      ...(customerEmail ? { email: customerEmail } : {}),
      ...(customerPhone ? { phone: customerPhone } : {}),
      ...(flattenedAddress && flattenedAddress !== "TBD" ? { address: flattenedAddress } : {}),
      ...(asString(deliveryAddress.city) ? { city: asString(deliveryAddress.city) } : {}),
      ...(zip ? { zip } : {}),
      ...(serviceArea?.rentalZone ? { zone: serviceArea.rentalZone } : {}),
    };

    let customerId = existingRental.customer_id;
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

    await supabase.from("events").insert({
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

    return res.status(200).json({
      success: true,
      message: "Booking hold updated successfully.",
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
    });
  } catch (error) {
    console.error("[update-booking-hold] FAILED", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to update booking hold",
    });
  }
}
