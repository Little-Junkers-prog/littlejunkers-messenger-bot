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

// ── Odoo helpers — mirrors submit-lead.js auth/call pattern exactly ────────

function xe(v) {
  return String(v)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
function xv(val) {
  if (val === null || val === undefined || val === false) return "<value><boolean>0</boolean></value>";
  if (val === true) return "<value><boolean>1</boolean></value>";
  if (typeof val === "number" && Number.isInteger(val)) return `<value><int>${val}</int></value>`;
  if (typeof val === "number") return `<value><double>${val}</double></value>`;
  if (typeof val === "string") return `<value><string>${xe(val)}</string></value>`;
  if (Array.isArray(val)) return `<value><array><data>${val.map(xv).join("")}</data></array></value>`;
  if (typeof val === "object") return `<value><struct>${Object.entries(val).map(([k,v]) => `<member><n>${xe(k)}</n>${xv(v)}</member>`).join("")}</struct></value>`;
  return `<value><string>${xe(String(val))}</string></value>`;
}

async function xmlrpcAuth() {
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;
  const body =
    `<?xml version="1.0"?><methodCall><methodName>authenticate</methodName><params>` +
    `<param>${xv(ODOO_DB)}</param><param>${xv(ODOO_USER)}</param>` +
    `<param>${xv(ODOO_API_KEY)}</param><param>${xv({})}</param>` +
    `</params></methodCall>`;
  const r = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
    method: "POST", headers: { "Content-Type": "text/xml" }, body,
  });
  const xml = await r.text();
  const m = xml.match(/<(?:int|i4)>(-?\d+)<\/(?:int|i4)>/);
  const uid = m ? parseInt(m[1], 10) : null;
  if (!uid) throw new Error("XML-RPC auth failed");
  return uid;
}

async function odooCall(uid, model, method, args, kwargs = {}) {
  const { ODOO_URL, ODOO_DB, ODOO_API_KEY } = process.env;
  const r = await fetch(`${ODOO_URL}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", method: "call", id: Date.now(),
      params: { service: "object", method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs] },
    }),
  });
  if (!r.ok) throw new Error(`Odoo /jsonrpc HTTP ${r.status}`);
  const json = await r.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

// Update payment status and record Stripe session ID on the CRM lead
async function markLeadPaid(leadId, stripeSessionId, amountTotal) {
  const uid = await xmlrpcAuth();
  const id  = parseInt(leadId, 10);

  await odooCall(uid, "crm.lead", "write", [[id], {
    x_studio_payment_status:        "Paid",
    x_studio_stripe_payment_intent: stripeSessionId,
  }]);

  console.log(`[Odoo] Lead ${id} marked Paid. Session: ${stripeSessionId}. Amount: $${((amountTotal||0)/100).toFixed(2)}`);
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
    if (odoo_lead_id && process.env.ODOO_URL && process.env.ODOO_DB && process.env.ODOO_USER && process.env.ODOO_API_KEY) {
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
