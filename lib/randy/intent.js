// lib/randy/intent.js
// Lightweight deterministic intent and extraction helpers before model reasoning.

export const INTENTS = {
  SALES: "new_rental_sales",
  CUSTOMER_SERVICE: "existing_rental_support",
  CONTRACTOR: "contractor_business",
  PRICING: "pricing_question",
  AVAILABILITY: "availability_question",
  SERVICE_AREA: "service_area_question",
  PICKUP_EXTENSION: "pickup_extension_request",
  BILLING: "billing_question",
  AGREEMENT: "agreement_signing_help",
  HUMAN: "human_escalation",
  GENERAL: "general_question",
};

export function classifyIntent(text = "", allText = "") {
  const t = `${text}\n${allText}`.toLowerCase();

  if (/(human|person|representative|manager|supervisor|call me|talk to someone|speak to someone)/i.test(t)) {
    return INTENTS.HUMAN;
  }

  if (/(invoice|billing|bill|charge|charged|payment|receipt|refund|overage|overweight|over weight|tons?|dump fee|card)/i.test(t)) {
    return INTENTS.BILLING;
  }

  if (/(agreement|contract|terms|sign|signature|signed|waiver)/i.test(t)) {
    return INTENTS.AGREEMENT;
  }

  if (/(pickup|pick up|come get|return|due back|rental end|rental over|extend|extension|swap|exchange|reschedule|late delivery|missed delivery|condition|dirty|damaged|wrong dumpster|already have|my rental|my dumpster)/i.test(t)) {
    return INTENTS.CUSTOMER_SERVICE;
  }

  if (/(contractor|business|commercial|jobsite|repeat|recurring|monthly|subscription|multiple dumpsters|gc|general contractor|roofing|builder|renovation company)/i.test(t)) {
    return INTENTS.CONTRACTOR;
  }

  if (/(available|availability|soonest|earliest|today|tomorrow|this weekend|delivery date|openings|schedule)/i.test(t)) {
    return INTENTS.AVAILABILITY;
  }

  if (/(price|pricing|cost|how much|rate|fee|delivery fee|discount)/i.test(t)) {
    return INTENTS.PRICING;
  }

  if (/(service area|do you service|serve|zip|zipcode|zip code|where do you deliver|city)/i.test(t)) {
    return INTENTS.SERVICE_AREA;
  }

  if (/(rent|dumpster|cleanout|clean out|garage|basement|attic|move|declutter|renovation|remodel|construction|demo|demolition|yard waste|junk)/i.test(t)) {
    return INTENTS.SALES;
  }

  return INTENTS.GENERAL;
}

export function extractZip(text = "") {
  const match = String(text).match(/\b\d{5}\b/);
  return match ? match[0] : "";
}

export function extractPhone(text = "") {
  const match = String(text).match(/(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?([2-9]\d{2})[\s.-]?(\d{4})\b/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

export function extractEmail(text = "") {
  const match = String(text).match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match ? match[0] : "";
}

export function extractName(text = "") {
  const raw = String(text || "").trim();
  if (!raw) return "";

  const labeled = raw.match(/(?:my name is|name is|i am|i'm|this is)\s+([A-Za-z][A-Za-z' -]{1,50})/i);
  if (labeled) {
    return labeled[1]
      .replace(/\b(and|phone|number|email|is|at)\b.*$/i, "")
      .trim();
  }

  const withoutContact = raw
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, " ")
    .replace(/(?:\+?1[\s.-]?)?\(?[2-9]\d{2}\)?[\s.-]?[2-9]\d{2}[\s.-]?\d{4}\b/g, " ")
    .replace(/\b\d{5}\b/g, " ")
    .replace(/[^A-Za-z' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!withoutContact) return "";
  if (/(book|booking|link|text|send|dumpster|yard|zip|availability|price|cost|rental)/i.test(withoutContact)) return "";

  const words = withoutContact.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return "";
  if (words.some((w) => w.length < 2 || w.length > 24)) return "";

  return words.join(" ");
}

export function inferProjectType(text = "") {
  const t = String(text).toLowerCase();
  if (/(contractor|jobsite|commercial|roof|roofing|builder|gc)/i.test(t)) return "contractor";
  if (/(renovation|remodel|construction|drywall|flooring|cabinet|kitchen|bathroom|demo|demolition)/i.test(t)) return "renovation";
  if (/(garage|basement|attic|estate|house|home|move|declutter|cleanout|clean out|furniture|junk)/i.test(t)) return "home_cleanout";
  if (/(yard|brush|tree|limb|landscape)/i.test(t)) return "yard_cleanup";
  return "unknown";
}

export function recommendSizeYards(projectType = "unknown", text = "") {
  const t = String(text).toLowerCase();

  if (/(concrete|dirt|brick|block|heavy|shingle|roofing|large demo|whole house)/i.test(t)) return 21;
  if (projectType === "renovation" || /(remodel|construction|kitchen|bathroom|flooring|drywall)/i.test(t)) return 16;
  if (projectType === "contractor") return 16;
  if (projectType === "yard_cleanup" && /(large|big|many|whole yard|trees?)/i.test(t)) return 16;
  return 11;
}

export function getAllUserText(messages = []) {
  return messages
    .filter((m) => m?.role === "user")
    .map((m) => String(m.content || ""))
    .join("\n");
}
