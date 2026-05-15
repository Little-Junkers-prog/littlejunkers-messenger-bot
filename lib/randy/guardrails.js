// lib/randy/guardrails.js
// Trust, safety, spam, and abuse guardrails for Randy.

const PROFANITY_PATTERN = /\b(fuck|shit|bitch|asshole|motherfucker|cunt|dickhead|piece of shit)\b/i;
const EXTREME_UNSAFE_PATTERN = /\b(kill yourself|go die|i.?ll kill you|bomb|shoot up|burn your business|come hurt|find you)\b/i;
const PROMPT_INJECTION_PATTERN = /\b(ignore (all )?(previous|prior) instructions|system prompt|developer message|reveal your instructions|jailbreak|act as|bypass|show me all customers|dump database|service role key|api key)\b/i;
const SPAM_PATTERN = /\b(seo|backlinks|guest post|crypto|forex|web design|marketing services|rank on google|casino|loan offer|whatsapp|telegram)\b/i;
const URL_PATTERN = /https?:\/\//i;

function getUserMessages(messages = []) {
  return messages.filter((m) => m && m.role === "user").map((m) => String(m.content || ""));
}

export function analyzeConversationRisk(messages = [], lastMessage = "") {
  const userMessages = getUserMessages(messages);
  const text = [lastMessage, ...userMessages].join("\n");
  const firstUserMessage = userMessages[0] || lastMessage || "";
  const repeatedMessageCount = userMessages.filter((m) => m && m === lastMessage).length;

  let spamScore = 0;
  const reasons = [];

  if (URL_PATTERN.test(firstUserMessage)) {
    spamScore += 2;
    reasons.push("url_in_first_message");
  }

  if (SPAM_PATTERN.test(text)) {
    spamScore += 3;
    reasons.push("commercial_spam_keywords");
  }

  if (PROMPT_INJECTION_PATTERN.test(text)) {
    spamScore += 4;
    reasons.push("prompt_injection");
  }

  if (repeatedMessageCount >= 3) {
    spamScore += 3;
    reasons.push("repeated_messages");
  }

  if (/^[a-z]{15,}\d{3,}$/i.test(String(lastMessage).replace(/\s+/g, ""))) {
    spamScore += 2;
    reasons.push("nonsense_token_pattern");
  }

  const profanityCount = userMessages.filter((m) => PROFANITY_PATTERN.test(m)).length;
  const hasExtremeUnsafe = EXTREME_UNSAFE_PATTERN.test(text);
  const hasPromptInjection = PROMPT_INJECTION_PATTERN.test(text);

  return {
    spamScore,
    reasons,
    profanityCount,
    hasExtremeUnsafe,
    hasPromptInjection,
    isSuspicious: spamScore >= 5,
    shouldRestrictActions: spamScore >= 6 || hasPromptInjection,
    shouldEndChat: hasExtremeUnsafe || profanityCount >= 2 || spamScore >= 9,
  };
}

export function getGuardrailReply(risk) {
  if (risk.hasExtremeUnsafe) {
    return "I’m ending this chat now. If you need rental assistance, please call or text Little Junkers directly at 470-548-4733.";
  }

  if (risk.profanityCount >= 2) {
    return "I want to help, but I can’t continue if the chat stays abusive. Please call or text Little Junkers at 470-548-4733 for help with the order.";
  }

  if (risk.hasPromptInjection) {
    return "I can only help with Little Junkers dumpster rentals, booking, availability, and basic rental support.";
  }

  if (risk.spamScore >= 9) {
    return "I can help with dumpster rental questions here. For booking or account-specific help, please call or text Little Junkers at 470-548-4733.";
  }

  return null;
}

export function getRespectfulBoundaryReply() {
  return "I can help with the rental issue, but I need us to keep the conversation respectful. What happened with the delivery or dumpster?";
}
