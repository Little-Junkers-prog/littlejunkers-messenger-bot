import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

// Stripe publishable key loaded once at module level (not per render)
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);

const C = {
  // Sprint 4: matched to littlejunkersllc.com live palette (May 2026)
  pageBg: "#ffffff",        // website page background (was #edeae4)
  cardBg: "#ffffff",
  cardBorder: "#e5e0d8",
  heroBg: "#1e1c19",
  heroAccent: "#ffcee4",
  surfaceBg: "#f0ece6",     // warm gray section bg matching website (was #faf8f5)
  surfaceBorder: "#e5e0d8", // tightened to match website card borders (was #e8e3db)
  ink: "#1a1a1a",
  inkMid: "#212529",        // website body text rgb(33,37,41) (was #555555)
  inkMuted: "#999999",
  inkFaint: "#b8b0a6",
  pink: "#ffcee4",
  pinkBar: "#ffb3d4",
  pinkText: "#c2587a",
  pinkBg: "#fff5fb",
  pinkBorder: "#ffd6eb",
  warningBg: "#fff8eb",
  warningBorder: "#f2cf7a",
  white: "#ffffff",
};

// Sprint 4: brand fonts matching littlejunkersllc.com
// FH = headings (Poppins), FB = body (Questrial), F = default fallback
const FH = "Poppins, system-ui, -apple-system, sans-serif";
const FB = "Questrial, system-ui, -apple-system, sans-serif";
const F = FB; // default — body font used throughout; override with FH on headings
const HOMEPAGE = "https://www.littlejunkersllc.com";
const IDLE_TIMEOUT_MS = 12 * 60 * 1000; // 12 minutes
const AVAILABILITY_ENDPOINT = "/api/availability";
const PRICING_ENDPOINT = "/api/get-pricing";

const DUMPSTER_IMAGES = {
  "11 Yard": "/11 -yard image.png",
  "16 Yard": "/16 -yard image.png",
  "21 Yard": "/21 -yard image.png",
};

function extractSizeYards(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function sizeLabelFromYards(value) {
  const yards = extractSizeYards(value);
  return yards ? `${yards} Yard` : "";
}

function sizeCodeFromLabel(value) {
  const yards = extractSizeYards(value);
  return yards ? `${yards}YD` : "";
}

function formatIncludedTons(tons) {
  const n = Number(tons || 0);
  if (!n) return "Includes tonnage";
  return `Includes ${n} ton${n !== 1 ? "s" : ""}`;
}

function getAreaLabel(serviceArea, zip) {
  if (serviceArea?.areaLabel) return serviceArea.areaLabel;
  if (!zip) return "Your area";
  return `ZIP ${zip} area`;
}

function resolveServiceArea(pricingConfig, zip) {
  const clean = String(zip || "").trim();
  const zipEntry = pricingConfig?.zipCodes?.[clean];
  if (!zipEntry)
    return {
      serviceable: false,
      zip: clean,
      error: "We may not service that area right now.",
    };
  const zoneEntry = pricingConfig?.serviceAreas?.[zipEntry.zone];
  if (!zoneEntry)
    return {
      serviceable: false,
      zip: clean,
      error: "That ZIP is mapped to a service area that is not configured yet.",
    };
  return {
    serviceable: true,
    zip: clean,
    areaLabel: zipEntry.areaLabel || `ZIP ${clean} area`,
    zone: zoneEntry.zone,
    rentalZone: zoneEntry.rentalZone,
    zoneLabel: zoneEntry.label,
    deliveryFee: Number(zoneEntry.deliveryFee || 0),
    dryRunFee: Number(zoneEntry.dryRunFee || 0),
  };
}

function buildSizeMeta(sizes) {
  const rows = Object.values(sizes || {}).sort(
    (a, b) => Number(a.sizeYards || 0) - Number(b.sizeYards || 0),
  );
  return rows.reduce((acc, row) => {
    const label = row.label || sizeLabelFromYards(row.sizeYards);
    if (!label) return acc;
    const tons = Number(row.includedTons || 0);
    acc[label] = {
      tons: tons || 1,
      label: formatIncludedTons(tons || 1),
      bestFor:
        row.longDesc ||
        row.shortDesc ||
        row.bestUse ||
        "Cleanup and debris removal projects",
      short: row.shortDesc || row.bestUse || "Dumpster rental option",
      height: row.heightFt ? `${row.heightFt}'` : "",
      sizeCode: row.sizeCode || sizeCodeFromLabel(label),
      truckLoads: row.truckLoads || null,
      projectScale: row.projectScale || null,
      bestUse: row.bestUse || row.shortDesc || null,
    };
    return acc;
  }, {});
}

// Maps raw Supabase day_restriction strings to JS getDay() integers (0=Sun).
// All known restriction values must be listed here. Add new ones as tiers are
// added in Supabase — do NOT add fallback logic that silently allows any day.
const DAY_RESTRICTION_MAP = {
  mon_tue: [1, 2],
  "mon/tue": [1, 2],
  montue: [1, 2],
  monday_tuesday: [1, 2],
  weekday: [1, 2, 3, 4, 5],
  mon: [1],
  tue: [2],
  wed: [3],
  thu: [4],
  fri: [5],
};

// Human-readable labels for raw restriction strings shown in UI sublabels.
const DAY_RESTRICTION_LABEL = {
  mon_tue: "Mon or Tue delivery only",
  "mon/tue": "Mon or Tue delivery only",
  montue: "Mon or Tue delivery only",
  monday_tuesday: "Mon or Tue delivery only",
  weekday: "Weekday delivery only",
  mon: "Monday delivery only",
  tue: "Tuesday delivery only",
  wed: "Wednesday delivery only",
  thu: "Thursday delivery only",
  fri: "Friday delivery only",
};

function parseDayRestriction(dayRestriction) {
  if (!dayRestriction) return null;
  const key = String(dayRestriction).toLowerCase().trim();
  return DAY_RESTRICTION_MAP[key] || null;
}

function dayRestrictionLabel(dayRestriction) {
  if (!dayRestriction) return null;
  const key = String(dayRestriction).toLowerCase().trim();
  return DAY_RESTRICTION_LABEL[key] || null;
}

function buildRentalOptions(pricingRows) {
  return (pricingRows || []).map((tier) => {
    const validDays = parseDayRestriction(tier.dayRestriction);
    const restrictionLabel = dayRestrictionLabel(tier.dayRestriction);
    return {
      key: tier.tierKey,
      label: tier.displayLabel || tier.tierKey,
      displayLabel: tier.displayLabel || tier.tierKey,
      sub: restrictionLabel
        ? `${tier.durationDays}-day rental · ${restrictionLabel}`
        : `${tier.durationDays}-day rental`,
      tag: tier.badgeTag || "",
      validDays,
      durationDays: Number(tier.durationDays || 0),
      dayRestriction: tier.dayRestriction,
    };
  });
}

function normalizeRentalOption(key, rentalOptions = []) {
  const option = rentalOptions.find((o) => o.key === key);
  return option?.displayLabel || option?.label || key || "";
}

function getRentalDisplayLabel(key, rentalOptions = []) {
  const option = rentalOptions.find((o) => o.key === key);
  return option?.displayLabel || option?.label || key || "-";
}

function containsHeavyKeywords(text) {
  return [
    "demo",
    "renovation",
    "remodel",
    "cabinet",
    "drywall",
    "flooring",
    "tile",
    "brick",
    "block",
    "dirt",
    "gravel",
    "shingles",
    "roof",
    "deck",
    "shed",
    "heavy",
    "weight bench",
    "construction",
  ].some((w) => text.includes(w));
}
function containsLightKeywords(text) {
  return [
    "garage",
    "attic",
    "closet",
    "cardboard",
    "boxes",
    "declutter",
    "moving",
    "household",
    "furniture",
    "basement",
    "junk",
  ].some((w) => text.includes(w));
}

function normalizeProjectForOdoo(project) {
  const map = {
    "Cleaning the garage / basement": "Cleanout",
    "Moving / decluttering": "Moving",
    "Renovation / demo": "Renovation",
    "General Cleanup": "Cleanout",
    Roofing: "Roofing",
    Other: "Other",
  };
  return map[project] || (project ? "Other" : "");
}

function getRecommendation(customerType, project, otherText = "") {
  const o = String(otherText || "").toLowerCase();
  if (customerType === "Contractor" || customerType === "Contractor / Roofer") {
    if (project === "Roofing")
      return {
        size: "11 Yard",
        holds: [
          "Approx. 30 squares of single-layer shingles",
          "Approx. 4-5 pickup truck loads of debris",
          "Heavy roofing material with safer weight control",
        ],
        reason:
          "Roofing materials are deceptively heavy. We recommend the 11-Yard to keep the load within a safer lifting range and reduce overweight risk.",
        note: "For larger tear-offs, two smaller loads are often better than one overweight container with added overage costs.",
      };
    if (project === "Renovation / demo")
      return {
        size: "21 Yard",
        holds: [
          "Larger renovation and demo loads",
          "Approx. 8-10 pickup truck loads",
          "Bulky debris that builds fast on jobsites",
        ],
        reason:
          "Contractor demo jobs usually generate more volume and bulk than expected, so the 21-Yard is the better operational starting point.",
        note: "This gives your crew more working room up front and reduces the chance of needing an early swap.",
      };
    if (project === "General Cleanup")
      return {
        size: "16 Yard",
        holds: [
          "General contractor cleanup and mixed debris",
          "Approx. 6-7 pickup truck loads",
          "Day-to-day jobsite volume without oversizing",
        ],
        reason:
          "For mixed contractor cleanup, the 16-Yard is the strongest all-around fit because it balances usable capacity and fast turnaround.",
        note: "It handles a broad mix of material without jumping straight to the biggest box.",
      };
    if (project === "Other") {
      if (containsHeavyKeywords(o))
        return {
          size: "21 Yard",
          holds: [
            "Heavier or bulkier contractor debris",
            "Approx. 8-10 pickup truck loads",
            "Projects likely to expand once work begins",
          ],
          reason:
            "Based on what you described, this sounds more like a bulk-heavy contractor load that benefits from extra volume.",
          note: "The 21-Yard gives more room to work and reduces the risk of under-ordering.",
        };
      return {
        size: "16 Yard",
        holds: [
          "Mixed contractor debris",
          "Approx. 6-7 pickup truck loads",
          "Flexible jobsite cleanup where scope is still moving",
        ],
        reason:
          "When contractor debris is mixed or unclear, the 16-Yard is the safest all-around recommendation.",
        note: "It gives you flexibility without overshooting the project size too early.",
      };
    }
    return {
      size: "16 Yard",
      holds: [
        "General contractor debris",
        "Approx. 6-7 pickup truck loads",
        "A practical everyday jobsite starting point",
      ],
      reason:
        "The 16-Yard is the strongest contractor default for mixed cleanup and repeat jobsite use.",
      note: "It gives enough room for most common loads while staying efficient to turn.",
    };
  }
  if (project === "Cleaning the garage / basement")
    return {
      size: "11 Yard",
      holds: [
        "Garage and basement cleanouts",
        "Approx. 4-5 pickup truck loads",
        "Smaller household junk and boxed material",
      ],
      reason:
        "Garage and basement cleanouts are often a strong fit for the 11-Yard when the job is mostly household junk and smaller items.",
      note: "If the project grows into furniture, multiple rooms, or bulkier material, the 16-Yard becomes the safer step up.",
    };
  if (project === "Moving / decluttering")
    return {
      size: "16 Yard",
      holds: [
        "Moving and decluttering projects",
        "Approx. 6-7 pickup truck loads",
        "A broader mix of furniture, boxes, and overflow",
      ],
      reason:
        "Moving and decluttering projects usually expand once you start pulling things out, so the 16-Yard gives more breathing room.",
      note: "It is the strongest all-around fit for mixed household volume without overcommitting to the largest size.",
    };
  if (project === "Renovation / demo")
    return {
      size: "21 Yard",
      holds: [
        "Renovation and demo debris",
        "Approx. 8-10 pickup truck loads",
        "Bulky material that builds fast during active work",
      ],
      reason:
        "Renovation and demo projects create more volume and bulk, so the 21-Yard is the safer recommendation for keeping the project moving.",
      note: "It reduces the chance of running out of space mid-project and needing another haul sooner than expected.",
    };
  if (project === "Roofing")
    return {
      size: "11 Yard",
      holds: [
        "Smaller roofing tear-offs",
        "Approx. 4-5 pickup truck loads of shingles",
        "Heavy debris with better weight control",
      ],
      reason:
        "Roofing debris gets heavy fast, so starting smaller is the safer move for weight control and pickup safety.",
      note: "We would rather steer you into a safer fit than a larger box that becomes overweight and costly.",
    };
  if (project === "Other") {
    if (containsHeavyKeywords(o))
      return {
        size: "21 Yard",
        holds: [
          "Heavier or bulkier mixed debris",
          "Approx. 8-10 pickup truck loads",
          "Projects that sound more renovation-driven",
        ],
        reason:
          "What you described sounds heavier, bulkier, or more demo-oriented, so the 21-Yard is the safer recommendation.",
        note: "That gives you more room if the project expands once you get started.",
      };
    if (containsLightKeywords(o))
      return {
        size: "11 Yard",
        holds: [
          "Lighter household cleanup",
          "Approx. 4-5 pickup truck loads",
          "Smaller-volume junk where weight stays manageable",
        ],
        reason:
          "What you described sounds more like a lighter cleanout, which often fits well in the 11-Yard.",
        note: "If the scope grows once you start, the 16-Yard is the next safer step up.",
      };
    return {
      size: "16 Yard",
      holds: [
        "Mixed cleanup jobs",
        "Approx. 6-7 pickup truck loads",
        "Projects where the final debris mix is still unclear",
      ],
      reason:
        "When a project is mixed or unclear, the 16-Yard is usually the safest recommendation because it gives flexibility without overshooting too much.",
      note: "It is the most balanced starting point for uncertain jobs.",
    };
  }
  return {
    size: "16 Yard",
    holds: [
      "Mixed cleanup jobs",
      "Approx. 6-7 pickup truck loads",
      "A practical all-around fit for household projects",
    ],
    reason:
      "The 16-Yard is a strong all-around default for mixed cleanup and household projects.",
    note: "It gives more room than the smallest option without going oversized.",
  };
}

function ProgressChrome({
  currentVisualStep,
  visibleTotalSteps,
  stepLabel,
  progressPercent,
  onBack,
  showBack,
}) {
  return (
    <div
      style={{ borderBottom: `1px solid ${C.surfaceBorder}`, marginBottom: 0 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 24px 0",
          fontFamily: F,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.inkFaint,
            letterSpacing: "0.3px",
          }}
        >
          Step {currentVisualStep} of {visibleTotalSteps}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.ink }}>
          {stepLabel}
        </span>
      </div>
      <div style={{ padding: "8px 24px 12px" }}>
        <div
          style={{
            height: 3,
            background: C.surfaceBorder,
            borderRadius: 99,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              background: C.pinkBar,
              borderRadius: 99,
              transition: "width 300ms ease",
            }}
          />
        </div>
      </div>
      {showBack && (
        <div style={{ padding: "0 24px 10px" }}>
          <button
            onClick={onBack}
            style={{
              background: "none",
              border: "none",
              fontSize: 13,
              color: C.inkMuted,
              cursor: "pointer",
              padding: 0,
              fontWeight: 700,
              fontFamily: F,
            }}
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}

function CardBody({ children }) {
  return <div style={{ padding: "22px 24px" }}>{children}</div>;
}

function StepHeading({ eyebrow, title, text }) {
  return (
    <div style={{ marginBottom: 20, fontFamily: F }}>
      {eyebrow && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.pinkText,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            marginBottom: 5,
            fontFamily: FH,
          }}
        >
          {eyebrow}
        </div>
      )}
      <h2
        style={{
          margin: "0 0 7px",
          fontSize: 22,
          fontWeight: 900,
          color: C.ink,
          letterSpacing: "-0.5px",
          lineHeight: 1.15,
          fontFamily: FH,
        }}
      >
        {title}
      </h2>
      {text && (
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: C.inkMid,
            lineHeight: 1.55,
            fontFamily: F,
          }}
        >
          {text}
        </p>
      )}
    </div>
  );
}

