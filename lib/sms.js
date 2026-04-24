const twilio = require("twilio");

function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (raw.startsWith("+") && digits.length >= 10) return raw;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;

  return "";
}

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("Missing Twilio account credentials.");
  }

  return twilio(accountSid, authToken);
}

async function sendSms({ to, body }) {
  const normalizedTo = normalizePhone(to);

  if (!normalizedTo) {
    throw new Error("Invalid customer phone number.");
  }

  if (!body || !String(body).trim()) {
    throw new Error("SMS body is required.");
  }

  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!messagingServiceSid && !from) {
    throw new Error("Missing Twilio sender configuration.");
  }

  const payload = {
    to: normalizedTo,
    body: String(body).trim(),
  };

  if (messagingServiceSid) {
    payload.messagingServiceSid = messagingServiceSid;
  } else {
    payload.from = from;
  }

  const client = getTwilioClient();
  return client.messages.create(payload);
}

module.exports = {
  normalizePhone,
  sendSms,
};
