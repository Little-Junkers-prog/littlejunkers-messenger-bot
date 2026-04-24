const { sendSms } = require("../lib/sms");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const { phone } = req.body || {};

    if (!phone) {
      return res.status(400).json({ success: false, error: "Customer phone is required." });
    }

    const body = "Little Junkers: We will use this number to send your dumpster quote, booking link, and service updates. Msg & data rates may apply. Reply STOP to opt out.";

    const message = await sendSms({ to: phone, body });

    return res.status(200).json({ success: true, messageSid: message.sid });
  } catch (error) {
    console.error("CSR opt-in SMS error:", error.message);
    return res.status(500).json({ success: false, error: error.message || "Failed to send opt-in SMS." });
  }
}