function OptionCard({ title, sub, tag, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "16px 18px",
        borderRadius: 12,
        fontFamily: F,
        cursor: "pointer",
        border: selected
          ? `1.5px solid ${C.ink}`
          : `1px solid ${C.surfaceBorder}`,
        background: selected ? C.white : C.surfaceBg,
        boxShadow: selected ? "0 0 0 1px rgba(26,26,26,0.06)" : "none",
        transition: "border-color 150ms, background 150ms",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: C.ink,
              fontFamily: FH,
            }}
          >
            {title}
          </div>
          {sub && (
            <div
              style={{
                marginTop: 3,
                fontSize: 13,
                color: C.inkMuted,
                lineHeight: 1.4,
                fontFamily: F,
              }}
            >
              {sub}
            </div>
          )}
        </div>
        {tag && (
          <span
            style={{
              background: C.pinkBg,
              color: C.pinkText,
              border: `1px solid ${C.pinkBorder}`,
              fontSize: 11,
              fontWeight: 800,
              padding: "3px 9px",
              borderRadius: 99,
              whiteSpace: "nowrap",
              fontFamily: F,
            }}
          >
            {tag}
          </span>
        )}
      </div>
    </button>
  );
}

function PrimaryButton({ onClick, children, style, disabled = false }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "block",
        width: "100%",
        padding: "15px",
        background: disabled ? C.inkFaint : C.ink,
        color: C.white,
        border: "none",
        borderRadius: 12,
        fontSize: 15,
        fontWeight: 800,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: FH,
        letterSpacing: "0.1px",
        marginTop: 18,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function TonnagePill({ label }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: C.pinkBg,
        border: `1px solid ${C.pinkBorder}`,
        color: C.pinkText,
        fontSize: 11,
        fontWeight: 800,
        padding: "4px 10px",
        borderRadius: 99,
        fontFamily: F,
      }}
    >
      {label}
    </span>
  );
}

function CardFooter() {
  return (
    <div
      style={{
        borderTop: `1px solid ${C.surfaceBorder}`,
        padding: "13px 24px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: C.surfaceBg,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.inkFaint,
          fontFamily: F,
          letterSpacing: "0.3px",
        }}
      >
        Questions? Call or text us anytime.
      </span>
      <a
        href="tel:4705484733"
        style={{
          fontSize: 14,
          fontWeight: 900,
          color: C.ink,
          textDecoration: "none",
          fontFamily: F,
          whiteSpace: "nowrap",
          marginLeft: 12,
        }}
      >
        470-548-4733
      </a>
    </div>
  );
}

