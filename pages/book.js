// pages/book.js
// Handles post-payment confirmation for both Stripe payment paths:
//   1. Hosted Checkout:          /book?status=success&session_id=cs_xxx
//   2. Embedded Payment Element: /book?payment_intent=pi_xxx&redirect_status=succeeded
//
// Sprint 9: added post-booking survey (how_found, project_type, nps_response)
// Survey answers submit async per-question — never blocks the confirmation screen.

import { useEffect, useRef, useState } from "react";

const C = {
  pageBg:     "#edeae4",
  cardBg:     "#ffffff",
  cardBorder: "#e5e0d8",
  heroBg:     "#1e1c19",
  heroAccent: "#ffcee4",
  ink:        "#1a1a1a",
  inkMid:     "#555555",
  inkMuted:   "#999999",
  inkFaint:   "#b8b0a6",
  pink:       "#ffcee4",
  pinkText:   "#c2587a",
  pinkBg:     "#fff5fb",
  pinkBorder: "#ffd6eb",
  surfaceBg:  "#faf8f5",
  surfaceBorder: "#e8e3db",
  white:      "#ffffff",
  green:      "#1a7a4a",
  greenBg:    "#f0faf4",
  greenBorder:"#a3d9b8",
};

const F = "system-ui, -apple-system, sans-serif";
const HOMEPAGE = "https://www.littlejunkersllc.com";
const GTM_BOOKING_CONVERSION_EVENT = "lj_booking_completed";

function fireBookingConversion(sessionId, data = {}) {
  if (typeof window === "undefined") return;
  if (!sessionId) return;

  const storageKey = `lj_booking_conversion_fired_${sessionId}`;

  try {
    if (window.sessionStorage?.getItem(storageKey) === "1") return;
  } catch (_) {}

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: GTM_BOOKING_CONVERSION_EVENT,
    funnel_name: "rent_a_dumpster",
    booking_source: "book_subdomain",
    checkout_session_id: sessionId,
    booking_type: data.dumpsterSize || undefined,
    rental_duration: data.rentalOption || undefined,
    delivery_date: data.deliveryDate || undefined,
    delivery_zip: data.zip || undefined,
    delivery_zone: data.zone || undefined,
    value: Number.isFinite(Number(data.value)) ? Number(data.value) : undefined,
    currency: data.currency || "USD",
  });

  try {
    window.sessionStorage?.setItem(storageKey, "1");
  } catch (_) {}
}

// ─── Survey component ─────────────────────────────────────────────────────────

