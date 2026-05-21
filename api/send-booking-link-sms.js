// api/send-booking-link-sms.js
// Sends the customer completion link via SMS after CSR creates a booking hold.
// Called by the CSR Quick Book page after handleGenerateLink() succeeds.

const { sendSms } = require("../lib/sms");

function asString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function normalizePhone(value) {
  const raw = asString(value).replace(/\D/g, "");
  if (!raw) return null;
  return raw.length === 10 ? `+1${raw}` : raw.startsWith("1") ? `+${raw}` : raw;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const { phone, customerLink, size, rentalOption, startLabel, endLabel, total } = req.body || {};

    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return res.status(400).json({ success: false, error: "A valid customer phone number is required." });
    }

    if (!customerLink) {
      return res.status(400).json({ success: false, error: "Customer completion link is required." });
    }

    // Build a concise, urgency-driven message. Residential customers respond
    // better to plain language than formal business copy.
    const sizeLabel = asString(size).replace("YD", "-Yard") || "dumpster";
    const optionLabel = asString(rentalOption);
    const dateRange = startLabel && endLabel ? `${startLabel} – ${endLabel}` : asString(startLabel);
    const totalLabel = total ? `$${total}` : "";

    const bookingLine = [sizeLabel, optionLabel, dateRange, totalLabel]
      .filter(Boolean)
      .join(" · ");

    const body = [
      `Little Junkers has a bin reserved for you! 🎉`,
      bookingLine ? `📦 ${bookingLine}` : null,
      `Complete your booking here:`,
      customerLink,
      `⏰ This link expires in 2 hours — tap it now to lock in your date.`,
      `Questions? Call/text us at (470) 548-4733.`,
      `Reply STOP to opt out.`,
    ]
      .filter(Boolean)
      .join("\n");

    const message = await sendSms({ to: normalizedPhone, body });

    return res.status(200).json({
      success: true,
      messageSid: message.sid,
    });
  } catch (error) {
    console.error("[send-booking-link-sms] error:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send booking link SMS.",
    });
  }
}