function ExitModal({
  onSubmit,
  onDismiss,
  submitting,
  error,
  capturedSize,
  capturedPrice,
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const phoneHasValue = phone.trim().length > 0;
  const handleSubmit = () => {
    if (!phone.trim()) return;
    onSubmit({
      name: name.trim(),
      phone: phone.trim(),
      smsOptIn,
      smsOptInDate: smsOptIn ? new Date().toISOString() : null,
    });
  };
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        fontFamily: F,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: C.white,
          borderRadius: "20px 20px 0 0",
          padding: "28px 24px 40px",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ position: "relative", marginBottom: 22 }}>
          <div
            style={{
              width: 40,
              height: 4,
              background: C.surfaceBorder,
              borderRadius: 99,
              margin: "0 auto",
            }}
          />
          <button
            onClick={onDismiss}
            aria-label="Close"
            style={{
              position: "absolute",
              top: -8,
              right: 0,
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: C.surfaceBg,
              border: `1px solid ${C.surfaceBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: 18,
              color: C.ink,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.pinkText,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Before you go
        </div>
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: 22,
            fontWeight: 900,
            color: C.ink,
            letterSpacing: "-0.5px",
            lineHeight: 1.15,
          }}
        >
          Want us to text you this quote?
        </h2>
        <p
          style={{
            margin: "0 0 20px",
            fontSize: 14,
            color: C.inkMid,
            lineHeight: 1.55,
          }}
        >
          {capturedSize && capturedPrice
            ? `We'll hold your ${capturedSize} quote of $${capturedPrice} and text you when you're ready.`
            : "Drop your number and we'll send the details so you can finish when you're ready."}
        </p>
        <div style={{ display: "grid", gap: 12 }}>
          <input
            placeholder="Your name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              display: "block",
              width: "100%",
              padding: "13px 14px",
              border: `1.5px solid ${C.surfaceBorder}`,
              borderRadius: 10,
              background: C.white,
              fontSize: 15,
              color: C.ink,
              boxSizing: "border-box",
              fontFamily: F,
            }}
          />
          <input
            placeholder="Phone number *"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            style={{
              display: "block",
              width: "100%",
              padding: "13px 14px",
              border: `1.5px solid ${phoneHasValue ? C.ink : C.surfaceBorder}`,
              borderRadius: 10,
              background: C.white,
              fontSize: 15,
              color: C.ink,
              boxSizing: "border-box",
              fontFamily: F,
            }}
          />
          {phoneHasValue && (
            <label
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                fontFamily: F,
              }}
            >
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => setSmsOptIn(e.target.checked)}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: C.inkMid, lineHeight: 1.45 }}>
                I agree to receive text messages from Little Junkers about my
                quote and rental.
              </span>
            </label>
          )}
          {error && (
            <div
              style={{
                background: C.warningBg,
                border: `1px solid ${C.warningBorder}`,
                borderRadius: 10,
                padding: "10px 14px",
                fontSize: 13,
                color: C.ink,
              }}
            >
              {error}
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={!phoneHasValue || submitting}
            style={{
              width: "100%",
              padding: "15px",
              background: !phoneHasValue || submitting ? C.inkFaint : C.ink,
              color: C.white,
              border: "none",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 800,
              cursor: !phoneHasValue || submitting ? "not-allowed" : "pointer",
              fontFamily: F,
            }}
          >
            {submitting ? "Sending..." : "Text Me My Quote"}
          </button>
          <button
            onClick={onDismiss}
            style={{
              width: "100%",
              padding: "15px",
              background: C.white,
              color: C.inkMuted,
              border: `1px solid ${C.surfaceBorder}`,
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: F,
            }}
          >
            No thanks
          </button>
          <div
            style={{
              textAlign: "center",
              fontSize: 12,
              color: C.inkFaint,
              marginTop: 4,
            }}
          >
            We won't spam you. One text, that's it.
          </div>
        </div>
      </div>
    </div>
  );
}

function Step5DatePicker({
  effectiveSize,
  availabilityLoading,
  isAvailabilityDegraded,
  availableOptions,
  calculatedPrices,
  selectedWindow,
  duration,
  showMoreDates,
  setShowMoreDates,
  handleWindowSelect,
  handleFallbackOptionSelect,
  sizeMeta,
  rentalOptions,
  blockedDates,
  recommendedTierKey,
  economyTierKeys,
  showEconomyTiers,
  setShowEconomyTiers,
}) {
  const TIERS = useMemo(
    () =>
      (rentalOptions || []).map((option) => ({
        key: option.key,
        label: option.label || option.displayLabel || option.key,
        sublabel: option.sub || "",
        tag: option.tag || null,
        validDays: option.validDays || null,
        duration: Number(option.durationDays || 1),
      })),
    [rentalOptions],
  );
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const tomorrow = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }, [today]);
  const windowEnd = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 90);
    return d;
  }, [today]);
  // Pre-expand the recommended tier on mount so customer sees it open immediately.
  const [selectedTierKey, setSelectedTierKey] = useState(duration || recommendedTierKey || null);
  const [calendarMonth, setCalendarMonth] = useState(() => ({
    year: tomorrow.getFullYear(),
    month: tomorrow.getMonth(),
  }));
  const blocked = useMemo(
    () =>
      !blockedDates || !Array.isArray(blockedDates)
        ? new Set()
        : new Set(blockedDates),
    [blockedDates],
  );
  const toDateStr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (d, n) => {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  };
  const formatDisplay = (d) =>
    d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  const formatShort = (d) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const isDateAvailable = (d) => {
    if (d <= today) return false;
    if (d > windowEnd) return false;
    if (isAvailabilityDegraded) return false;
    return !blocked.has(toDateStr(d));
  };
  const isDateSelectableForTier = (d, tier) => {
    if (!isDateAvailable(d)) return false;
    if (tier.validDays && !tier.validDays.includes(d.getDay())) return false;
    if (!isAvailabilityDegraded) {
      for (let i = 0; i < tier.duration; i++) {
        const day = addDays(d, i);
        if (blocked.has(toDateStr(day))) return false;
      }
    }
    return true;
  };
  const handleTierSelect = (tierKey) => setSelectedTierKey(tierKey);
  const handleDateSelect = (d, tier) => {
    if (!isDateSelectableForTier(d, tier)) return;
    const endDate = addDays(d, tier.duration);
    const windowObj = {
      start: toDateStr(d),
      end: toDateStr(endDate),
      startLabel: formatDisplay(d),
      endLabel: formatDisplay(endDate),
      startIso: d.toISOString(),
      endIso: endDate.toISOString(),
    };
    const option = rentalOptions.find((o) => o.key === tier.key) || {
      key: tier.key,
    };
    handleWindowSelect(option, windowObj);
  };
  const CalendarWidget = ({ tier }) => {
    const { year, month } = calendarMonth;
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = firstDay.getDay();
    const monthLabel = firstDay.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
    const dayHeaders = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    const prevMonth = () =>
      setCalendarMonth((prev) => {
        let m = prev.month - 1,
          y = prev.year;
        if (m < 0) {
          m = 11;
          y--;
        }
        return { year: y, month: m };
      });
    const nextMonth = () =>
      setCalendarMonth((prev) => {
        let m = prev.month + 1,
          y = prev.year;
        if (m > 11) {
          m = 0;
          y++;
        }
        return { year: y, month: m };
      });
    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++)
      cells.push(new Date(year, month, d));
    const selectedStart = selectedWindow?.start;
    return (
      <div style={{ background: C.white }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: `1px solid ${C.surfaceBorder}`,
          }}
        >
          <button
            onClick={prevMonth}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: C.ink,
              padding: "0 8px",
              lineHeight: 1,
            }}
          >
            ‹
          </button>
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: C.ink,
              fontFamily: F,
            }}
          >
            {monthLabel}
          </span>
          <button
            onClick={nextMonth}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 20,
              color: C.ink,
              padding: "0 8px",
              lineHeight: 1,
            }}
          >
            ›
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7,1fr)",
            padding: "8px 8px 2px",
          }}
        >
          {dayHeaders.map((h) => (
            <div
              key={h}
              style={{
                textAlign: "center",
                fontSize: 10,
                fontWeight: 700,
                color: C.inkFaint,
                fontFamily: F,
                paddingBottom: 2,
              }}
            >
              {h}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7,1fr)",
            padding: "0 8px 10px",
            gap: 2,
          }}
        >
          {cells.map((d, i) => {
            if (!d) return <div key={`pad-${i}`} />;
            const dateStr = toDateStr(d);
            if (d <= today) return <div key={dateStr} />;
            const selectable = isDateSelectableForTier(d, tier);
            const isOutside = d > windowEnd;
            const isWrongDay =
              tier.validDays && !tier.validDays.includes(d.getDay());
            const isFull = !isOutside && !isWrongDay && !isDateAvailable(d);
            const isSelected =
              dateStr === selectedStart && duration === tier.key;
            let bg = "transparent",
              color = C.ink,
              opacity = 1,
              cursor = "pointer",
              textDeco = "none";
            if (isSelected) {
              bg = C.pinkText;
              color = C.white;
            } else if (isOutside) {
              color = C.inkFaint;
              opacity = 0.3;
              cursor = "default";
            } else if (isWrongDay) {
              color = C.inkFaint;
              opacity = 0.25;
              cursor = "default";
            } else if (isFull) {
              color = C.inkFaint;
              opacity = 0.4;
              cursor = "not-allowed";
              textDeco = "line-through";
            } else if (selectable) {
              color = C.ink;
            }
            return (
              <button
                key={dateStr}
                onClick={() => selectable && handleDateSelect(d, tier)}
                style={{
                  padding: "7px 0",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: isSelected ? 800 : 500,
                  textAlign: "center",
                  fontFamily: F,
                  background: bg,
                  color,
                  opacity,
                  cursor,
                  border: "none",
                  textDecoration: textDeco,
                  transition: "background 100ms",
                }}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>
        {selectedWindow?.start && duration === tier.key && (
          <div
            style={{
              padding: "10px 16px 14px",
              borderTop: `1px solid ${C.surfaceBorder}`,
              textAlign: "center",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: C.pinkText,
                fontFamily: F,
              }}
            >
              Drop off{" "}
              {formatShort(new Date(selectedWindow.start + "T12:00:00"))} · Pick
              up {formatShort(new Date(selectedWindow.end + "T12:00:00"))}
            </span>
          </div>
        )}
        {isAvailabilityDegraded && (
          <div
            style={{
              padding: "16px",
              background: "#fff8eb",
              borderTop: "1px solid #ffe58f",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: "#8a6300",
                marginBottom: 4,
              }}
            >
              Live availability temporarily unavailable
            </div>
            <div style={{ fontSize: 13, color: "#8a6300" }}>
              Please call or text us at 470-548-4733 and we'll confirm the
              soonest delivery option.
            </div>
          </div>
        )}
      </div>
    );
  };
  if (!TIERS.length)
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: C.inkFaint, fontFamily: F }}>
          Loading rental options…
        </div>
      </div>
    );
  if (availabilityLoading)
    return (
      <div style={{ padding: "40px 0", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: C.inkFaint, fontFamily: F }}>
          Checking availability…
        </div>
      </div>
    );
  return (
    <div>
      <StepHeading
        eyebrow="Almost there"
        title="When do you want your dumpster?"
        text={`Delivery and includes ${sizeMeta[effectiveSize]?.tons || 1} ton${(sizeMeta[effectiveSize]?.tons || 1) !== 1 ? "s" : ""} included in all prices below.`}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderRadius: 12,
          border: `1px solid ${C.surfaceBorder}`,
          background: C.surfaceBg,
          marginBottom: 16,
          fontFamily: F,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>
          {effectiveSize}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: C.pinkText,
            background: C.pinkBg,
            border: `1px solid ${C.pinkBorder}`,
            borderRadius: 99,
            padding: "3px 10px",
          }}
        >
          Includes {sizeMeta[effectiveSize]?.tons || 1} ton
          {(sizeMeta[effectiveSize]?.tons || 1) !== 1 ? "s" : ""}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {/* Primary tiers — shown always */}
        {TIERS.filter((t) => !economyTierKeys?.has(t.key)).map((tier) => {
          const price = calculatedPrices[tier.key];
          const isActive = selectedTierKey === tier.key;
          const isRecommended = tier.key === recommendedTierKey;
          return (
            <div key={tier.key}>
              <button
                onClick={() => handleTierSelect(tier.key)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "16px 18px",
                  borderRadius: isActive ? "12px 12px 0 0" : 12,
                  cursor: "pointer",
                  fontFamily: F,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  border: isActive
                    ? `2px solid ${C.pinkText}`
                    : `1px solid ${C.surfaceBorder}`,
                  borderBottom: isActive ? "none" : undefined,
                  background: isActive ? C.pinkBg : C.white,
                  boxShadow: isActive
                    ? `0 0 0 3px ${C.pinkBorder}`
                    : "0 1px 3px rgba(0,0,0,0.04)",
                  transition: "border-color 150ms, background 150ms",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 3,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 900,
                        color: isActive ? C.pinkText : C.ink,
                        fontFamily: F,
                      }}
                    >
                      {tier.label}
                    </span>
                    {isRecommended && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: C.white,
                          background: C.pinkText,
                          borderRadius: 99,
                          padding: "2px 9px",
                          fontFamily: F,
                        }}
                      >
                        Recommended
                      </span>
                    )}
                    {tier.tag && !isRecommended && (
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          color: C.pinkText,
                          background: isActive ? C.white : C.pinkBg,
                          border: `1px solid ${C.pinkBorder}`,
                          borderRadius: 99,
                          padding: "2px 8px",
                          fontFamily: F,
                        }}
                      >
                        {tier.tag}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: isActive ? C.pinkText : C.inkMuted,
                      fontFamily: F,
                    }}
                  >
                    {tier.sublabel}
                  </div>
                </div>
                <div
                  style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}
                >
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: isActive ? C.pinkText : C.ink,
                      letterSpacing: "-0.5px",
                      fontFamily: FH,
                    }}
                  >
                    {typeof price === "number" ? `$${price}` : "—"}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: isActive ? C.pinkText : C.inkFaint,
                      fontFamily: F,
                      marginTop: 2,
                    }}
                  >
                    {isActive ? "select a date ↓" : "tap to select"}
                  </div>
                </div>
              </button>
              {isActive && (
                <div
                  style={{
                    border: `2px solid ${C.pinkText}`,
                    borderTop: "none",
                    borderRadius: "0 0 12px 12px",
                    overflow: "hidden",
                    boxShadow: `0 0 0 3px ${C.pinkBorder}`,
                    marginBottom: 2,
                  }}
                >
                  <CalendarWidget tier={tier} />
                </div>
              )}
            </div>
          );
        })}

        {/* Economy tiers — collapsed behind expandable to de-emphasize */}
        {economyTierKeys && economyTierKeys.size > 0 && (
          <div style={{ marginTop: 4 }}>
            <button
              onClick={() => setShowEconomyTiers((v) => !v)}
              style={{
                width: "100%",
                background: "none",
                border: `1px dashed ${C.surfaceBorder}`,
                borderRadius: 10,
                padding: "11px 16px",
                cursor: "pointer",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontFamily: F,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: C.inkMuted }}>
                {showEconomyTiers ? "Hide economy options ▲" : "Looking for the lowest price? ▼"}
              </span>
              <span style={{ fontSize: 11, color: C.inkFaint, fontFamily: F }}>
                Mon/Tue delivery required
              </span>
            </button>

            {showEconomyTiers &&
              TIERS.filter((t) => economyTierKeys.has(t.key)).map((tier) => {
                const price = calculatedPrices[tier.key];
                const isActive = selectedTierKey === tier.key;
                return (
                  <div key={tier.key} style={{ marginTop: 8 }}>
                    <button
                      onClick={() => handleTierSelect(tier.key)}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "14px 18px",
                        borderRadius: isActive ? "12px 12px 0 0" : 12,
                        cursor: "pointer",
                        fontFamily: F,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        border: isActive
                          ? `2px solid ${C.pinkText}`
                          : `1px solid ${C.surfaceBorder}`,
                        borderBottom: isActive ? "none" : undefined,
                        background: isActive ? C.pinkBg : C.white,
                        opacity: 0.85,
                        transition: "border-color 150ms, background 150ms",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: isActive ? C.pinkText : C.ink, fontFamily: F }}>
                            {tier.label}
                          </span>
                          {tier.tag && (
                            <span style={{ fontSize: 10, fontWeight: 800, color: C.pinkText, background: C.pinkBg, border: `1px solid ${C.pinkBorder}`, borderRadius: 99, padding: "2px 8px", fontFamily: F }}>
                              {tier.tag}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: isActive ? C.pinkText : C.inkMuted, fontFamily: F }}>
                          {tier.sublabel}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: isActive ? C.pinkText : C.ink, letterSpacing: "-0.5px", fontFamily: F }}>
                          {typeof price === "number" ? `$${price}` : "—"}
                        </div>
                        <div style={{ fontSize: 11, color: isActive ? C.pinkText : C.inkFaint, fontFamily: F, marginTop: 2 }}>
                          {isActive ? "select a date ↓" : "Mon/Tue only"}
                        </div>
                      </div>
                    </button>
                    {isActive && (
                      <div style={{ border: `2px solid ${C.pinkText}`, borderTop: "none", borderRadius: "0 0 12px 12px", overflow: "hidden", boxShadow: `0 0 0 3px ${C.pinkBorder}`, marginBottom: 2 }}>
                        <CalendarWidget tier={tier} />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}


// ── PaymentPhaseB ─────────────────────────────────────────────────────────────
// Must be rendered inside an <Elements> provider. Uses useStripe/useElements
// hooks to call stripe.confirmPayment() on submit.
function PaymentPhaseB({
  selectedPrice,
  effectiveSize,
  duration,
  rentalOptions,
  paymentError,
  setPaymentError,
  paymentElementReady,
  setPaymentElementReady,
  C,
  F,
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  const handlePay = async () => {
    if (!stripe || !elements) return;
    setPaying(true);
    setPaymentError("");

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/book`,
      },
    });

    // confirmPayment only returns here if there was an immediate error.
    // A successful payment redirects to return_url — this code won't run.
    if (error) {
      setPaymentError(
        error.message ||
          "Payment could not be completed. Please try again or call 470-548-4733."
      );
      setPaying(false);
    }
  };

  const rentalLabel = getRentalDisplayLabel(duration, rentalOptions);

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ marginBottom: 18 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: C.pinkText,
            letterSpacing: "1.2px",
            textTransform: "uppercase",
            marginBottom: 5,
            fontFamily: FH,
          }}
        >
          Secure Checkout
        </div>
        <h2
          style={{
            margin: "0 0 6px",
            fontSize: 22,
            fontWeight: 900,
            color: C.ink,
            letterSpacing: "-0.5px",
            lineHeight: 1.15,
            fontFamily: FH,
          }}
        >
          Complete your reservation
        </h2>
        <p style={{ margin: 0, fontSize: 14, color: C.inkMid }}>
          {effectiveSize} · {rentalLabel} · <strong>${selectedPrice}</strong>
        </p>
      </div>

      {/* Spinner shown while Payment Element mounts */}
      {!paymentElementReady && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "32px 0",
            color: C.inkMuted,
            fontSize: 14,
          }}
        >
          <span style={{ marginRight: 10 }}>Loading secure payment form…</span>
        </div>
      )}

      <div style={{ display: paymentElementReady ? "block" : "none" }}>
        <PaymentElement
          onReady={() => setPaymentElementReady(true)}
          options={{ layout: "tabs" }}
        />
      </div>

      {paymentError && (
        <div
          style={{
            marginTop: 14,
            background: "#fff0f0",
            border: "1px solid #fca5a5",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 13,
            color: "#991b1b",
          }}
        >
          {paymentError}
        </div>
      )}

      <PrimaryButton
        onClick={handlePay}
        disabled={paying || !stripe || !paymentElementReady}
        style={{ marginTop: 20 }}
      >
        {paying ? "Processing…" : "Complete Reservation"}
      </PrimaryButton>

      <p
        style={{
          textAlign: "center",
          fontSize: 12,
          color: C.inkMuted,
          marginTop: 14,
        }}
      >
        🔒 Secured by Stripe. We never store your card details.
      </p>
    </div>
  );
}

