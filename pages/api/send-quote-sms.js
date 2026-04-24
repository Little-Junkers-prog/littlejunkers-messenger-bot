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
    "2-Day Rental": "2-Day Rental",
    "4-Day Rental": "4-Day Rental",
    "7-Day Rental": "7-Day Rental",
  };

  return map[key] || key || "rental";
}

function getShortLink(link) {
  if (!link) return "https://book.littlejunkersllc.com/rent-a-dumpster";

  try {
    const url = new URL(link);
    const holdId = url.searchParams.get("holdId");
    if (holdId) return `${url.origin}/complete-booking?holdId=${encodeURIComponent(holdId)}`;
    return url.toString();
  } catch {
    return String(link);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const {
      phone,
      name,
      quoteLink,
      size,
      rentalOption,
      total,
      areaLabel,
      zip,
      smsOptIn,
      skipOptIn = false,
    } = req.body || {};

    if (!phone) {
      return res.status(400).json({ success: false, error: "Phone number is required." });
    }

    if (smsOptIn === false) {
      return res.status(400).json({ success: false, error: "SMS opt-in is required before sending a quote by text." });
    }

    const shortLink = getShortLink(quoteLink);
    const totalText = formatMoney(total);
    const rentalLabel = getRentalDisplayLabel(rentalOption);
    const greeting = name ? `${String(name).trim()}, ` : "";
    const locationText = areaLabel || zip ? ` for ${areaLabel || `ZIP ${zip}`}` : "";
    const quoteText = size
      ? `your ${size} ${rentalLabel}${totalText ? ` quote of ${totalText}` : ""}${locationText}`
      : `your dumpster quote${totalText ? ` of ${totalText}` : ""}${locationText}`;

    const body = `Little Junkers: ${greeting}here is ${quoteText}. You can finish booking here: ${shortLink}`;

    let optInMessage = null;
    if (!skipOptIn) {
      optInMessage = await sendSms({ to: phone, body: OPT_IN_BODY });
    }

    const message = await sendSms({ to: phone, body });

    return res.status(200).json({
      success: true,
      optInMessageSid: optInMessage?.sid || null,
      messageSid: message.sid,
      quoteLink: shortLink,
    });
  } catch (error) {
    console.error("Quote SMS error:", error.message);
    return res.status(500).json({ success: false, error: error.message || "Failed to send quote SMS." });
  }
}
