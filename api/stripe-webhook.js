// api/stripe-webhook.js
//
// Handles Stripe webhook events for Little Junkers payment confirmations.
// Primary event: checkout.session.completed
//
// This is SEPARATE from api/webhook.js (which handles Facebook Messenger).
//
// Setup in Stripe Dashboard:
//   Developers → Webhooks → Add endpoint
//   URL: https://book.littlejunkersllc.com/api/stripe-webhook
//   Events to listen for: checkout.session.completed
//
// Required env vars:
//   STRIPE_SECRET_KEY        — Stripe secret key (sk_live_... or sk_test_...)
//   STRIPE_WEBHOOK_SECRET    — Webhook signing secret from Stripe Dashboard (whsec_...)
//   ODOO_URL                 — e.g. https://www.littlejunkersllc.com
//   ODOO_DB                  — Odoo database name
//   ODOO_USERNAME            — Odoo login email
//   ODOO_API_KEY             — Odoo API key (not password)

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

// Stripe requires the raw request body for signature verification.
// Next.js API routes parse the body by default — disable that here.
export const config = {
  api: {
    bodyParser: false,
  },
};

// Read the raw body as a Buffer for Stripe signature verification.
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Odoo XML-RPC helpers ───────────────────────────────────────────────────

const ODOO_URL      = process.env.ODOO_URL;
const ODOO_DB       = process.env.ODOO_DB;
const ODOO_USERNAME = process.env.ODOO_USERNAME;
const ODOO_API_KEY  = process.env.ODOO_API_KEY;

async function odooCall(service, method, args) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    method:  "call",
    id:      1,
    params:  { service, method, args },
  });

  const res = await fetch(`${ODOO_URL}/web/dataset/call_kw`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  const json = await res.json();
  if (json.error) throw new Error(`Odoo error: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function getOdooUid() {
  const uid = await odooCall("common", "authenticate", [
    ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, {}
  ]);
  if (!uid) throw new Error("Odoo authentication failed.");
  return uid;
}

// Mark a CRM lead as won and write payment metadata back to it.
async function markLeadPaid(leadId, stripeSessionId, amountTotal) {
  const uid = await getOdooUid();

  // Write Stripe session ID and payment status into the lead note / description
  const note = `Payment confirmed via Stripe.\nSession: ${stripeSessionId}\nAmount: $${(amountTotal / 100).toFixed(2)}`;

  await odooCall("object", "execute_kw", [
    ODOO_DB, uid, ODOO_API_KEY,
    "crm.lead", "write",
    [[parseInt(leadId, 10)], {
      stage_id:    false, // Let Odoo automation handle stage progression
      description: note,
      // Custom field — only works if you've added it in Odoo Studio:
      // x_stripe_session_id: stripeSessionId,
    }]
  ]);

  // Attempt to mark won — this may fail if lead is already won, which is fine.
  try {
    await odooCall("object", "execute_kw", [
      ODOO_DB, uid, ODOO_API_KEY,
      "crm.lead", "action_set_won",
      [[parseInt(leadId, 10)]]
    ]);
  } catch (err) {
    // Non-fatal — lead may already be in a won state or the method may not exist
    console.warn("[Odoo] action_set_won failed (non-fatal):", err.message);
  }
}

// ── Main webhook handler ───────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sig    = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set.");
    return res.status(500).json({ error: "Webhook secret not configured." });
  }

  let event;
  let rawBody;

  try {
    rawBody = await getRawBody(req);
    event   = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
  }

  // ── Handle events ────────────────────────────────────────────────────────

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    const {
      odoo_lead_id,
      customer_name,
      dumpster_size,
      rental_option,
    } = session.metadata || {};

    const amountTotal    = session.amount_total;   // in cents
    const customerEmail  = session.customer_email;
    const stripeSessionId = session.id;

    console.log(
      `[Stripe Webhook] Payment confirmed — Lead: ${odoo_lead_id}, ` +
      `Customer: ${customer_name || customerEmail}, ` +
      `Size: ${dumpster_size}, Option: ${rental_option}, ` +
      `Amount: $${((amountTotal || 0) / 100).toFixed(2)}`
    );

    // Update Odoo if we have a lead ID
    if (odoo_lead_id && ODOO_URL && ODOO_DB && ODOO_USERNAME && ODOO_API_KEY) {
      try {
        await markLeadPaid(odoo_lead_id, stripeSessionId, amountTotal);
        console.log(`[Stripe Webhook] Odoo lead ${odoo_lead_id} marked paid.`);
      } catch (err) {
        // Log but don't fail the webhook — Stripe will retry on non-2xx
        console.error("[Stripe Webhook] Odoo update failed:", err.message);
      }
    } else {
      console.warn("[Stripe Webhook] Odoo env vars missing or no lead ID — skipping Odoo update.");
    }

    // TODO: Trigger Make.com scenario here if needed
    // e.g. POST to a Make webhook URL with session metadata
    // const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
    // if (makeWebhookUrl) { await fetch(makeWebhookUrl, { method:"POST", ... }) }
  }

  // Always return 200 to acknowledge receipt
  return res.status(200).json({ received: true });
}