function BookingSurvey({ rentalId, paymentIntentId, bookingHoldId, customerId, projectAlreadyCaptured }) {
  const [answers, setAnswers]     = useState({});
  const [done, setDone]           = useState(false);
  const [submitting, setSubmitting] = useState({});

  async function submitAnswer(questionKey, answer) {
    if (answers[questionKey]) return; // already answered
    setSubmitting(s => ({ ...s, [questionKey]: true }));

    const updatedAnswers = { ...answers, [questionKey]: answer };
    setAnswers(updatedAnswers);

    // Fire-and-forget
    try {
      await fetch("/api/survey/booking-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionKey,
          answer,
          rentalId:        rentalId        || undefined,
          paymentIntentId: paymentIntentId || undefined,
          bookingHoldId:   bookingHoldId   || undefined,
          customerId:      customerId      || undefined,
        }),
      });
    } catch (_) {
      // Survey failure never surfaces to customer
    }

    setSubmitting(s => ({ ...s, [questionKey]: false }));

    // Check if all questions answered
    const questionsToShow = projectAlreadyCaptured
      ? ["how_found", "nps_response"]
      : ["how_found", "project_type", "nps_response"];
    if (questionsToShow.every(k => updatedAnswers[k])) {
      setTimeout(() => setDone(true), 400);
    }
  }

  const pillStyle = (selected) => ({
    display: "inline-block",
    padding: "8px 14px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    border: selected ? "2px solid #c2587a" : "1.5px solid #e5e0d8",
    background: selected ? "#fff5fb" : "#ffffff",
    color: selected ? "#c2587a" : "#555555",
    transition: "all 0.12s",
    margin: "4px",
  });

  if (done) {
    return (
      <div style={{ background: C.pinkBg, border: `1px solid ${C.pinkBorder}`, borderRadius: 14, padding: "20px 22px", marginBottom: 16, textAlign: "center" }}>
        <div style={{ fontSize: 24, marginBottom: 6 }}>🙏</div>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.pinkText, margin: 0 }}>Thanks for sharing!</p>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: "4px 0 0" }}>Your feedback helps us serve the neighborhood better.</p>
      </div>
    );
  }

  return (
    <div style={{ background: C.pinkBg, border: `1px solid ${C.pinkBorder}`, borderRadius: 14, padding: "20px 22px", marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.pinkText, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 14 }}>
        Quick Questions — 30 Seconds
      </div>

      {/* Q1: How did you find us */}
      <div style={{ marginBottom: answers.how_found ? 16 : 0 }}>
        <p style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 10 }}>
          How did you find us?
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
          {["Google Search", "Google Maps", "Facebook", "Friend or Neighbor", "Repeat Customer", "Yard Sign or Truck", "Other"].map(opt => (
            <span
              key={opt}
              style={pillStyle(answers.how_found === opt)}
              onClick={() => !answers.how_found && submitAnswer("how_found", opt)}
            >
              {opt}
            </span>
          ))}
        </div>
      </div>

      {/* Q2: Project type — only if not already captured in Step 1 */}
      {!projectAlreadyCaptured && answers.how_found && (
        <div style={{ marginTop: 16, marginBottom: answers.project_type ? 16 : 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 10 }}>
            What's your project?
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {["Home Cleanout", "Renovation", "Moving", "Roofing", "Landscaping", "Construction", "Other"].map(opt => (
              <span
                key={opt}
                style={pillStyle(answers.project_type === opt)}
                onClick={() => !answers.project_type && submitAnswer("project_type", opt)}
              >
                {opt}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Q3: NPS — shown after Q1 (and Q2 if shown) */}
      {answers.how_found && (projectAlreadyCaptured || answers.project_type) && (
        <div style={{ marginTop: 16 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 10 }}>
            Would you recommend us to a friend?
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {[
              { value: "absolutely", label: "Absolutely 🌟" },
              { value: "probably",   label: "Probably 👍" },
              { value: "not_sure",   label: "Not sure" },
            ].map(({ value, label }) => (
              <span
                key={value}
                style={pillStyle(answers.nps_response === value)}
                onClick={() => !answers.nps_response && submitAnswer("nps_response", value)}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookPage() {
  const [status, setStatus]           = useState(null);
  const [sessionId, setSessionId]     = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  const [bookingData, setBookingData] = useState({});
  const [loading, setLoading]         = useState(true);
  const conversionFiredRef            = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    const s            = params.get("status");
    const sid          = params.get("session_id");
    const pi           = params.get("payment_intent");
    const redirectStatus = params.get("redirect_status");

    // Determine status from either Checkout Session or Payment Element params
    const resolvedStatus = s
      || (redirectStatus === "succeeded" ? "success" : null)
      || (pi ? "success" : null)
      || "success";

    setStatus(resolvedStatus);
    setSessionId(sid || null);
    setPaymentIntentId(pi || null);

    if (resolvedStatus === "success" && (sid || pi)) {
      // Use unified confirmation endpoint for both paths
      const confirmUrl = sid
        ? `/api/booking-confirmation?session_id=${sid}`
        : `/api/booking-confirmation?payment_intent=${pi}`;

      fetch(confirmUrl)
        .then(r => r.json())
        .then(data => {
          setBookingData(data || {});

          if (!conversionFiredRef.current && data?.paymentStatus === "paid") {
            conversionFiredRef.current = true;
            fireBookingConversion(sid || pi, data);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.pageBg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F }}>
        <div style={{ fontSize: 14, color: C.inkMuted, fontWeight: 600 }}>Loading...</div>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div style={{ minHeight: "100vh", background: C.pageBg, padding: "20px 16px 60px", fontFamily: F }}>
        <div style={{ maxWidth: 480, margin: "0 auto" }}>
          <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0 20px", borderBottom: `1px solid ${C.cardBorder}`, marginBottom: 24 }}>
            <img src="/little-junkers-logo.png" alt="Little Junkers" style={{ maxWidth: 130, height: "auto" }} />
            <a href="tel:4705484733" style={{ fontSize: 15, fontWeight: 900, color: C.ink, textDecoration: "none" }}>470-548-4733</a>
          </header>
          <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: "32px 28px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>↩</div>
            <h1 style={{ margin: "0 0 10px", fontSize: 24, fontWeight: 900, color: C.ink, letterSpacing: "-0.5px", lineHeight: 1.2 }}>
              No worries — nothing was charged.
            </h1>
            <p style={{ margin: "0 0 28px", fontSize: 14, color: C.inkMid, lineHeight: 1.6 }}>
              Your reservation wasn't completed, but your quote is still saved. Head back and pick up where you left off — it only takes a minute.
            </p>
            <a
              href="/rent-a-dumpster"
              style={{ display: "block", width: "100%", padding: "15px", background: C.ink, color: C.white, border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: "pointer", textDecoration: "none", textAlign: "center", boxSizing: "border-box" }}
            >
              Return to Booking →
            </a>
            <p style={{ margin: "18px 0 0", fontSize: 13, color: C.inkMuted }}>
              Questions? <a href="tel:4705484733" style={{ color: C.ink, fontWeight: 700 }}>Call or text 470-548-4733</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  const { customerName = "", dumpsterSize = "", rentalOption = "", deliveryDate = "",
    rentalId = null, supabaseLeadId = null } = bookingData;
  const firstName = customerName ? customerName.split(" ")[0] : null;

  // project_type may have been captured in Step 1 of the funnel and stored
  // in the booking hold / rental metadata. If present, skip Q2 in the survey.
  const projectAlreadyCaptured = Boolean(bookingData?.project_type);

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, padding: "20px 16px 60px", fontFamily: F }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>

        {/* Header */}
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0 20px", borderBottom: `1px solid ${C.cardBorder}`, marginBottom: 24 }}>
          <img src="/little-junkers-logo.png" alt="Little Junkers" style={{ maxWidth: 130, height: "auto" }} />
          <a href="tel:4705484733" style={{ fontSize: 15, fontWeight: 900, color: C.ink, textDecoration: "none" }}>470-548-4733</a>
        </header>

        {/* Hero confirmation card */}
        <div style={{ background: C.heroBg, borderRadius: 16, padding: "32px 28px 28px", marginBottom: 16, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12, lineHeight: 1 }}>🎉</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.heroAccent, letterSpacing: "1.4px", textTransform: "uppercase", marginBottom: 8 }}>
            Booking Confirmed
          </div>
          <h1 style={{ margin: "0 0 10px", fontSize: 26, fontWeight: 900, color: C.white, letterSpacing: "-0.6px", lineHeight: 1.15 }}>
            {firstName ? `You're all set, ${firstName}!` : "You're all set!"}
          </h1>
          <p style={{ margin: 0, fontSize: 14, color: "rgba(255,255,255,0.72)", lineHeight: 1.6 }}>
            Payment confirmed. We'll reach out to finalize your delivery window.
          </p>
        </div>

        {/* Booking summary */}
        {(dumpsterSize || rentalOption) && (
          <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: "20px 22px", marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12 }}>
              Your Rental
            </div>
            {dumpsterSize && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: C.inkMid }}>Dumpster</span>
                <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{dumpsterSize}</span>
              </div>
            )}
            {rentalOption && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: C.inkMid }}>Rental type</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{rentalOption}</span>
              </div>
            )}
            {deliveryDate && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 13, color: C.inkMid }}>Delivery date</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>{deliveryDate}</span>
              </div>
            )}
          </div>
        )}

        {/* What happens next */}
        <div style={{ background: C.greenBg, border: `1px solid ${C.greenBorder}`, borderRadius: 14, padding: "20px 22px", marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.green, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 14 }}>
            What Happens Next
          </div>
          <div style={{ display: "grid", gap: 14 }}>
            {[
              { step: "1", label: "Confirmation text", detail: "We'll text you to confirm your delivery window — usually within a few hours." },
              { step: "2", label: "Day-before reminder", detail: "You'll get a reminder text the day before your dumpster arrives." },
              { step: "3", label: "Delivery day", detail: "Your driver will text when we are en route for delivery. Please make sure the drop spot is clear." },
            ].map(({ step, label, detail }) => (
              <div key={step} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.green, color: C.white, fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {step}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.ink, marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 13, color: C.inkMid, lineHeight: 1.5 }}>{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sprint 9: Post-booking survey */}
        <BookingSurvey
          rentalId={rentalId}
          paymentIntentId={paymentIntentId}
          bookingHoldId={null}
          customerId={null}
          projectAlreadyCaptured={projectAlreadyCaptured}
        />

        {/* Important reminders */}
        <div style={{ background: C.surfaceBg, border: `1px solid ${C.surfaceBorder}`, borderRadius: 14, padding: "18px 22px", marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.inkFaint, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12 }}>
            A Few Things to Know
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {[
              "Keep the drop spot clear of vehicles, fencing, or low-hanging lines.",
              "Don't overfill past the top rail — we can't haul overloaded containers.",
              "Prohibited: tires, hazmat, paint, batteries, liquids. Call us if you're unsure.",
              "Need more time? Call or text us and we'll extend — additional days billed separately.",
            ].map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <span style={{ color: C.pinkText, fontWeight: 800, fontSize: 14, flexShrink: 0 }}>•</span>
                <span style={{ fontSize: 13, color: C.inkMid, lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ display: "grid", gap: 10 }}>
          <a
            href={HOMEPAGE}
            style={{ display: "block", padding: "14px", background: C.ink, color: C.white, borderRadius: 12, fontSize: 14, fontWeight: 800, textDecoration: "none", textAlign: "center" }}
          >
            Back to Little Junkers ↗
          </a>
          <a
            href="tel:4705484733"
            style={{ display: "block", padding: "14px", background: C.white, color: C.ink, border: `1.5px solid ${C.cardBorder}`, borderRadius: 12, fontSize: 14, fontWeight: 800, textDecoration: "none", textAlign: "center" }}
          >
            Questions? Call or text 470-548-4733
          </a>
        </div>

      </div>
    </div>
  );
}


