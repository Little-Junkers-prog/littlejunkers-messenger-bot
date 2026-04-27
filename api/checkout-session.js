// api/checkout-session.js
// Returns metadata from a Stripe Checkout session for success page personalization.
// Only exposes safe, non-sensitive metadata fields.

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { session_id } = req.query;

  if (!session_id || !session_id.startsWith("cs_")) {
    return res.status(400).json({ error: "Invalid session_id" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ["payment_intent"],
    });

    // Only return safe display and analytics fields — no card data or secrets.
    return res.status(200).json({
      customer_name:  session.metadata?.customer_name || "",
      dumpster_size:  session.metadata?.dumpster_size || "",
      rental_option:  session.metadata?.rental_option || "",
      payment_status: session.payment_status || "",
      delivery_date:  session.metadata?.delivery_date || "",
      zone:           session.metadata?.zone || "",
      zip:            session.metadata?.zip || "",
      value:          typeof session.amount_total === "number" ? session.amount_total / 100 : null,
      currency:       session.currency ? session.currency.toUpperCase() : "USD",
    });
  } catch (err) {
    console.error("[checkout-session lookup error]:", err.message);
    return res.status(500).json({ error: "Could not retrieve session." });
  }
}
