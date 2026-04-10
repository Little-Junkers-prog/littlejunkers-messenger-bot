// api/create-checkout.js
import Stripe from "stripe";

// Initialize Stripe with your secret key from Vercel environment variables
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { 
      leadId, 
      customerEmail, 
      dumpsterSize, 
      rentalOption, 
      basePrice, 
      deliveryFee, 
      zone 
    } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: "Missing Odoo leadId. Cannot process payment." });
    }

    // 1. Build the primary line item (The Dumpster)
    const lineItems = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${dumpsterSize} — ${rentalOption}`,
            description: "Includes delivery, pickup, and allotted tonnage.",
          },
          unit_amount: Math.round(basePrice * 100), // Stripe expects cents
        },
        quantity: 1,
      },
    ];

    // 2. Add the Zonal Delivery Fee if applicable (Zone B or C)
    if (deliveryFee > 0) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `Extended Area Delivery Fee (Zone ${zone})`,
          },
          unit_amount: Math.round(deliveryFee * 100), // Stripe expects cents
        },
        quantity: 1,
      });
    }

    // Determine the base URL for redirects (fallback to your domain)
    const origin = req.headers.origin || "https://book.littlejunkersllc.com";

    // 3. Create the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: customerEmail || undefined,
      line_items: lineItems,
      mode: "payment",
      
      // CRITICAL: This is how Make.com links the payment back to Odoo
      metadata: {
        odoo_lead_id: leadId.toString(),
      },
      
      // Redirects
      success_url: `${origin}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: origin, // If they hit back, send them back to the funnel
    });

    // Return the Checkout URL to the frontend
    return res.status(200).json({ url: session.url });

  } catch (error) {
    console.error("[Stripe Checkout Error]:", error);
    return res.status(500).json({ error: error.message || "Failed to create checkout session" });
  }
}
