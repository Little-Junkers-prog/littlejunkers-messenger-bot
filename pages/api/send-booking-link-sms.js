const { sendSms } = require("../../lib/sms");

const OPT_IN_BODY = "Little Junkers: We will use this number to send your dumpster quote, booking link, and service updates. Msg & data rates may apply. Reply STOP to opt out.";

function formatMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "";
  return `$${number.toFixed(0)}`;
}

function getRentalDisplayLabel(key) {
  const map = {
    "Base Rental": "2-Day Basic",
    "Early Bird": "2-Day Budget",
    "Weekend Warrior": "4-Day",
    "Full Reset": "7-Day",
  };

  return map[key] || key || "";
}

function getShortBookingLink(customerLink) {
  try {
    const url = new URL(customerLink);
    const holdId = url.searchParams.get("holdId");

    if (!holdId) return customerLink;

    return `${url.origin}/complete-booking?holdId=${encodeURIComponent(holdId)}`;
  } catch {
    return customerLink;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const {
      phone,
      customerLink,
      size,
      rentalOption,
      startLabel,
      endLabel,
      total,
      skipOptIn = false,
    } = req.body || {};

    if (!phone) {
      return res.status(400).json({ success: false, error: "Customer phone is required." });
    }

    if (!customerLink) {
      return res.status(400).json({ success: false, error: "Customer completion link is required." });
    }

    const rentalLabel = getRentalDisplayLabel(rentalOption);
    const totalText = formatMoney(total);
    const shortLink = getShortBookingLink(customerLink);
    const windowText = startLabel
      ? ` Delivery window: ${startLabel}${endLabel ? ` through ${endLabel}` : ""}.`
      : "";
    const totalLine = totalText ? ` Total: ${totalText}.` : "";

    const body =
      `Little Junkers: Here is your secure booking link for your ${size || "dumpster"}${rentalLabel ? ` ${rentalLabel}` : ""}.` +
      windowText +
      totalLine +
      ` Complete your booking here: ${shortLink}`;

    let optInMessage = null;
    if (!skipOptIn) {
      optInMessage = await sendSms({
        to: phone,
        body: OPT_IN_BODY,
      });
    }

    const message = await sendSms({
      to: phone,
      body,
    });

    return res.status(200).json({
      success: true,
      optInMessageSid: optInMessage?.sid || null,
      messageSid: message.sid,
      customerLink: shortLink,
    });
  } catch (error) {
    console.error("Booking link SMS error:", error.message);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to send booking link SMS.",
    });
  }
}
