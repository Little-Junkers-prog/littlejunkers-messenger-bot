// api/create-checkout.js
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

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
    const {
      leadId,
      bookingHoldId,
      holdId,
      customerEmail,
      customerName,
      dumpsterSize,
      rentalOption,
      basePrice,
      deliveryFee,
      zone,
      deliveryDate,
      selectedWindow,
      requestedStartAt,
      requestedEndAt,
      saleOrderName,
      orderName,
      odooOrderId,
      odooRentalOrderId,
    } = req.body || {};

    if (!leadId) {
      return res.status(400).json({
        error: "Missing Odoo leadId. Cannot process payment.",
      });
    }

    const resolvedHoldId = asString(bookingHoldId || holdId);
    if (!resolvedHoldId) {
      return res.status(400).json({
        error: "Missing bookingHoldId. Create a Supabase hold before checkout.",
      });
    }

    if (!dumpsterSize || !rentalOption) {
      return res.status(400).json({
        error: "Missing dumpster size or rental option.",
      });
    }

    const basePriceCents = asMoneyCents(basePrice);
    const deliveryFeeCents = asMoneyCents(deliveryFee || 0);

    if (basePriceCents === null) {
      return res.status(400).json({ error: "Invalid base price." });
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

    const resolvedSaleOrderName = asString(saleOrderName || orderName);

    const lineItems = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${dumpsterSize} — ${rentalOption}`,
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
            name: `Extended Area Delivery Fee (Zone ${zone || "B/C"})`,
          },
          unit_amount: deliveryFeeCents,
        },
        quantity: 1,
      });
    }

    const baseUrl = getBaseUrl(req);

    const metadata = {
      odoo_lead_id: String(leadId),
      booking_hold_id: resolvedHoldId,
      hold_id: resolvedHoldId,
      customer_name: String(customerName || ""),
      dumpster_size: String(dumpsterSize),
      rental_option: String(rentalOption),
      zone: String(zone || ""),
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
      line_items: lineItems,
      metadata,
      payment_intent_data: {
        metadata,
      },
      success_url: `${baseUrl}/book?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/rent-a-dumpster`,
    });

    return res.status(200).json({
      url: session.url,
      sessionId: session.id,
      bookingHoldId: resolvedHoldId,
    });
  } catch (error) {
    console.error("[Stripe Checkout Error]:", error);

    return res.status(500).json({
      error: error.message || "Failed to create checkout session",
    });
  }
}
