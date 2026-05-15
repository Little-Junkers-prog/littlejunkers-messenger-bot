// api/randy-chat.js
// Randy — Little Junkers' Supabase-aware digital rental assistant.

import { analyzeConversationRisk, getGuardrailReply, getRespectfulBoundaryReply } from "../lib/randy/guardrails";
import {
  classifyIntent,
  extractEmail,
  extractPhone,
  extractZip,
  getAllUserText,
  inferProjectType,
  recommendSizeYards,
  INTENTS,
} from "../lib/randy/intent";
import { buildRandySystemPrompt } from "../lib/randy/systemPrompt";
import {
  buildPrefilledBookingUrl,
  createRandySession,
  findActiveRentalForCustomer,
  getAvailabilityContext,
  getSalesContext,
  sendBookingLinkByText,
} from "../lib/randy/businessTools";

const ALLOWED_ORIGINS = new Set([
  "https://www.littlejunkersllc.com",
  "https://littlejunkersllc.com",
  "https://book.littlejunkersllc.com",
  "http://localhost:3000",
]);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-site-token");
}

function validateSiteToken(req) {
  const expected = process.env.RANDY_SITE_TOKEN || process.env.CHAT_SITE_TOKEN;
  if (!expected) return true;
  const actual = req.headers["x-site-token"] || req.headers["X-Site-Token"] || req.body?.siteToken || "";
  return actual === expected;
}

function trimMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-24).map((m) => ({
    role: m?.role === "assistant" ? "assistant" : "user",
    content: String(m?.content || "").trim().slice(0, 2000),
  })).filter((m) => m.content || m.role === "assistant");
}

function getLastUserMessage(messages = []) {
  return [...messages].reverse().find((m) => m.role === "user")?.content || "";
}

function shouldCheckAvailability(intent, text) {
  return intent === INTENTS.AVAILABILITY || /(available|availability|soonest|earliest|delivery|book|schedule|today|tomorrow|this weekend)/i.test(text);
}

function shouldLookupRental(intent, text) {
  return intent === INTENTS.CUSTOMER_SERVICE || /(my rental|my dumpster|due back|scheduled return|pickup|pick up|extend|extension|late delivery|missed delivery)/i.test(text);
}

function wantsTextLink(text) {
  return /(text|sms|send.*link|send me.*link|phone.*link|booking link)/i.test(text);
}

function wantsBookingLink(text) {
  return /(book|booking|reserve|proceed|checkout|check out|rent it|start order|place order|direct link|send.*link|link)/i.test(text);
}

async function callOpenAI({ systemPrompt, messages }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.RANDY_OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("[randy] OpenAI error", data);
    throw new Error(data?.error?.message || "OpenAI request failed");
  }

  return data.choices?.[0]?.message?.content?.trim() || "I’m sorry, I didn’t catch that. Could you rephrase it?";
}

function fallbackGreeting() {
  return "Hi, I’m Randy — Little Junkers’ digital rental assistant. I can help you choose a dumpster, check service area and availability, or answer questions about an existing rental. What are you working on?";
}

function normalizePhoneForSms(phone) {
  if (!phone) return "";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return phone;
}

function buildDeterministicFallbackReply({ intent, zip, projectType, recommendedSizeYards, salesContext, availabilityContext, rentalContext }) {
  if (rentalContext?.rental) {
    return `I found your rental. The current status is ${rentalContext.rental.status || "on file"}, and the scheduled return date is ${rentalContext.rental.scheduled_return || "not listed yet"}. If you need an extension or help with pickup, call or text 470-548-4733.`;
  }

  if (intent === INTENTS.CUSTOMER_SERVICE) {
    return "I can help with existing rental questions. For privacy, please provide the phone number or email used for the rental, plus the delivery ZIP code or street number.";
  }

  const sizeText = `${recommendedSizeYards || 11}-yard`;
  const serviceText = salesContext?.serviceArea?.serviceable
    ? `We service ${salesContext.serviceArea.areaLabel || `ZIP ${zip}`}.`
    : zip
      ? `I need the team to confirm service for ZIP ${zip}.`
      : "What ZIP code is the job in?";

  const priceText = salesContext?.price
    ? `The ${salesContext.price.sizeLabel} ${salesContext.price.displayLabel} option is $${salesContext.price.totalPrice} including delivery for that area.`
    : "Once I have the ZIP code, I can check service area and pricing.";

  const availabilityText = availabilityContext?.soonest
    ? `The soonest window I see is ${availabilityContext.soonest.startLabel} to ${availabilityContext.soonest.endLabel}.`
    : "I can also check the next available delivery windows.";

  if (intent === INTENTS.PRICING || intent === INTENTS.AVAILABILITY || intent === INTENTS.SALES || intent === INTENTS.SERVICE_AREA) {
    return `${serviceText} Based on a ${projectType === "unknown" ? "cleanup" : projectType.replaceAll("_", " ")} project, I’d start with the ${sizeText}. ${priceText} ${availabilityText} Want me to text you a direct booking link so you don’t have to start over?`;
  }

  return "I can help with dumpster sizing, pricing, availability, booking links, or basic rental questions. What are you working on?";
}

function cleanReplyLinks(reply = "") {
  return String(reply)
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>.*?<\/a>/gi, "<$1>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "<$2>")
    .replace(/(https?:\/\/[^\s<>]+)/g, "<$1>")
    .replace(/<(<https?:\/\/[^>]+>)>/g, "$1");
}