import { useEffect, useRef, useState } from "react";

const C = {
  pageBg:     "#edeae4",
  cardBg:     "#ffffff",
  cardBorder: "#e5e0d8",
  heroBg:     "#1e1c19",
  heroAccent: "#ffcee4",
  ink:        "#1a1a1a",
  inkMid:     "#555555",
  inkMuted:   "#999999",
  inkFaint:   "#b8b0a6",
  pink:       "#ffcee4",
  pinkText:   "#c2587a",
  pinkBg:     "#fff5fb",
  pinkBorder: "#ffd6eb",
  surfaceBg:  "#faf8f5",
  surfaceBorder: "#e8e3db",
  white:      "#ffffff",
  green:      "#1a7a4a",
  greenBg:    "#f0faf4",
  greenBorder:"#a3d9b8",
};

const F = "system-ui, -apple-system, sans-serif";
const HOMEPAGE = "https://www.littlejunkersllc.com";
const GTM_BOOKING_CONVERSION_EVENT = "lj_booking_completed";

function fireBookingConversion(sessionId, data = {}) {
  if (typeof window === "undefined") return;
  if (!sessionId) return;

  const storageKey = `lj_booking_conversion_fired_${sessionId}`;

  try {
    if (window.sessionStorage?.getItem(storageKey) === "1") return;
  } catch (_) {
    // sessionStorage can be blocked in some browsers. Continue with in-memory guard.
  }

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({
    event: GTM_BOOKING_CONVERSION_EVENT,
    funnel_name: "rent_a_dumpster",
    booking_source: "book_subdomain",
    checkout_session_id: sessionId,
    booking_type: data.dumpster_size || undefined,
    rental_duration: data.rental_option || undefined,
    delivery_date: data.delivery_date || undefined,
    delivery_zip: data.zip || undefined,
    delivery_zone: data.zone || undefined,
    value: Number.isFinite(Number(data.value)) ? Number(data.value) : undefined,
    currency: data.currency || "USD",
  });

  try {
    window.sessionStorage?.setItem(storageKey, "1");
  } catch (_) {
    // Ignore storage write failures. The dataLayer event has already fired.
  }
}

