// api/stripe-webhook.js (hardened)
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-01-27.acacia",
});

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function xmlrpcAuth() {
  const { ODOO_URL, ODOO_DB, ODOO_USER, ODOO_API_KEY } = process.env;
  const body = `<?xml version="1.0"?><methodCall><methodName>authenticate</methodName><params>` +
    `<param><value><string>${ODOO_DB}</string></value></param>` +
    `<param><value><string>${ODOO_USER}</string></value></param>` +
    `<param><value><string>${ODOO_API_KEY}</string></value></param>` +
    `<param><value><struct/></value></param></params></methodCall>`;

  const r = await fetch(`${ODOO_URL}/xmlrpc/2/common`, {
    method: "POST",
    headers: { "Content-Type": "text/xml" },
    body,
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
      jsonrpc: "2.0",
      method: "call",
      id: Date.now(),
      params: { service: "object", method: "execute_kw",
        args: [ODOO_DB, uid, ODOO_API_KEY, model, method, args, kwargs] },
    }),
  });
  const json = await r.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

async function getLeadPaymentStatus(uid, leadId) {
  const res = await odooCall(uid, "crm.lead", "read", [[parseInt(leadId, 10)]], {
    fields: ["x_studio_payment_status"],
  });
  return res?.[0]?.x_studio_payment_status;
}

async function markLeadPaid(uid, leadId, stripeSessionId) {
  await odooCall(uid, "crm.lead", "write", [[parseInt(leadId, 10)], {
    x_studio_payment_status: "Paid",
    x_studio_stripe_payment_intent: stripeSessionId,
  }]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sig = req.headers["stripe-signature"];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const leadId = session.metadata?.odoo_lead_id;

    if (leadId) {
      try {
        const uid = await xmlrpcAuth();
        const currentStatus = await getLeadPaymentStatus(uid, leadId);

        if (currentStatus === "Paid") {
          console.log("[Webhook] Duplicate event ignored");
          return res.status(200).json({ received: true });
        }

        await markLeadPaid(uid, leadId, session.id);
      } catch (err) {
        console.error("Webhook processing error", err.message);
      }
    }
  }

  return res.status(200).json({ received: true });
}