export default function Funnel() {
  const _urlZip = (() => {
    try {
      const p = new URLSearchParams(window.location.search).get("zip");
      return p && /^\d{5}$/.test(p.trim()) ? p.trim() : "";
    } catch {
      return "";
    }
  })();

  // Pre-selected size from URL ?size=11|16|21 — used by website product card CTAs
  // to drop the customer directly into the date picker for their intended size.
  const _urlSize = (() => {
    try {
      const p = new URLSearchParams(window.location.search).get("size");
      const n = Number(p);
      return [11, 16, 21].includes(n) ? `${n} Yard` : "";
    } catch {
      return "";
    }
  })();

  // ─── step state ───────────────────────────────────────────────────────────
  // Step 1 = product selection (landing screen)
  // Step 2 = delivery date picker
  // Step 3 = address + contact + ZIP resolution
  // Step 4 = reservation review + proceed to checkout
  const [step, setStep] = useState(1);

  // ─── help-me-choose inline expansion ──────────────────────────────────────
  const [showHelpMe, setShowHelpMe] = useState(false);

  // ─── zone / service area ──────────────────────────────────────────────────
  const [zip, setZip] = useState(_urlZip || "");
  const [zipError, setZipError] = useState("");
  const [zoneKey, setZoneKey] = useState("");
  const [zoneFee, setZoneFee] = useState(0);
  const [serviceArea, setServiceArea] = useState(null);
  const [zoneUpdateMessage, setZoneUpdateMessage] = useState("");

  // ─── customer / project (retained for lead tagging) ───────────────────────
  const [customerType, setCustomerType] = useState("");
  const [returningPath, setReturningPath] = useState("");
  const [project, setProject] = useState("");
  const [otherText, setOtherText] = useState("");
  const [showConcreteNotice, setShowConcreteNotice] = useState(false);

  // ─── size / rental selection ──────────────────────────────────────────────
  const [size, setSize] = useState("");
  const [overrideSize, setOverrideSize] = useState("");
  const [duration, setDuration] = useState("");
  const [selectedPrice, setSelectedPrice] = useState(null);

  // ─── availability ─────────────────────────────────────────────────────────
  const [availabilityData, setAvailabilityData] = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedWindow, setSelectedWindow] = useState(null);
  const [showMoreDates, setShowMoreDates] = useState({});

  // ─── checkout ─────────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);

  // ─── Payment Element (Sprint 3) ──────────────────────────────────────────
  // step4Phase: "review" (Phase A) | "payment" (Phase B — PE rendered)
  const [step4Phase, setStep4Phase] = useState("review");
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentElementReady, setPaymentElementReady] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    street: "",
    street2: "",
    city: "",
    state: "GA",
    zip: "",
    deliveryNotes: "",
  });

  // ─── pricing ──────────────────────────────────────────────────────────────
  const [pricingConfig, setPricingConfig] = useState(null);
  const [pricingLoading, setPricingLoading] = useState(true);
  const [pricingError, setPricingError] = useState("");

  // ─── lead capture ─────────────────────────────────────────────────────────
  const [capturedLeadId, setCapturedLeadId] = useState(null);
  const [capturedSupabaseLeadId, setCapturedSupabaseLeadId] = useState(null);

  // ─── exit modal ───────────────────────────────────────────────────────────
  const [showExitModal, setShowExitModal] = useState(false);
  const [exitSubmitting, setExitSubmitting] = useState(false);
  const [exitError, setExitError] = useState("");
  const [exitSubmitted, setExitSubmitted] = useState(false);
  const [exitTriggered, setExitTriggered] = useState(false);

  // ─── refs ─────────────────────────────────────────────────────────────────
  const stepRef = useRef(step);
  const idleTimerRef = useRef(null);
  const historyPushedRef = useRef(false);
  const checkoutStartedRef = useRef(false);
  const turnstileWidgetIdRef = useRef(null);
  const turnstileRenderedRef = useRef(false);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // ─── service area helpers ─────────────────────────────────────────────────
  const applyResolvedServiceArea = useCallback((cleanZip, resolvedArea) => {
    setZip(cleanZip);
    setServiceArea(resolvedArea);
    setZoneKey(resolvedArea.rentalZone || resolvedArea.zone || "");
    setZoneFee(Number(resolvedArea.deliveryFee || 0));
    setForm((prev) => ({ ...prev, zip: cleanZip }));
  }, []);

  // ─── load pricing on mount ────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setPricingLoading(true);
        setPricingError("");
        const url = _urlZip
          ? `${PRICING_ENDPOINT}?zip=${encodeURIComponent(_urlZip)}`
          : PRICING_ENDPOINT;
        const res = await fetch(url);
        const json = await res.json();
        if (!active) return;
        if (!res.ok || !json?.success)
          throw new Error(json?.error || "Unable to load pricing.");
        setPricingConfig(json);
        if (_urlZip) {
          const resolved = json.serviceArea?.serviceable
            ? json.serviceArea
            : resolveServiceArea(json, _urlZip);
          if (resolved?.serviceable) {
            applyResolvedServiceArea(_urlZip, resolved);
          }
        }
      } catch (err) {
        if (active) setPricingError(err.message || "Unable to load pricing.");
      } finally {
        if (active) setPricingLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyResolvedServiceArea, _urlZip]);

  // ─── URL size pre-selection ───────────────────────────────────────────────
  // Fires once after pricing loads. If ?size=11|16|21 is in the URL, call
  // handleProductSelect automatically to skip Step 1 and land on the date picker.
  // Guard: only fires when step is still 1 (user hasn't already navigated).
  useEffect(() => {
    if (!_urlSize || pricingLoading || pricingError || step !== 1) return;
    handleProductSelect(_urlSize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricingLoading]);

  // ─── turnstile (Phase A of Step 4 only) ─────────────────────────────────
  // Turnstile gates entry to Phase B (payment). It renders when the customer
  // is on the review screen and is reset when they go back from Step 4.
  useEffect(() => {
    if (
      step !== 4 ||
      step4Phase !== "review" ||
      typeof window === "undefined" ||
      !window.turnstile ||
      turnstileRenderedRef.current
    )
      return;
    const container = document.getElementById("turnstile-widget");
    if (!container) return;
    container.innerHTML = "";
    turnstileWidgetIdRef.current = window.turnstile.render(
      "#turnstile-widget",
      { sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY, theme: "light" },
    );
    turnstileRenderedRef.current = true;
  }, [step, step4Phase]);

  // ─── derived state ────────────────────────────────────────────────────────
  const sizeMeta = useMemo(
    () => buildSizeMeta(pricingConfig?.sizes),
    [pricingConfig],
  );
  const allSizes = useMemo(
    () =>
      Object.keys(sizeMeta).sort(
        (a, b) => extractSizeYards(a) - extractSizeYards(b),
      ),
    [sizeMeta],
  );
  const rentalOptions = useMemo(
    () => buildRentalOptions(pricingConfig?.pricing),
    [pricingConfig],
  );
  const areaLabel = getAreaLabel(serviceArea, zip);
  const effectiveSize = overrideSize || size;

  // For Help Me Choose recommendation
  const recommendation = useMemo(
    () => getRecommendation(customerType, project, otherText),
    [customerType, project, otherText],
  );

  // Prices: base + zoneFee (zoneFee is 0 until step 3 ZIP resolves)
  const calculatedPrices = useMemo(() => {
    if (!effectiveSize || !pricingConfig?.pricing) return {};
    const yards = String(extractSizeYards(effectiveSize));
    const p = {};
    (pricingConfig.pricing || []).forEach((tier) => {
      const base = Number(tier.prices?.[yards] || 0);
      if (base > 0) p[tier.tierKey] = base + zoneFee;
    });
    return p;
  }, [effectiveSize, pricingConfig, zoneFee]);

  // Lowest base price per size for product cards (no zone fee)
  const startingPrices = useMemo(() => {
    if (!pricingConfig?.pricing) return {};
    const p = {};
    allSizes.forEach((sizeKey) => {
      const yards = String(extractSizeYards(sizeKey));
      const prices = (pricingConfig.pricing || [])
        .map((tier) => Number(tier.prices?.[yards] || 0))
        .filter((v) => v > 0);
      if (prices.length) p[sizeKey] = Math.min(...prices);
    });
    return p;
  }, [pricingConfig, allSizes]);

  const isAvailabilityDegraded = Boolean(
    availabilityError || availabilityData?.degraded,
  );
  const availableOptions = availabilityData?.available || {};

  // ─── recommended tier logic ───────────────────────────────────────────────
  // Priority: 4-day → 2-day standard → anything else.
  // Economy (day-restricted) tiers are de-emphasized, never the default.
  const recommendedTierKey = useMemo(() => {
    if (!rentalOptions.length) return null;
    const priority = ["4day", "2day_standard", "7day", "2day_montue"];
    for (const key of priority) {
      if (rentalOptions.find((o) => o.key === key)) return key;
    }
    return rentalOptions[0]?.key || null;
  }, [rentalOptions]);

  // Economy tiers (day-restricted) are collapsed behind an expandable.
  const economyTierKeys = useMemo(
    () =>
      new Set(
        rentalOptions
          .filter((o) => o.validDays && o.validDays.length <= 2)
          .map((o) => o.key),
      ),
    [rentalOptions],
  );

  const [showEconomyTiers, setShowEconomyTiers] = useState(false);

  // ─── step labels / progress ───────────────────────────────────────────────
  const stepLabel = {
    1: "Choose Your Size",
    2: "Delivery Date",
    3: "Your Details",
    4: "Review & Reserve",
  }[step] || "";

  const visibleTotalSteps = 4;
  const currentVisualStep = step;
  const progressPercent = (currentVisualStep / visibleTotalSteps) * 100;

  // ─── exit modal logic ─────────────────────────────────────────────────────
  const shouldShowExitModal = useCallback(
    () =>
      stepRef.current >= 2 && !exitTriggered && !exitSubmitted && !submitted,
    [exitTriggered, exitSubmitted, submitted],
  );
  const triggerExitModal = useCallback(() => {
    if (!shouldShowExitModal()) return;
    setExitTriggered(true);
    setShowExitModal(true);
  }, [shouldShowExitModal]);
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (stepRef.current >= 2)
      idleTimerRef.current = setTimeout(() => {
        triggerExitModal();
      }, IDLE_TIMEOUT_MS);
  }, [triggerExitModal]);

  useEffect(() => {
    const events = [
      "touchstart",
      "touchmove",
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
    ];
    events.forEach((e) =>
      window.addEventListener(e, resetIdleTimer, { passive: true }),
    );
    resetIdleTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  useEffect(() => {
    if (step >= 2 && !historyPushedRef.current) {
      window.history.pushState({ funnelStep: step }, "");
      historyPushedRef.current = true;
    }
    const handlePopState = () => {
      if (stepRef.current >= 2) {
        window.history.pushState({ funnelStep: stepRef.current }, "");
        triggerExitModal();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [step, triggerExitModal]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && !checkoutStartedRef.current)
        triggerExitModal();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [triggerExitModal]);

  // ─── handlers ─────────────────────────────────────────────────────────────
  const handleExitModalDismiss = () => {
    setShowExitModal(false);
    setExitError("");
    resetIdleTimer();
  };

  const handleExitSubmit = async ({
    name,
    phone,
    smsOptIn: optIn,
    smsOptInDate,
  }) => {
    if (!phone) return;
    setExitSubmitting(true);
    setExitError("");
    const payload = {
      zip,
      areaLabel,
      zone: zoneKey,
      deliveryFee: zoneFee,
      customerType,
      selectedSize: effectiveSize || null,
      rentalPrice: selectedPrice || null,
      selectedWindow: selectedWindow || null,
      funnelSource: "exit_capture",
      leadSourceName: "Website",
      smsOptIn: optIn,
      smsOptInDate,
      contact: {
        name: name || "",
        email: "",
        phone,
        mobile: phone,
        source: "Exit Modal",
      },
    };
    try {
      const res = await fetch("/api/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.success)
        throw new Error(json?.error || "Submission failed.");
      setExitSubmitted(true);
      setShowExitModal(false);
      setTimeout(() => {
        window.location.href = HOMEPAGE;
      }, 1800);
    } catch (err) {
      setExitError("Something went wrong. Call or text us at 470-548-4733.");
    } finally {
      setExitSubmitting(false);
    }
  };

  const handleClose = () => {
    if (step >= 2) {
      if (!exitSubmitted && !submitted) setShowExitModal(true);
      else window.location.href = HOMEPAGE;
    } else window.location.href = HOMEPAGE;
  };

  // Select a dumpster from product cards and fetch availability
  const handleProductSelect = (selectedSizeKey) => {
    setSize(selectedSizeKey);
    setOverrideSize("");
    setDuration("");
    setSelectedPrice(null);
    setAvailabilityData(null);
    setAvailabilityError("");
    setAvailabilityLoading(true);
    setSelectedWindow(null);
    setShowMoreDates({});
    setStep(2);
    fetch(AVAILABILITY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size: selectedSizeKey }),
    })
      .then((r) => r.json())
      .then((json) => {
        setAvailabilityData(json);
      })
      .catch(() => {
        setAvailabilityError(
          "We're having trouble checking live availability. Please call or text us at 470-548-4733 and we'll confirm the soonest delivery option.",
        );
      })
      .finally(() => setAvailabilityLoading(false));
  };

  // Help Me Choose: project selected → set recommendation → go to product cards with pre-selection
  const handleHelpMeProject = (sel) => {
    if (
      (customerType === "Contractor" ||
        customerType === "Contractor / Roofer") &&
      sel === "Concrete"
    ) {
      setShowConcreteNotice(true);
      return;
    }
    setProject(sel);
    const reco = getRecommendation(customerType, sel, otherText);
    setSize(reco.size);
    setOverrideSize("");
    setShowHelpMe(false);
    setShowConcreteNotice(false);
  };

  const handleHelpMeOtherContinue = () => {
    const reco = getRecommendation(customerType, "Other", otherText);
    setSize(reco.size);
    setOverrideSize("");
    setShowHelpMe(false);
  };

  // Window selected on date picker → advance to step 3
  const handleWindowSelect = (option, windowObj) => {
    setDuration(option.key);
    setSelectedPrice(calculatedPrices[option.key] ?? null);
    setSelectedWindow(windowObj);
    setStep(3);
  };

  const handleFallbackOptionSelect = (option) => {
    setDuration(option.key);
    setSelectedPrice(calculatedPrices[option.key] ?? null);
    setSelectedWindow(null);
    setStep(3);
  };

  // ZIP blur in step 3 → resolve zone silently
  const handleZipBlur = () => {
    const clean = form.zip.trim();
    if (!clean || !/^\d{5}$/.test(clean)) return;
    if (!pricingConfig) return;
    const resolved = resolveServiceArea(pricingConfig, clean);
    if (!resolved.serviceable) {
      setZipError(
        "We may not service that ZIP code. Please call or text 470-548-4733 to confirm coverage.",
      );
      setZoneUpdateMessage("");
      return;
    }
    setZipError("");
    applyResolvedServiceArea(clean, resolved);
    if (Number(resolved.deliveryFee || 0) > 0) {
      const newTotal =
        (selectedPrice !== null
          ? selectedPrice - zoneFee + Number(resolved.deliveryFee)
          : null);
      setZoneUpdateMessage(
        newTotal !== null
          ? `${resolved.zoneLabel} delivery area · +$${resolved.deliveryFee} — Updated total: $${newTotal}`
          : `${resolved.zoneLabel} delivery area · +$${resolved.deliveryFee}`,
      );
    } else {
      setZoneUpdateMessage("");
    }
  };

  // Partial lead capture on phone blur
  const handlePhoneBlur = async () => {
    if (capturedLeadId && capturedSupabaseLeadId) return;
    const cleanPhone = form.phone.trim();
    if (cleanPhone.length < 10) return;
    const payload = {
      supabaseLeadId: capturedSupabaseLeadId || undefined,
      leadId: capturedLeadId || undefined,
      zip,
      areaLabel,
      zone: zoneKey,
      deliveryFee: zoneFee,
      customerType,
      returningPath,
      project: normalizeProjectForOdoo(project),
      otherText: project === "Other" ? otherText.trim() : "",
      recommendedSize: size,
      selectedSize: effectiveSize,
      includedTons: sizeMeta[effectiveSize]?.tons || null,
      rentalOption: normalizeRentalOption(duration, rentalOptions),
      rentalPrice: selectedPrice,
      selectedWindow,
      funnelSource: "rent_a_dumpster_funnel_partial",
      leadSourceName: "Website",
      contact: {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: cleanPhone,
        mobile: cleanPhone,
      },
    };
    try {
      const res = await fetch("/api/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json?.success) {
        if (json?.supabaseLeadId)
          setCapturedSupabaseLeadId(json.supabaseLeadId);
        if (json?.leadId) setCapturedLeadId(json.leadId);
      }
    } catch (err) {
      console.error("[handlePhoneBlur] lead capture failed:", err.message);
    }
  };

  // Step 3 → step 4: validate required fields
  const handleContinueToReview = () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      setSubmitError("Please enter your name, email, and phone number.");
      return;
    }
    if (!form.street.trim()) {
      setSubmitError(
        "Please enter your service address so we know where to deliver.",
      );
      return;
    }
    setSubmitError("");
    // If ZIP hasn't been resolved yet, attempt resolution now
    if (!serviceArea && form.zip && pricingConfig) {
      const resolved = resolveServiceArea(pricingConfig, form.zip.trim());
      if (resolved.serviceable) {
        applyResolvedServiceArea(form.zip.trim(), resolved);
      }
    }
    setStep(4);
  };

  // ── Phase A CTA: "Continue to Secure Checkout →" ───────────────────────────
  // Validates Turnstile, submits lead, creates booking hold, creates PaymentIntent,
  // then advances to Phase B to render the embedded Payment Element.
  const handleContinueToPayment = async () => {
    if (!selectedWindow?.startIso || !selectedWindow?.endIso) {
      setSubmitError("Please choose a delivery date before checkout.");
      return;
    }

    // ── Tier / delivery-day eligibility (client layer) ───────────────────────
    const selectedTier = rentalOptions.find((o) => o.key === duration);
    if (selectedTier?.validDays) {
      const deliveryDate = new Date(selectedWindow.startIso);
      const deliveryDayOfWeek = deliveryDate.getDay();
      if (!selectedTier.validDays.includes(deliveryDayOfWeek)) {
        const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
        const eligible = selectedTier.validDays.map((d) => dayNames[d]).join(" or ");
        setSubmitError(
          `The "${selectedTier.label}" pricing is only available for ${eligible} delivery. Please go back and select a different date or rental option.`
        );
        return;
      }
    }

    const token =
      window.turnstile && turnstileWidgetIdRef.current
        ? window.turnstile.getResponse(turnstileWidgetIdRef.current)
        : "";
    if (!token) {
      setSubmitError("Please complete the security check.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const deliveryAddressString = [
      form.street.trim(),
      form.street2.trim(),
      form.city.trim(),
      form.state,
      form.zip,
    ]
      .filter(Boolean)
      .join(", ");

    const leadPayload = {
      supabaseLeadId: capturedSupabaseLeadId,
      leadId: capturedLeadId,
      zip,
      areaLabel,
      zone: zoneKey,
      deliveryFee: zoneFee,
      customerType,
      returningPath,
      project: normalizeProjectForOdoo(project),
      otherText: project === "Other" ? otherText.trim() : "",
      recommendedSize: size,
      selectedSize: effectiveSize,
      includedTons: sizeMeta[effectiveSize]?.tons || null,
      rentalOption: normalizeRentalOption(duration, rentalOptions),
      rentalPrice: selectedPrice,
      selectedWindow,
      pricingShown: calculatedPrices,
      funnelSource: "rent_a_dumpster_funnel",
      leadSourceName: "Website",
      smsOptIn,
      smsOptInDate: smsOptIn ? new Date().toISOString() : null,
      turnstileToken: token,
      contact: {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        mobile: form.phone.trim(),
      },
      deliveryAddress: {
        street: form.street.trim(),
        street2: form.street2.trim(),
        city: form.city.trim(),
        state: form.state,
        zip: form.zip,
      },
    };

    try {
      // Step 1 — Submit lead to Supabase
      const resLead = await fetch("/api/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leadPayload),
      });
      const leadJson = await resLead.json();
      if (!resLead.ok || !leadJson?.success)
        throw new Error(leadJson?.error || "Lead submission failed.");

      const finalLeadId = leadJson.leadId || capturedLeadId;
      const finalSupabaseLeadId = leadJson.supabaseLeadId || capturedSupabaseLeadId;

      // Step 2 — Create booking hold
      const holdPayload = {
        ...leadPayload,
        leadId: finalLeadId,
        supabaseLeadId: finalSupabaseLeadId,
        customerName: form.name.trim(),
        customerEmail: form.email.trim(),
        sizeCode: sizeMeta[effectiveSize]?.sizeCode || sizeCodeFromLabel(effectiveSize),
        requestedStartAt: selectedWindow.startIso,
        requestedEndAt: selectedWindow.endIso,
      };
      const resHold = await fetch("/api/create-booking-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(holdPayload),
      });
      const holdJson = await resHold.json();
      if (!resHold.ok || !holdJson?.success || !holdJson?.hold?.id)
        throw new Error(holdJson?.error || "Unable to create booking hold.");

      // Step 3 — Create PaymentIntent (embedded Payment Element flow)
      const piPayload = {
        bookingHoldId: holdJson.hold.id,
        supabaseLeadId: finalSupabaseLeadId,
        leadId: finalLeadId,
        customerEmail: form.email.trim(),
        customerName: form.name.trim(),
        customerPhone: form.phone.trim(),
        dumpsterSize: effectiveSize,
        tierKey: duration,
        basePrice: selectedPrice - zoneFee,
        deliveryFee: zoneFee,
        zone: zoneKey,
        zip,
        deliveryDate: selectedWindow.start,
        deliveryAddress: deliveryAddressString,
        deliveryNotes: form.deliveryNotes.trim(),
        selectedWindow,
        requestedStartAt: selectedWindow.startIso,
        requestedEndAt: selectedWindow.endIso,
      };
      const resPI = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(piPayload),
      });
      const piJson = await resPI.json();
      if (!resPI.ok || !piJson?.clientSecret)
        throw new Error(piJson?.error || "We were unable to prepare your payment. Please call or text 470-548-4733.");

      // Advance to Phase B — Payment Element renders with the clientSecret
      checkoutStartedRef.current = true;
      setClientSecret(piJson.clientSecret);
      setStep4Phase("payment");
      setSubmitting(false);
    } catch (err) {
      setSubmitError(
        err.message ||
          "We were unable to prepare your payment. Please call or text 470-548-4733.",
      );
      setSubmitting(false);
    }
  };

  // handleSubmit is the no-longer-used legacy name. Kept as a no-op so any
  // accidental reference doesn't crash. Real Phase A CTA calls handleContinueToPayment.
  const handleSubmit = handleContinueToPayment;

  const goBack = () => {
    if (step === 4) {
      // If in Phase B, go back to Phase A (re-show review) rather than Step 3
      if (step4Phase === "payment") {
        setStep4Phase("review");
        setClientSecret(null);
        setPaymentElementReady(false);
        setPaymentError("");
        return;
      }
      turnstileRenderedRef.current = false;
      setStep4Phase("review");
      setClientSecret(null);
      return setStep(3);
    }
    if (step === 3) return setStep(2);
    if (step === 2) return setStep(1);
  };

  // ─── styles ───────────────────────────────────────────────────────────────
  const inputStyle = {
    display: "block",
    width: "100%",
    padding: "12px 14px",
    border: `1.5px solid ${C.surfaceBorder}`,
    borderRadius: 10,
    background: C.white,
    fontSize: 14,
    color: C.ink,
    boxSizing: "border-box",
    fontFamily: F,
  };
  const labelStyle = {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    color: C.inkFaint,
    letterSpacing: "0.8px",
    textTransform: "uppercase",
    marginBottom: 5,
    marginTop: 14,
    fontFamily: F,
  };
  const firstLabelStyle = { ...labelStyle, marginTop: 0 };

  // ─── nickname map ─────────────────────────────────────────────────────────
  const SIZE_NICKNAMES = {
    "11 Yard": "The Little Junker",
    "16 Yard": "The Mighty Middler",
    "21 Yard": "The Big Junker",
  };

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <>
      {/* Sprint 4: brand fonts — Poppins (headings) + Questrial (body) */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Poppins:wght@700;800;900&family=Questrial&display=swap"
        rel="stylesheet"
      />
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div
        style={{
          minHeight: "100vh",
          background: C.pageBg,
          padding: "20px 16px 40px",
          fontFamily: F,
        }}
      >
        {exitSubmitted && (
          <div
            style={{
              position: "fixed",
              top: 20,
              left: "50%",
              transform: "translateX(-50%)",
              background: C.ink,
              color: C.white,
              padding: "12px 24px",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 700,
              zIndex: 1100,
              fontFamily: F,
              boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
            }}
          >
            ✓ We'll text you shortly!
          </div>
        )}
        {showExitModal && (
          <ExitModal
            onSubmit={handleExitSubmit}
            onDismiss={handleExitModalDismiss}
            submitting={exitSubmitting}
            error={exitError}
            capturedSize={effectiveSize || null}
            capturedPrice={selectedPrice || null}
          />
        )}

        <div style={{ maxWidth: 800, margin: "0 auto" }}>
          {/* ── header ── */}
          <header
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 0 14px",
              marginBottom: 16,
              borderBottom: `1px solid ${C.cardBorder}`,
            }}
          >
            <img
              src="/little-junkers-logo.png"
              alt="Little Junkers"
              style={{ maxWidth: 130, height: "auto", display: "block" }}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: C.inkFaint,
                    letterSpacing: "0.8px",
                    textTransform: "uppercase",
                  }}
                >
                  Peachtree City, GA
                </div>
                <a
                  href="tel:4705484733"
                  style={{
                    fontSize: 16,
                    fontWeight: 900,
                    color: C.ink,
                    textDecoration: "none",
                    fontFamily: F,
                  }}
                >
                  470-548-4733
                </a>
              </div>
              <button
                onClick={handleClose}
                aria-label="Close"
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: C.surfaceBg,
                  border: `1.5px solid ${C.surfaceBorder}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  flexShrink: 0,
                  fontSize: 18,
                  color: C.ink,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>
          </header>

          {/* ── main card ── */}
          <main
            style={{
              background: C.cardBg,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 16,
              overflow: "hidden",
              boxShadow:
                "0 1px 3px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.05)",
            }}
          >
            <ProgressChrome
              currentVisualStep={currentVisualStep}
              visibleTotalSteps={visibleTotalSteps}
              stepLabel={stepLabel}
              progressPercent={progressPercent}
              onBack={goBack}
              showBack={step > 1}
            />

            <CardBody>
              {/* ══════════════════════════════════════════════════════════════
                  STEP 1 — Product Selection
              ══════════════════════════════════════════════════════════════ */}
              {step === 1 && (
                <div>
                  <StepHeading
                    eyebrow="Dumpster Rental · South Atlanta"
                    title="Pick your perfect pink bin"
                    text="Upfront pricing. Driveway-safe trucks. No hidden fees."
                  />

                  {/* Pricing loading state */}
                  {pricingLoading && (
                    <div
                      style={{
                        padding: "20px 0",
                        textAlign: "center",
                        fontSize: 13,
                        color: C.inkFaint,
                        fontFamily: F,
                      }}
                    >
                      Loading pricing…
                    </div>
                  )}

                  {pricingError && (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: "12px 14px",
                        background: C.warningBg,
                        border: `1px solid ${C.warningBorder}`,
                        borderRadius: 10,
                        fontSize: 13,
                        color: C.ink,
                        fontFamily: F,
                      }}
                    >
                      {pricingError} Please call or text{" "}
                      <a href="tel:4705484733" style={{ color: C.ink }}>
                        470-548-4733
                      </a>
                      .
                    </div>
                  )}

                  {/* Product cards */}
                  {!pricingLoading && !pricingError && (
                    <div style={{ display: "grid", gap: 14 }}>
                      {allSizes.map((sizeKey) => {
                        const meta = sizeMeta[sizeKey];
                        const hints = {
                          truckLoads: meta?.truckLoads,
                          bestUse: meta?.bestUse,
                        };
                        const startingPrice = startingPrices[sizeKey];
                        const nickname = SIZE_NICKNAMES[sizeKey] || sizeKey;
                        const isRecommended =
                          size === sizeKey && showHelpMe === false && size;
                        return (
                          <div
                            key={sizeKey}
                            style={{
                              border: isRecommended
                                ? `2px solid ${C.pinkText}`
                                : `1.5px solid ${C.surfaceBorder}`,
                              borderRadius: 14,
                              background: isRecommended
                                ? C.pinkBg
                                : C.surfaceBg,
                              overflow: "hidden",
                            }}
                          >
                            <div style={{ padding: "18px 20px 14px" }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "flex-start",
                                  marginBottom: 6,
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontSize: 20,
                                      fontWeight: 900,
                                      color: C.ink,
                                      letterSpacing: "-0.5px",
                                      lineHeight: 1.1,
                                    }}
                                  >
                                    {sizeKey}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: C.pinkText,
                                      fontWeight: 700,
                                      marginTop: 2,
                                    }}
                                  >
                                    {nickname}
                                  </div>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <TonnagePill label={meta?.label || ""} />
                                  {startingPrice ? (
                                    <div
                                      style={{
                                        fontSize: 13,
                                        fontWeight: 700,
                                        color: C.ink,
                                        marginTop: 6,
                                      }}
                                    >
                                      Starting at ${startingPrice}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              <ul
                                style={{
                                  margin: "8px 0 12px",
                                  paddingLeft: 18,
                                  lineHeight: 1.75,
                                  color: C.inkMid,
                                  fontSize: 13,
                                }}
                              >
                                {hints.truckLoads && (
                                  <li>{hints.truckLoads}</li>
                                )}
                                {hints.bestUse && <li>{hints.bestUse}</li>}
                              </ul>
                              {isRecommended && (
                                <div
                                  style={{
                                    marginBottom: 10,
                                    fontSize: 12,
                                    color: C.pinkText,
                                    fontWeight: 700,
                                  }}
                                >
                                  ✓ Recommended for your project
                                </div>
                              )}
                            </div>
                            <div
                              style={{
                                padding: "0 20px 18px",
                              }}
                            >
                              <button
                                onClick={() => handleProductSelect(sizeKey)}
                                style={{
                                  display: "block",
                                  width: "100%",
                                  padding: "13px",
                                  background: C.ink,
                                  color: C.white,
                                  border: "none",
                                  borderRadius: 10,
                                  fontSize: 14,
                                  fontWeight: 800,
                                  cursor: "pointer",
                                  fontFamily: F,
                                  letterSpacing: "0.1px",
                                }}
                              >
                                Reserve This Dumpster →
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Help Me Choose secondary link */}
                  {!pricingLoading && !pricingError && (
                    <div style={{ marginTop: 20 }}>
                      <button
                        onClick={() => setShowHelpMe((v) => !v)}
                        style={{
                          display: "block",
                          width: "100%",
                          background: "none",
                          border: `1px solid ${C.surfaceBorder}`,
                          borderRadius: 10,
                          padding: "11px 16px",
                          cursor: "pointer",
                          fontSize: 13,
                          fontWeight: 700,
                          color: C.inkMid,
                          fontFamily: F,
                          textAlign: "center",
                        }}
                      >
                        {showHelpMe
                          ? "Hide recommendations ▲"
                          : "Not sure which size? Get a recommendation →"}
                      </button>

                      {showHelpMe && (
                        <div
                          style={{
                            marginTop: 12,
                            border: `1px solid ${C.surfaceBorder}`,
                            borderRadius: 12,
                            padding: "18px 16px",
                            background: C.white,
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: C.ink,
                              marginBottom: 12,
                              fontFamily: F,
                            }}
                          >
                            What type of project is this?
                          </div>

                          {/* Customer type selection */}
                          <div
                            style={{
                              display: "grid",
                              gap: 8,
                              marginBottom: 14,
                            }}
                          >
                            {[
                              {
                                key: "New Customer",
                                label: "Homeowner / DIY",
                                sub: "Cleanout, moving, renovation",
                              },
                              {
                                key: "Contractor / Roofer",
                                label: "Contractor / Roofer",
                                sub: "Jobsite or repeat commercial use",
                              },
                            ].map((ct) => (
                              <OptionCard
                                key={ct.key}
                                title={ct.label}
                                sub={ct.sub}
                                selected={customerType === ct.key}
                                onClick={() => {
                                  setCustomerType(ct.key);
                                  setReturningPath("recommend");
                                  setProject("");
                                  setOtherText("");
                                  setShowConcreteNotice(false);
                                }}
                              />
                            ))}
                          </div>

                          {/* Project type selection */}
                          {customerType && (
                            <div>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: C.inkMuted,
                                  marginBottom: 8,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.5px",
                                  fontFamily: F,
                                }}
                              >
                                What kind of cleanup?
                              </div>
                              <div style={{ display: "grid", gap: 8 }}>
                                {(customerType === "Contractor / Roofer"
                                  ? [
                                      "General Cleanup",
                                      "Renovation / demo",
                                      "Roofing",
                                      "Concrete",
                                      "Other",
                                    ]
                                  : [
                                      "Cleaning the garage / basement",
                                      "Moving / decluttering",
                                      "Renovation / demo",
                                      "Other",
                                    ]
                                ).map((type) => (
                                  <OptionCard
                                    key={type}
                                    title={type}
                                    selected={project === type}
                                    onClick={() =>
                                      type === "Other"
                                        ? setProject("Other")
                                        : handleHelpMeProject(type)
                                    }
                                  />
                                ))}
                              </div>

                              {project === "Other" && (
                                <div style={{ marginTop: 12 }}>
                                  <textarea
                                    value={otherText}
                                    onChange={(e) =>
                                      setOtherText(e.target.value)
                                    }
                                    placeholder="Describe your project..."
                                    style={{
                                      ...inputStyle,
                                      minHeight: 80,
                                      resize: "vertical",
                                    }}
                                  />
                                  <PrimaryButton
                                    onClick={handleHelpMeOtherContinue}
                                  >
                                    Get Recommendation
                                  </PrimaryButton>
                                </div>
                              )}

                              {showConcreteNotice && (
                                <div
                                  style={{
                                    marginTop: 12,
                                    background: C.warningBg,
                                    border: `1px solid ${C.warningBorder}`,
                                    borderRadius: 12,
                                    padding: 16,
                                    fontFamily: F,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 800,
                                      color: C.ink,
                                      marginBottom: 6,
                                    }}
                                  >
                                    Concrete isn't something we haul right now
                                  </div>
                                  <p
                                    style={{
                                      margin: 0,
                                      color: C.inkMid,
                                      lineHeight: 1.5,
                                      fontSize: 14,
                                    }}
                                  >
                                    We can still help with general cleanup,
                                    renovation debris, and roofing.
                                  </p>
                                  <button
                                    onClick={() =>
                                      setShowConcreteNotice(false)
                                    }
                                    style={{
                                      marginTop: 12,
                                      padding: "9px 16px",
                                      background: C.ink,
                                      color: C.white,
                                      border: "none",
                                      borderRadius: 10,
                                      cursor: "pointer",
                                      fontWeight: 700,
                                      fontFamily: F,
                                      fontSize: 13,
                                    }}
                                  >
                                    Got it
                                  </button>
                                </div>
                              )}

                              {/* Show recommendation result */}
                              {project &&
                                project !== "Other" &&
                                !showConcreteNotice && (
                                  <div
                                    style={{
                                      marginTop: 14,
                                      padding: "14px 16px",
                                      background: C.pinkBg,
                                      border: `1px solid ${C.pinkBorder}`,
                                      borderRadius: 12,
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: 13,
                                        fontWeight: 800,
                                        color: C.pinkText,
                                        marginBottom: 4,
                                      }}
                                    >
                                      We recommend: {recommendation.size}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        color: C.inkMid,
                                        lineHeight: 1.5,
                                        marginBottom: 10,
                                      }}
                                    >
                                      {recommendation.reason}
                                    </div>
                                    <button
                                      onClick={() =>
                                        handleProductSelect(recommendation.size)
                                      }
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        padding: "12px",
                                        background: C.ink,
                                        color: C.white,
                                        border: "none",
                                        borderRadius: 10,
                                        fontSize: 13,
                                        fontWeight: 800,
                                        cursor: "pointer",
                                        fontFamily: F,
                                      }}
                                    >
                                      Reserve the {recommendation.size} →
                                    </button>
                                  </div>
                                )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════
                  STEP 2 — Delivery Date
              ══════════════════════════════════════════════════════════════ */}
              {step === 2 && (
                <div>
                  <Step5DatePicker
                    effectiveSize={effectiveSize}
                    availabilityLoading={availabilityLoading}
                    isAvailabilityDegraded={isAvailabilityDegraded}
                    availableOptions={availableOptions}
                    calculatedPrices={calculatedPrices}
                    selectedWindow={selectedWindow}
                    duration={duration}
                    showMoreDates={showMoreDates}
                    setShowMoreDates={setShowMoreDates}
                    handleWindowSelect={handleWindowSelect}
                    handleFallbackOptionSelect={handleFallbackOptionSelect}
                    sizeMeta={sizeMeta}
                    rentalOptions={rentalOptions}
                    blockedDates={availabilityData?.blockedDates || []}
                    recommendedTierKey={recommendedTierKey}
                    economyTierKeys={economyTierKeys}
                    showEconomyTiers={showEconomyTiers}
                    setShowEconomyTiers={setShowEconomyTiers}
                  />
                  <div
                    style={{
                      marginTop: 14,
                      padding: "10px 14px",
                      background: C.surfaceBg,
                      border: `1px solid ${C.surfaceBorder}`,
                      borderRadius: 10,
                      fontSize: 12,
                      color: C.inkMuted,
                      fontFamily: F,
                      textAlign: "center",
                    }}
                  >
                    Prices shown are base rental only. Delivery fee, if any,
                    will be confirmed at the next step based on your address.
                  </div>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════
                  STEP 3 — Address + Contact + ZIP Resolution
              ══════════════════════════════════════════════════════════════ */}
              {step === 3 && (
                <div>
                  <StepHeading
                    eyebrow="Step 3 of 4"
                    title="Where are we delivering?"
                    text="Enter your address and contact details."
                  />

                  {/* Rental summary bar */}
                  <div
                    style={{
                      marginBottom: 18,
                      border: `1px solid ${C.surfaceBorder}`,
                      borderRadius: 14,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        background: C.surfaceBg,
                        padding: "9px 16px",
                        fontSize: 10,
                        fontWeight: 800,
                        color: C.inkFaint,
                        borderBottom: `1px solid ${C.surfaceBorder}`,
                      }}
                    >
                      Rental Summary
                    </div>
                    {[
                      { label: "Dumpster", value: effectiveSize },
                      {
                        label: "Rental",
                        value: getRentalDisplayLabel(duration, rentalOptions),
                      },
                      {
                        label: "Delivery date",
                        value: selectedWindow
                          ? `${selectedWindow.startLabel}`
                          : "Subject to confirmation",
                      },
                    ].map((row) => (
                      <div
                        key={row.label}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          padding: "10px 16px",
                          borderBottom: `1px solid ${C.surfaceBorder}`,
                        }}
                      >
                        <span style={{ fontSize: 13, color: C.inkMuted }}>
                          {row.label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 700 }}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "12px 16px",
                        background: C.surfaceBg,
                      }}
                    >
                      <span style={{ fontSize: 13, color: C.inkMuted }}>
                        Base price
                      </span>
                      <span style={{ fontSize: 18, fontWeight: 900 }}>
                        ${selectedPrice !== null ? selectedPrice - zoneFee : "—"}
                      </span>
                    </div>
                  </div>

                  <div
                    style={{
                      background: C.surfaceBg,
                      border: `1px solid ${C.surfaceBorder}`,
                      borderRadius: 14,
                      padding: "18px",
                    }}
                  >
                    {/* Contact Information group */}
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.inkFaint, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12, fontFamily: F }}>
                      Contact Information
                    </div>
                    <label style={firstLabelStyle}>Name *</label>
                    <input
                      placeholder="Your name"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      style={inputStyle}
                    />
                    <label style={labelStyle}>Email *</label>
                    <input
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={(e) =>
                        setForm({ ...form, email: e.target.value })
                      }
                      style={inputStyle}
                    />
                    <label style={labelStyle}>Phone *</label>
                    <input
                      placeholder="Phone number"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                      onBlur={handlePhoneBlur}
                      type="tel"
                      style={inputStyle}
                    />
                    {/* Delivery Address group */}
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.inkFaint, letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: 12, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${C.surfaceBorder}`, fontFamily: F }}>
                      Delivery Address
                    </div>
                    <label style={firstLabelStyle}>Street address *</label>
                    <input
                      placeholder="Street address"
                      value={form.street}
                      onChange={(e) =>
                        setForm({ ...form, street: e.target.value })
                      }
                      style={inputStyle}
                    />
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.4fr 0.8fr 0.8fr",
                        gap: 10,
                        marginTop: 14,
                      }}
                    >
                      <input
                        placeholder="City"
                        value={form.city}
                        onChange={(e) =>
                          setForm({ ...form, city: e.target.value })
                        }
                        style={inputStyle}
                      />
                      <select
                        value={form.state}
                        onChange={(e) =>
                          setForm({ ...form, state: e.target.value })
                        }
                        style={inputStyle}
                      >
                        <option value="GA">GA</option>
                      </select>
                      <input
                        placeholder="ZIP"
                        value={form.zip}
                        onChange={(e) =>
                          setForm({ ...form, zip: e.target.value })
                        }
                        onBlur={handleZipBlur}
                        maxLength={5}
                        inputMode="numeric"
                        style={inputStyle}
                      />
                    </div>

                    {/* ZIP error / zone fee update */}
                    {zipError && (
                      <div
                        style={{
                          marginTop: 8,
                          fontSize: 13,
                          color: "#b45309",
                          fontFamily: F,
                        }}
                      >
                        {zipError}
                      </div>
                    )}
                    {zoneUpdateMessage && !zipError && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "10px 12px",
                          background: C.pinkBg,
                          border: `1px solid ${C.pinkBorder}`,
                          borderRadius: 8,
                          fontSize: 13,
                          color: C.pinkText,
                          fontWeight: 700,
                          fontFamily: F,
                        }}
                      >
                        {zoneUpdateMessage}
                      </div>
                    )}

                    <label style={{ ...labelStyle, marginTop: 18 }}>
                      Delivery notes (optional)
                    </label>
                    <textarea
                      placeholder="e.g. Place on driveway near garage. Wood planks needed. Gate code: 1234."
                      value={form.deliveryNotes}
                      onChange={(e) =>
                        setForm({ ...form, deliveryNotes: e.target.value })
                      }
                      style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
                    />

                    {/* SMS opt-in */}
                    {form.phone.trim().length > 0 && (
                      <label
                        style={{
                          display: "flex",
                          gap: 10,
                          alignItems: "flex-start",
                          fontFamily: F,
                          marginTop: 14,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={smsOptIn}
                          onChange={(e) => setSmsOptIn(e.target.checked)}
                          style={{ marginTop: 3, flexShrink: 0 }}
                        />
                        <span
                          style={{
                            fontSize: 13,
                            color: C.inkMid,
                            lineHeight: 1.45,
                          }}
                        >
                          I agree to receive text messages from Little Junkers
                          about my booking and rental.
                        </span>
                      </label>
                    )}
                  </div>

                  {submitError && (
                    <div
                      style={{
                        marginTop: 12,
                        background: C.warningBg,
                        border: `1px solid ${C.warningBorder}`,
                        borderRadius: 10,
                        padding: "12px 14px",
                        fontSize: 13,
                        color: C.ink,
                      }}
                    >
                      {submitError}
                    </div>
                  )}

                  <PrimaryButton onClick={handleContinueToReview}>
                    Review My Reservation →
                  </PrimaryButton>
                </div>
              )}

              {/* ══════════════════════════════════════════════════════════════
                  STEP 4 — Two-phase: Review (Phase A) → Payment Element (Phase B)
              ══════════════════════════════════════════════════════════════ */}
              {step === 4 && !submitted && (
                <div>
                  {/* ── PHASE A: Reservation review ───────────────────────── */}
                  {step4Phase === "review" && (
                    <>
                      <StepHeading
                        eyebrow="Almost done"
                        title="Review your reservation"
                        text="Confirm the details below, then proceed to secure checkout."
                      />

                      {/* Full reservation summary */}
                      <div
                        style={{
                          marginBottom: 18,
                          border: `1px solid ${C.surfaceBorder}`,
                          borderRadius: 14,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            background: C.surfaceBg,
                            padding: "9px 16px",
                            fontSize: 10,
                            fontWeight: 800,
                            color: C.inkFaint,
                            borderBottom: `1px solid ${C.surfaceBorder}`,
                          }}
                        >
                          Reservation Summary
                        </div>
                        {[
                          {
                            label: "Dumpster",
                            value: `${effectiveSize} — ${SIZE_NICKNAMES[effectiveSize] || ""}`,
                          },
                          {
                            label: "Rental",
                            value: getRentalDisplayLabel(duration, rentalOptions),
                          },
                          {
                            label: "Delivery date",
                            value: selectedWindow
                              ? selectedWindow.startLabel
                              : "Subject to confirmation",
                          },
                          {
                            label: "Pickup",
                            value: selectedWindow
                              ? selectedWindow.endLabel
                              : "Per rental duration",
                          },
                          {
                            label: "Delivery address",
                            value: [form.street, form.city, form.state, form.zip]
                              .filter(Boolean)
                              .join(", "),
                          },
                          ...(form.deliveryNotes.trim()
                            ? [{ label: "Placement notes", value: form.deliveryNotes.trim() }]
                            : []),
                        ].map((row) => (
                          <div
                            key={row.label}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              padding: "10px 16px",
                              borderBottom: `1px solid ${C.surfaceBorder}`,
                              gap: 16,
                            }}
                          >
                            <span style={{ fontSize: 13, color: C.inkMuted, flexShrink: 0 }}>
                              {row.label}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, textAlign: "right" }}>
                              {row.value}
                            </span>
                          </div>
                        ))}

                        {/* Pricing breakdown */}
                        <div
                          style={{
                            padding: "10px 16px",
                            borderBottom: zoneFee > 0 ? `1px solid ${C.surfaceBorder}` : undefined,
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span style={{ fontSize: 13, color: C.inkMuted }}>Base rental</span>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>
                            ${selectedPrice !== null ? selectedPrice - zoneFee : "—"}
                          </span>
                        </div>
                        {zoneFee > 0 && (
                          <div
                            style={{
                              padding: "10px 16px",
                              borderBottom: `1px solid ${C.surfaceBorder}`,
                              display: "flex",
                              justifyContent: "space-between",
                            }}
                          >
                            <span style={{ fontSize: 13, color: C.inkMuted }}>
                              Delivery fee ({areaLabel})
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>+${zoneFee}</span>
                          </div>
                        )}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "12px 16px",
                            background: C.surfaceBg,
                          }}
                        >
                          <span style={{ fontSize: 13, color: C.inkMuted }}>Total</span>
                          <span style={{ fontSize: 22, fontWeight: 900 }}>${selectedPrice}</span>
                        </div>
                      </div>

                      {/* Turnstile — gates entry to Phase B */}
                      <div id="turnstile-widget" style={{ marginTop: 16 }} />

                      {submitError && (
                        <div
                          style={{
                            marginTop: 12,
                            background: C.warningBg,
                            border: `1px solid ${C.warningBorder}`,
                            borderRadius: 10,
                            padding: "12px 14px",
                            fontSize: 13,
                            color: C.ink,
                          }}
                        >
                          {submitError}
                        </div>
                      )}

                      <PrimaryButton onClick={handleContinueToPayment} disabled={submitting}>
                        {submitting ? "Preparing Checkout..." : "Continue to Secure Checkout →"}
                      </PrimaryButton>
                    </>
                  )}

                  {/* ── PHASE B: Embedded Stripe Payment Element ──────────── */}
                  {step4Phase === "payment" && clientSecret && (
                    <Elements
                      stripe={stripePromise}
                      options={{
                        clientSecret,
                        appearance: {
                          theme: "stripe",
                          variables: {
                            colorPrimary: C.pinkText,
                            colorBackground: C.white,
                            colorText: C.ink,
                            colorDanger: "#e53e3e",
                            fontFamily: F,
                            borderRadius: "10px",
                          },
                        },
                      }}
                    >
                      <PaymentPhaseB
                        selectedPrice={selectedPrice}
                        effectiveSize={effectiveSize}
                        duration={duration}
                        rentalOptions={rentalOptions}
                        paymentError={paymentError}
                        setPaymentError={setPaymentError}
                        paymentElementReady={paymentElementReady}
                        setPaymentElementReady={setPaymentElementReady}
                        C={C}
                        F={F}
                      />
                    </Elements>
                  )}
                </div>
              )}
            </CardBody>
            <CardFooter />
          </main>
        </div>
      </div>
    </>
  );
}