async function createBookingContext({ phone, email, zip, projectType, recommendedSizeYards, intent, availabilityContext }) {
  const randySession = await createRandySession({
    phone,
    email,
    zip,
    projectType,
    sizeYards: recommendedSizeYards,
    summary: `Randy lead: ${projectType}, ${recommendedSizeYards} yard, ZIP ${zip || "unknown"}`,
    metadata: {
      intent,
      source: "randy_chat",
      availabilitySoonest: availabilityContext?.soonest || null,
    },
  });

  const url = buildPrefilledBookingUrl({
    sessionId: randySession?.id,
    zip,
    sizeYards: recommendedSizeYards,
    projectType,
  });

  return { randySession, url };
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ reply: "Method not allowed" });
  }

  if (!validateSiteToken(req)) {
    return res.status(401).json({ reply: "Unauthorized" });
  }

  try {
    const { messages: rawMessages = [], event = "", session = {} } = req.body || {};
    const messages = trimMessages(rawMessages);

    if (event === "chatOpened" || messages.length === 0) {
      return res.status(200).json({
        reply: fallbackGreeting(),
        options: ["Help me pick a dumpster", "Check availability", "Existing rental question"],
      });
    }

    const lastUserMessage = getLastUserMessage(messages);
    const allUserText = getAllUserText(messages);
    const risk = analyzeConversationRisk(messages, lastUserMessage);

    const guardrailReply = getGuardrailReply(risk);
    if (guardrailReply) {
      return res.status(200).json({ reply: guardrailReply, restricted: true });
    }

    if (risk.profanityCount === 1) {
      return res.status(200).json({ reply: getRespectfulBoundaryReply(), restricted: true });
    }

    const intent = classifyIntent(lastUserMessage, allUserText);
    const zip = session.zip || extractZip(allUserText);
    const phone = session.phone || extractPhone(allUserText);
    const email = session.email || extractEmail(allUserText);
    const projectType = session.projectType || inferProjectType(allUserText);
    const recommendedSizeYards = session.sizeYards || recommendSizeYards(projectType, allUserText);

    let salesContext = null;
    let availabilityContext = null;
    let rentalContext = null;

    try {
      salesContext = await getSalesContext({
        zip,
        sizeYards: recommendedSizeYards,
        tierKey: session.tierKey || "2day_standard",
      });
    } catch (err) {
      console.warn("[randy] sales context unavailable", err.message);
    }

    if (!risk.shouldRestrictActions && shouldCheckAvailability(intent, allUserText)) {
      try {
        availabilityContext = await getAvailabilityContext({ sizeYards: recommendedSizeYards });
      } catch (err) {
        console.warn("[randy] availability context unavailable", err.message);
      }
    }

    if (!risk.shouldRestrictActions && shouldLookupRental(intent, allUserText) && (phone || email)) {
      try {
        rentalContext = await findActiveRentalForCustomer({ phone, email, zip });
      } catch (err) {
        console.warn("[randy] rental lookup unavailable", err.message);
      }
    }

    if (!risk.shouldRestrictActions && wantsTextLink(lastUserMessage) && phone && intent !== INTENTS.CUSTOMER_SERVICE) {
      const { randySession, url } = await createBookingContext({
        phone,
        email,
        zip,
        projectType,
        recommendedSizeYards,
        intent,
        availabilityContext,
      });

      const smsResult = await sendBookingLinkByText({ to: normalizePhoneForSms(phone), url });

      if (smsResult.sent) {
        return res.status(200).json({
          reply: `Done — I texted you the direct booking link. It should keep the details you already shared so you don’t have to start over. You can also open it here: <${url}>`,
          bookingUrl: url,
          sessionId: randySession?.id || null,
        });
      }

      return res.status(200).json({
        reply: `I couldn’t send the text from here, but here’s the direct booking link: <${url}>`,
        bookingUrl: url,
        sessionId: randySession?.id || null,
      });
    }

    if (!risk.shouldRestrictActions && wantsBookingLink(lastUserMessage) && zip && intent !== INTENTS.CUSTOMER_SERVICE) {
      const { randySession, url } = await createBookingContext({
        phone,
        email,
        zip,
        projectType,
        recommendedSizeYards,
        intent,
        availabilityContext,
      });

      return res.status(200).json({
        reply: `Absolutely — here’s your direct booking link. I included the ZIP and recommended ${recommendedSizeYards}-yard dumpster so you don’t have to start over: <${url}>`,
        bookingUrl: url,
        sessionId: randySession?.id || null,
        intent,
      });
    }

    const systemPrompt = buildRandySystemPrompt({
      intent,
      risk,
      salesContext,
      availabilityContext,
      rentalContext,
    });

    let reply;
    let degraded = false;
    let degradedReason = null;

    try {
      reply = await callOpenAI({ systemPrompt, messages });
    } catch (err) {
      degraded = true;
      degradedReason = err.message;
      console.warn("[randy] AI response degraded", err.message);
      reply = buildDeterministicFallbackReply({
        intent,
        zip,
        projectType,
        recommendedSizeYards,
        salesContext,
        availabilityContext,
        rentalContext,
      });
    }

    reply = cleanReplyLinks(reply);

    return res.status(200).json({
      reply,
      intent,
      degraded,
      degradedReason: process.env.NODE_ENV !== "production" ? degradedReason : undefined,
      context: {
        zip: zip || null,
        projectType,
        recommendedSizeYards,
        serviceable: salesContext?.serviceArea?.serviceable ?? null,
        availabilitySoonest: availabilityContext?.soonest || null,
        rentalMatched: Boolean(rentalContext?.rental),
        restrictedActions: risk.shouldRestrictActions,
      },
    });
  } catch (err) {
    console.error("[randy] failed", err);
    return res.status(200).json({
      reply: "I’m having trouble with part of my connection right now, but I can still help route you. Please call or text Little Junkers at 470-548-4733, or use the booking page: <https://book.littlejunkersllc.com/rent-a-dumpster>",
      degraded: true,
      error: process.env.NODE_ENV !== "production" ? err.message : undefined,
    });
  }
}
