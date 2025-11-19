// api/webhook.js

export default function handler(req, res) {
  // ----------------------------------------------------
  // 1. Facebook VERIFY webhook (GET request)
  // ----------------------------------------------------
  if (req.method === "GET") {
    const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN;
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("WEBHOOK VERIFIED");
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send("Verification failed");
    }
  }

  // ----------------------------------------------------
  // 2. Handle incoming webhook events (POST)
  // ----------------------------------------------------
  if (req.method === "POST") {
    console.log("🔔 Incoming Webhook Event:", JSON.stringify(req.body, null, 2));
    return res.status(200).send("EVENT_RECEIVED");
  }

  // ----------------------------------------------------
  // Fallback
  // ----------------------------------------------------
  res.status(404).send("Not Found");
}
