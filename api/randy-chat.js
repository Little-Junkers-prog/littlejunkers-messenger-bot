// api/randy-chat.js
// Randy — Little Junkers' Supabase-aware digital rental assistant.

import { analyzeConversationRisk, getGuardrailReply, getRespectfulBoundaryReply } from "../lib/randy/guardrails";
import {
  classifyIntent,
  extractEmail,
  extractName,
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

const SMS_OPT_IN_TEXT = "By providing your mobile number, you agree to receive this booking link and rental-related texts from Little Junkers. Reply STOP to unsubscribe.";

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

function getPreviousAssistantMessage(messages = []) {
  return [...messages].reverse().find((m) => m.role === "assistant")?.content || "";
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

function messageLooksLikeContactOnly(text) {
  const raw = String(text || "").trim();
  const digits = raw.replace(/\D/g, "");
  const hasPhone = digits.length >= 10 && digits.length <= 11;
  const hasEmail = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(raw);
  const stripped = raw
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/[\d\s().+-]/g, "")
    .trim();
  return (hasPhone || hasEmail) && stripped.length === 0;
}

function assistantWasWaitingForBookingContact(text) {
  return /(phone number|mobile number|email|first name|name|send.*booking link|text.*booking link|booking link)/i.test(String(text || ""));
}

function shouldCollectLeadForBooking({ lastUserMessage, previousAssistantMessage, zip, intent }) {
  if (!zip || intent === INTENTS.CUSTOMER_SERVICE) return false;
  return (
    wantsTextLink(lastUserMessage) ||
    wantsBookingLink(lastUserMessage) ||
    (messageLooksLikeContactOnly(lastUserMessage) && assistantWasWaitingForBookingContact(previousAssistantMessage)) ||
    (/^[A-Za-z][A-Za-z' -]{1,50}$/.test(String(lastUserMessage || "").trim()) && assistantWasWaitingForBookingContact(previousAssistantMessage))
  );
}

async function callOpenAI({ systemPrompt, messages }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

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

function formatRentalDate(value) {
  if (!value) return "not listed yet";
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function existingRentalReply({ rentalContext }) {
  const rental = rentalContext?.rental;
  if (!rental) return "";
  const size = rental.size_yards ? `${rental.size_yards}-yard` : "dumpster";
  const status = rental.status || "on file";
  const endDate = formatRentalDate(rental.scheduled_return);

  return `I found your ${size} rental. Status: ${status}. Your scheduled rental end / pickup date is ${endDate}. If you need to extend, reschedule pickup, or report an issue, call or text 470-548-4733 so the team can confirm the change.`;
}

function buildDeterministicFallbackReply({ intent, zip, projectType, recommendedSizeYards, salesContext, availabilityContext, rentalContext }) {
  const rentalReply = existingRentalReply({ rentalContext });
  if (rentalReply) return rentalReply;

  if (intent === INTENTS.CUSTOMER_SERVICE) {
    return "I can help with existing rental questions. Please provide the phone number or email used for the rental and the delivery ZIP code. A rental/order ID is helpful if you have it, but it is not required.";
  }

  const sizeText = `${recommendedSizeYards || 11}-yard`;
  const serviceText = salesContext?.serviceArea?.serviceable
    ? `We service ${salesContext.serviceArea.areaLabel || `ZIP ${zip}`}.`
    : zip
      ? `I need the team to confirm service for ZIP ${zip}.`
      : "What ZIP code is the job in?";

  const activePrice = availabilityContext?.soonest?.price || salesContext?.price;
  const priceText = activePrice
    ? `The ${activePrice.sizeLabel} ${activePrice.displayLabel} option is $${activePrice.totalPrice} including delivery for that area.`
    : "Once I have the ZIP code, I can check service area and pricing.";

  const availabilityText = availabilityContext?.soonest
    ? `The soonest window I see is ${availabilityContext.soonest.startLabel} to ${availabilityContext.soonest.endLabel}.`
    : "I can also check the next available delivery windows.";

  if (intent === INTENTS.PRICING || intent === INTENTS.AVAILABILITY || intent === INTENTS.SALES || intent === INTENTS.SERVICE_AREA) {
    return `${serviceText} Based on a ${projectType === "unknown" ? "cleanup" : projectType.replaceAll("_", " ")} project, I’d start with the ${sizeText}. ${priceText} ${availabilityText} Want me to send a direct booking link so you don’t have to start over?`;
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

async function createBookingContext({ name, phone, email, zip, projectType, recommendedSizeYards, intent, availabilityContext, optIn }) {
  const randySession = await createRandySession({
    name,
    phone,
    email,
    zip,
    projectType,
    sizeYards: recommendedSizeYards,
    summary: `Randy lead: ${name || "unknown name"}, ${projectType}, ${recommendedSizeYards} yard, ZIP ${zip || "unknown"}`,
    metadata: {
      intent,
      source: "randy_chat",
      leadStatus: "open",
      availabilitySoonest: availabilityContext?.soonest || null,
      smsOptIn: Boolean(optIn?.smsOptIn),
      smsOptInText: optIn?.smsOptInText || null,
      smsOptInTimestamp: optIn?.smsOptInTimestamp || null,
      smsOptInSource: optIn?.smsOptInSource || null,
      marketingOptIn: false,
    },
  });

  const url = buildPrefilledBookingUrl({
    sessionId: randySession?.id,
    zip,
    sizeYards: recommendedSizeYards,
    projectType,
  });

  // Write to leads table — Randy has contact info at this point so this
  // is a qualified lead, not an anonymous intent record.
  // Non-blocking: a lead write failure must never break the booking link flow.
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_BOOKING_URL ||
      "https://book.littlejunkersllc.com";
    const apiBase = baseUrl.replace(/\/rent-a-dumpster\/?$/, "").replace(/\/randy-booking\/?$/, "");
    await fetch(`${apiBase}/api/submit-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        funnelSource: "randy_chat",
        leadSourceName: "Randy Chatbot",
        selectedSize: recommendedSizeYards ? `${recommendedSizeYards} Yard` : null,
        recommendedSize: recommendedSizeYards ? `${recommendedSizeYards} Yard` : null,
        zip: zip || null,
        customerType: projectType || null,
        smsOptIn: Boolean(optIn?.smsOptIn),
        smsOptInDate: optIn?.smsOptInTimestamp || null,
        contact: {
          name: name || null,
          phone: phone || null,
          email: email || null,
          source: "Randy Chatbot",
        },
      }),
    });
  } catch (leadErr) {
    // Non-blocking — log only, never surface to customer
    console.warn("[randy] submit-lead write failed (non-blocking):", leadErr.message);
  }

  return { randySession, url };
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ reply: "Method not allowed" });
  if (!validateSiteToken(req)) return res.status(401).json({ reply: "Unauthorized" });

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
    const previousAssistantMessage = getPreviousAssistantMessage(messages);
    const allUserText = getAllUserText(messages);
    const risk = analyzeConversationRisk(messages, lastUserMessage);

    const guardrailReply = getGuardrailReply(risk);
    if (guardrailReply) return res.status(200).json({ reply: guardrailReply, restricted: true });
    if (risk.profanityCount === 1) return res.status(200).json({ reply: getRespectfulBoundaryReply(), restricted: true });

    const intent = classifyIntent(lastUserMessage, allUserText);
    const zip = session.zip || extractZip(allUserText);
    const phone = session.phone || extractPhone(allUserText);
    const email = session.email || extractEmail(allUserText);
    const name = session.name || extractName(allUserText);
    const projectType = session.projectType || inferProjectType(allUserText);
    const recommendedSizeYards = session.sizeYards || recommendSizeYards(projectType, allUserText);

    let salesContext = null;
    let availabilityContext = null;
    let rentalContext = null;

    try {
      salesContext = await getSalesContext({ zip, sizeYards: recommendedSizeYards, tierKey: session.tierKey || "2day_standard" });
    } catch (err) {
      console.warn("[randy] sales context unavailable", err.message);
    }

    if (!risk.shouldRestrictActions && shouldCheckAvailability(intent, allUserText)) {
      try {
        availabilityContext = await getAvailabilityContext({ sizeYards: recommendedSizeYards, zip });
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

    if (!risk.shouldRestrictActions && intent === INTENTS.CUSTOMER_SERVICE) {
      if (!(phone || email)) {
        return res.status(200).json({
          reply: "I can check basic rental details. Please provide the phone number or email used for the rental, plus the delivery ZIP code. You do not need a rental/order ID.",
          needsRentalLookupInfo: true,
        });
      }

      if (!zip) {
        return res.status(200).json({
          reply: "Thanks. What ZIP code was the dumpster delivered to? That is enough for me to try the rental lookup — you do not need a rental/order ID.",
          needsRentalLookupInfo: true,
        });
      }

      if (rentalContext?.rental) {
        return res.status(200).json({
          reply: existingRentalReply({ rentalContext }),
          rentalMatched: true,
          intent,
          context: {
            zip,
            phone: phone || null,
            email: email || null,
          },
        });
      }

      return res.status(200).json({
        reply: "I could not find an active rental with that phone/email and ZIP. Please check the phone number or ZIP, or call/text 470-548-4733 and the team can look it up manually. You do not need a rental/order ID unless you happen to have one.",
        rentalMatched: false,
        intent,
      });
    }

    const shouldCollectLead = !risk.shouldRestrictActions && shouldCollectLeadForBooking({ lastUserMessage, previousAssistantMessage, zip, intent });

    if (shouldCollectLead) {
      if (!name && !(phone || email)) {
        return res.status(200).json({
          reply: `I can send a direct booking link and save this as a quote. What is your first name and mobile number?\n\n${SMS_OPT_IN_TEXT}`,
          needsLeadInfo: true,
          needsName: true,
          needsContact: true,
        });
      }

      if (!name) {
        return res.status(200).json({
          reply: "Got it. What first name should I attach to this quote?",
          needsLeadInfo: true,
          needsName: true,
          needsContact: false,
        });
      }

      if (!(phone || email)) {
        return res.status(200).json({
          reply: `Thanks, ${name}. What mobile number should I send the direct booking link to?\n\n${SMS_OPT_IN_TEXT}`,
          needsLeadInfo: true,
          needsName: false,
          needsContact: true,
        });
      }

      const optIn = phone ? {
        smsOptIn: true,
        smsOptInText: SMS_OPT_IN_TEXT,
        smsOptInTimestamp: new Date().toISOString(),
        smsOptInSource: "randy_chat_booking_link_request",
      } : {
        smsOptIn: false,
        smsOptInText: null,
        smsOptInTimestamp: null,
        smsOptInSource: null,
      };

      const { randySession, url } = await createBookingContext({
        name,
        phone,
        email,
        zip,
        projectType,
        recommendedSizeYards,
        intent,
        availabilityContext,
        optIn,
      });

      if (phone) {
        const smsResult = await sendBookingLinkByText({ to: normalizePhoneForSms(phone), url });

        if (smsResult.sent) {
          return res.status(200).json({
            reply: `Done — I texted the direct booking link to you, ${name}. You can also open it here: ${url}`,
            bookingUrl: url,
            sessionId: randySession?.id || null,
            smsSent: true,
          });
        }

        return res.status(200).json({
          reply: `I saved the quote, but I couldn't send the text from here. Here is the direct booking link: ${url}`,
          bookingUrl: url,
          sessionId: randySession?.id || null,
          smsSent: false,
          smsError: process.env.NODE_ENV !== "production" ? smsResult.error : undefined,
        });
      }

      return res.status(200).json({
        reply: `Thanks, ${name}. I saved this as a Randy lead. Here is your direct booking link: ${url}`,
        bookingUrl: url,
        sessionId: randySession?.id || null,
        smsSent: false,
      });
    }

    const systemPrompt = buildRandySystemPrompt({ intent, risk, salesContext, availabilityContext, rentalContext });

    let reply;
    let degraded = false;
    let degradedReason = null;

    try {
      reply = await callOpenAI({ systemPrompt, messages });
    } catch (err) {
      degraded = true;
      degradedReason = err.message;
      console.warn("[randy] AI response degraded", err.message);
      reply = buildDeterministicFallbackReply({ intent, zip, projectType, recommendedSizeYards, salesContext, availabilityContext, rentalContext });
    }

    reply = cleanReplyLinks(reply);

    return res.status(200).json({
      reply,
      intent,
      degraded,
      degradedReason: process.env.NODE_ENV !== "production" ? degradedReason : undefined,
      context: {
        zip: zip || null,
        name: name || null,
        phone: phone || null,
        email: email || null,
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
      reply: "I'm having trouble with part of my connection right now, but I can still help route you. Please call or text Little Junkers at 470-548-4733, or use the booking page: https://book.littlejunkersllc.com/rent-a-dumpster",
      degraded: true,
      error: process.env.NODE_ENV !== "production" ? err.message : undefined,
    });
  }
}