export default function BookPage() {
  const [status, setStatus]       = useState(null); // "success" | "cancelled" | null
  const [sessionId, setSessionId] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [dumpsterSize, setDumpsterSize] = useState("");
  const [rentalOption, setRentalOption] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [loading, setLoading]     = useState(true);
  const conversionFiredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s   = params.get("status");
    const sid = params.get("session_id");
    setStatus(s || "success");
    setSessionId(sid || null);

    if (s === "success" && sid) {
      // Fetch session metadata to personalize the confirmation and fire analytics.
      fetch(`/api/checkout-session?session_id=${sid}`)
        .then(r => r.json())
        .then(data => {
          if (data?.customer_name) setCustomerName(data.customer_name);
          if (data?.dumpster_size) setDumpsterSize(data.dumpster_size);
          if (data?.rental_option) setRentalOption(data.rental_option);
          if (data?.delivery_date) setDeliveryDate(data.delivery_date);

          if (!conversionFiredRef.current && data?.payment_status === "paid") {
            conversionFiredRef.current = true;
            fireBookingConversion(sid, data);
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight:"100vh", background:C.pageBg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:F }}>
        <div style={{ fontSize:14, color:C.inkMuted, fontWeight:600 }}>Loading...</div>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div style={{ minHeight:"100vh", background:C.pageBg, padding:"20px 16px 60px", fontFamily:F }}>
        <div style={{ maxWidth:480, margin:"0 auto" }}>

          {/* Header */}
          <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0 20px", borderBottom:`1px solid ${C.cardBorder}`, marginBottom:24 }}>
            <img src="/little-junkers-logo.png" alt="Little Junkers" style={{ maxWidth:130, height:"auto" }} />
            <a href="tel:4705484733" style={{ fontSize:15, fontWeight:900, color:C.ink, textDecoration:"none" }}>470-548-4733</a>
          </header>

          <div style={{ background:C.cardBg, border:`1px solid ${C.cardBorder}`, borderRadius:16, padding:"32px 28px", textAlign:"center", boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize:40, marginBottom:16 }}>↩</div>
            <h1 style={{ margin:"0 0 10px", fontSize:24, fontWeight:900, color:C.ink, letterSpacing:"-0.5px", lineHeight:1.2 }}>
              No worries — nothing was charged.
            </h1>
            <p style={{ margin:"0 0 28px", fontSize:14, color:C.inkMid, lineHeight:1.6 }}>
              Your reservation wasn't completed, but your quote is still saved. Head back and pick up where you left off — it only takes a minute.
            </p>
            <a
              href="/rent-a-dumpster"
              style={{ display:"block", width:"100%", padding:"15px", background:C.ink, color:C.white, border:"none", borderRadius:12, fontSize:15, fontWeight:800, cursor:"pointer", textDecoration:"none", textAlign:"center", boxSizing:"border-box" }}
            >
              Return to Booking →
            </a>
            <p style={{ margin:"18px 0 0", fontSize:13, color:C.inkMuted }}>
              Questions? <a href="tel:4705484733" style={{ color:C.ink, fontWeight:700 }}>Call or text 470-548-4733</a>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Default: success screen
  const firstName = customerName ? customerName.split(" ")[0] : null;

  return (
    <div style={{ minHeight:"100vh", background:C.pageBg, padding:"20px 16px 60px", fontFamily:F }}>
      <div style={{ maxWidth:480, margin:"0 auto" }}>

        {/* Header */}
        <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0 20px", borderBottom:`1px solid ${C.cardBorder}`, marginBottom:24 }}>
          <img src="/little-junkers-logo.png" alt="Little Junkers" style={{ maxWidth:130, height:"auto" }} />
          <a href="tel:4705484733" style={{ fontSize:15, fontWeight:900, color:C.ink, textDecoration:"none" }}>470-548-4733</a>
        </header>

        {/* Hero confirmation card */}
        <div style={{ background:C.heroBg, borderRadius:16, padding:"32px 28px 28px", marginBottom:16, textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:12, lineHeight:1 }}>🎉</div>
          <div style={{ fontSize:10, fontWeight:700, color:C.heroAccent, letterSpacing:"1.4px", textTransform:"uppercase", marginBottom:8 }}>
            Booking Confirmed
          </div>
          <h1 style={{ margin:"0 0 10px", fontSize:26, fontWeight:900, color:C.white, letterSpacing:"-0.6px", lineHeight:1.15 }}>
            {firstName ? `You're all set, ${firstName}!` : "You're all set!"}
          </h1>
          <p style={{ margin:0, fontSize:14, color:"rgba(255,255,255,0.72)", lineHeight:1.6 }}>
            Payment confirmed. We'll reach out to finalize your delivery window.
          </p>
        </div>

        {/* Booking summary */}
        {(dumpsterSize || rentalOption) && (
          <div style={{ background:C.cardBg, border:`1px solid ${C.cardBorder}`, borderRadius:14, padding:"20px 22px", marginBottom:16 }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.inkFaint, letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:12 }}>
              Your Rental
            </div>
            {dumpsterSize && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <span style={{ fontSize:13, color:C.inkMid }}>Dumpster</span>
                <span style={{ fontSize:15, fontWeight:800, color:C.ink }}>{dumpsterSize}</span>
              </div>
            )}
            {rentalOption && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <span style={{ fontSize:13, color:C.inkMid }}>Rental type</span>
                <span style={{ fontSize:14, fontWeight:700, color:C.ink }}>{rentalOption}</span>
              </div>
            )}
           {deliveryDate && (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
                <span style={{ fontSize:13, color:C.inkMid }}>Delivery date</span>
                <span style={{ fontSize:14, fontWeight:700, color:C.ink }}>{deliveryDate}</span>
              </div>
            )}
          </div>
        )}

        {/* What happens next */}
        <div style={{ background:C.greenBg, border:`1px solid ${C.greenBorder}`, borderRadius:14, padding:"20px 22px", marginBottom:16 }}>
          <div style={{ fontSize:10, fontWeight:700, color:C.green, letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:14 }}>
            What Happens Next
          </div>
          <div style={{ display:"grid", gap:14 }}>
            {[
              { step:"1", label:"Confirmation text", detail:"We'll text you to confirm your delivery window — usually within a few hours." },
              { step:"2", label:"Day-before reminder", detail:"You'll get a reminder text the day before your dumpster arrives." },
              { step:"3", label:"Delivery day", detail:"Your driver will text when we are en route for delivery. Please make sure the drop spot is clear." },
            ].map(({ step, label, detail }) => (
              <div key={step} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                <div style={{ width:26, height:26, borderRadius:"50%", background:C.green, color:C.white, fontSize:12, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {step}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:C.ink, marginBottom:2 }}>{label}</div>
                  <div style={{ fontSize:13, color:C.inkMid, lineHeight:1.5 }}>{detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Important reminders */}
        <div style={{ background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:"18px 22px", marginBottom:24 }}>
          <div style={{ fontSize:10, fontWeight:700, color:C.inkFaint, letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:12 }}>
            A Few Things to Know
          </div>
          <div style={{ display:"grid", gap:8 }}>
            {[
              "Keep the drop spot clear of vehicles, fencing, or low-hanging lines.",
              "Don't overfill past the top rail — we can't haul overloaded containers.",
              "Prohibited: tires, hazmat, paint, batteries, liquids. Call us if you're unsure.",
              "Need more time? Call or text us and we'll extend — additional days billed separately.",
            ].map((item, i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                <span style={{ color:C.pinkText, fontWeight:800, fontSize:14, flexShrink:0 }}>•</span>
                <span style={{ fontSize:13, color:C.inkMid, lineHeight:1.5 }}>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ display:"grid", gap:10 }}>
          <a
            href={HOMEPAGE}
            style={{ display:"block", padding:"14px", background:C.ink, color:C.white, borderRadius:12, fontSize:14, fontWeight:800, textDecoration:"none", textAlign:"center" }}
          >
            Back to Little Junkers ↗
          </a>
          <a
            href="tel:4705484733"
            style={{ display:"block", padding:"14px", background:C.white, color:C.ink, border:`1.5px solid ${C.cardBorder}`, borderRadius:12, fontSize:14, fontWeight:800, textDecoration:"none", textAlign:"center" }}
          >
            Questions? Call or text 470-548-4733
          </a>
        </div>

      </div>
    </div>
  );
}
