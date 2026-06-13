// api/survey/booking-feedback.js
// Sprint 9: Post-booking survey submission endpoint.
//
// Called from /book.js confirmation screen when a customer selects
// an answer to one of the three survey questions. Each answer submits
// independently — one API call per question, fire-and-forget from the UI.
//
// Upserts a single booking_surveys row keyed on the best available
// identifier (rental_id > payment_intent_id > booking_hold_id).
//
// NPS response of 'not_sure' additionally writes a crm_escalation row
// to customer_communications so the CSR follow-up queue is notified.
//
// POST /api/survey/booking-feedback
// Body: { questionKey, answer, rentalId?, paymentIntentId?, bookingHoldId? }

import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

const ALLOWED_QUESTIONS = ["how_found", "project_type", "nps_response"];

const ALLOWED_ANSWERS = {
  how_found: [
    "Google Search",
    "Google Maps",
    "Facebook",
    "Friend or Neighbor",
    "Repeat Customer",
    "Yard Sign or Truck",
    "Other",
  ],
  project_type: [
    "Home Cleanout",
    "Renovation",
    "Moving",
    "Roofing",
    "Landscaping",
    "Construction",
    "Other",
  ],
  nps_response: ["absolutely", "probably", "not_sure"],
};

function asString(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    questionKey,
    answer,
    rentalId,
    paymentIntentId,
    bookingHoldId,
    customerId,
  } = req.body || {};

  // ── Validation ─────────────────────────────────────────────────────────────
  const key = asString(questionKey);
  const ans = asString(answer);

  if (!ALLOWED_QUESTIONS.includes(key)) {
    return res.status(400).json({ error: "Invalid questionKey." });
  }

  if (!ans) {
    return res.status(400).json({ error: "Answer is required." });
  }

  const allowed = ALLOWED_ANSWERS[key];
  if (allowed && !allowed.includes(ans)) {
    return res.status(400).json({ error: "Answer not in allowed list." });
  }

  // ── Upsert booking_surveys row ─────────────────────────────────────────────
  // Build the survey identifier — prefer rental_id, fall back to payment_intent,
  // then booking_hold_id. If none, store as an anonymous survey.
  const supabase = getServiceClient();

  try {
    // Find existing survey row to update if possible
    let existingId = null;

    if (asString(rentalId)) {
      const { data } = await supabase
        .from("booking_surveys")
        .select("id")
        .eq("rental_id", asString(rentalId))
        .maybeSingle();
      if (data) existingId = data.id;
    }

    if (!existingId && asString(paymentIntentId)) {
      const { data } = await supabase
        .from("booking_surveys")
        .select("id")
        .eq("payment_intent_id", asString(paymentIntentId))
        .maybeSingle();
      if (data) existingId = data.id;
    }

    if (!existingId && asString(bookingHoldId)) {
      const { data } = await supabase
        .from("booking_surveys")
        .select("id")
        .eq("booking_hold_id", asString(bookingHoldId))
        .maybeSingle();
      if (data) existingId = data.id;
    }

    const patch = { [key]: ans };

    if (existingId) {
      // Update existing row
      const { error } = await supabase
        .from("booking_surveys")
        .update(patch)
        .eq("id", existingId);
      if (error) throw error;
    } else {
      // Insert new row
      const insertRow = {
        ...patch,
        rental_id:         asString(rentalId)        || null,
        payment_intent_id: asString(paymentIntentId) || null,
        booking_hold_id:   asString(bookingHoldId)   || null,
      };
      const { error } = await supabase
        .from("booking_surveys")
        .insert(insertRow);
      if (error) throw error;
    }

    // ── NPS escalation ──────────────────────────────────────────────────────
    // If NPS = 'not_sure', create a CRM escalation task in customer_communications
    // so it surfaces in the CSR follow-up queue (Sprint 8 + Sprint 9 5th bucket).
    if (key === "nps_response" && ans === "not_sure") {
      const customerId_ = asString(customerId) || null;
      const rentalId_   = asString(rentalId)   || null;

      if (customerId_) {
        const escalationRow = {
          customer_id:        customerId_,
          rental_id:          rentalId_,
          channel:            "sms",
          communication_type: "crm_escalation",
          status:             "queued",
          body_preview:       "Post-booking survey: NPS not_sure — CSR follow-up needed",
          metadata: {
            reason:          "nps_not_sure",
            nps_response:    ans,
            source:          "booking_survey",
            payment_intent:  asString(paymentIntentId) || null,
            booking_hold_id: asString(bookingHoldId)   || null,
          },
        };
        // Fire-and-forget — don't let escalation failure affect survey response
        supabase
          .from("customer_communications")
          .insert(escalationRow)
          .then(({ error }) => {
            if (error) console.warn("[booking-feedback] escalation insert failed:", error.message);
          });
      }
    }

    return res.status(200).json({ success: true, questionKey: key });
  } catch (err) {
    console.error("[booking-feedback] error:", err.message);
    // Return 200 even on error — UI is fire-and-forget, survey failure
    // must never interrupt the post-booking experience.
    return res.status(200).json({ success: false, error: err.message });
  }
}
