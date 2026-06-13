// api/booking-confirmation.js
// Sprint 9: Unified confirmation data fetch for /book.js.
//
// Stripe has two payment paths in this funnel:
//   1. Hosted Checkout (legacy): arrives at /book?session_id=cs_xxx
//   2. Embedded Payment Element (primary): arrives at /book?payment_intent=pi_xxx
//
// Both paths land on /book.js. This endpoint normalises them so
// /book.js can personalise the confirmation screen regardless of path.
//
// Returns safe display fields only — no card data or secrets.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { session_id, payment_intent } = req.query;

  // ── Path 1: Hosted Checkout Session ───────────────────────────────────────
  if (session_id && session_id.startsWith("cs_")) {
    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      return res.status(200).json({
        path:           "checkout_session",
        customerName:   session.metadata?.customer_name   || "",
        dumpsterSize:   session.metadata?.dumpster_size   || "",
        rentalOption:   session.metadata?.rental_option   || "",
        deliveryDate:   session.metadata?.delivery_date   || "",
        zone:           session.metadata?.zone            || "",
        zip:            session.metadata?.zip             || "",
        paymentStatus:  session.payment_status            || "",
        value:          typeof session.amount_total === "number"
                          ? session.amount_total / 100
                          : null,
        currency:       session.currency
                          ? session.currency.toUpperCase()
                          : "USD",
        // For survey linkage
        supabaseLeadId: session.metadata?.supabase_lead_id || null,
        rentalId:       session.metadata?.rental_id        || null,
      });
    } catch (err) {
      console.error("[booking-confirmation] checkout session error:", err.message);
      return res.status(500).json({ error: "Could not retrieve session." });
    }
  }

  // ── Path 2: Embedded Payment Element (PaymentIntent) ─────────────────────
  if (payment_intent && payment_intent.startsWith("pi_")) {
    try {
      const pi = await stripe.paymentIntents.retrieve(payment_intent);

      return res.status(200).json({
        path:           "payment_intent",
        customerName:   pi.metadata?.customer_name   || "",
        dumpsterSize:   pi.metadata?.dumpster_size   || "",
        rentalOption:   pi.metadata?.rental_option   || "",
        deliveryDate:   pi.metadata?.delivery_date   || "",
        zone:           pi.metadata?.zone            || "",
        zip:            pi.metadata?.zip             || "",
        paymentStatus:  pi.status === "succeeded" ? "paid" : pi.status,
        value:          typeof pi.amount === "number"
                          ? pi.amount / 100
                          : null,
        currency:       pi.currency
                          ? pi.currency.toUpperCase()
                          : "USD",
        // For survey linkage
        supabaseLeadId: pi.metadata?.supabase_lead_id || null,
        rentalId:       pi.metadata?.rental_id        || null,
      });
    } catch (err) {
      console.error("[booking-confirmation] payment intent error:", err.message);
      return res.status(500).json({ error: "Could not retrieve payment." });
    }
  }

  // No valid identifier provided — return empty success so /book.js
  // can still render the confirmation screen without personalisation.
  return res.status(200).json({
    path:          "unknown",
    customerName:  "",
    dumpsterSize:  "",
    rentalOption:  "",
    deliveryDate:  "",
    paymentStatus: "",
    value:         null,
    currency:      "USD",
    supabaseLeadId: null,
    rentalId:       null,
  });
}
