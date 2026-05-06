import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";

const C = {
  pageBg:        "#edeae4",
  cardBg:        "#ffffff",
  cardBorder:    "#e5e0d8",
  heroBg:        "#1e1c19",
  heroAccent:    "#ffcee4",
  surfaceBg:     "#faf8f5",
  surfaceBorder: "#e8e3db",
  ink:           "#1a1a1a",
  inkMid:        "#555555",
  inkMuted:      "#999999",
  inkFaint:      "#b8b0a6",
  pink:          "#ffcee4",
  pinkBar:       "#ffb3d4",
  pinkText:      "#c2587a",
  pinkBg:        "#fff5fb",
  pinkBorder:    "#ffd6eb",
  warningBg:     "#fff8eb",
  warningBorder: "#f2cf7a",
  white:         "#ffffff",
};

const F = "system-ui, -apple-system, sans-serif";
const HOMEPAGE = "https://www.littlejunkersllc.com";
const ECOM_FALLBACK = "https://www.littlejunkersllc.com/shop";
const IDLE_TIMEOUT_MS = 12 * 60 * 1000; // 12 minutes
const AVAILABILITY_ENDPOINT = "/api/availability";
const SIZE_CODE_MAP = {
  "11 Yard": "11YD",
  "16 Yard": "16YD",
  "21 Yard": "21YD",
};

// ─── data ─────────────────────────────────────────────────────────────────────

const zones = {
  A: { fee: 0,  label: "Local Area"    },
  B: { fee: 49, label: "Extended Area" },
  C: { fee: 89, label: "Outer Area"    },
};

const zipToZone = {
  "30213":"A","30214":"A","30215":"A","30263":"A","30265":"A",
  "30268":"A","30269":"A","30276":"A","30291":"A",
  "30106":"B","30126":"B","30134":"B","30135":"B","30168":"B",
  "30223":"B","30224":"B","30228":"B","30236":"B","30238":"B",
  "30248":"B","30252":"B","30253":"B","30260":"B","30274":"B",
  "30281":"B","30273":"B","30296":"B","30297":"B","30310":"B",
  "30311":"B","30314":"B","30315":"B","30331":"B","30336":"B",
  "30337":"B","30344":"B","30349":"B","30354":"B",
  "30002":"C","30004":"C","30005":"C","30009":"C","30017":"C",
  "30019":"C","30021":"C","30022":"C","30028":"C","30030":"C",
  "30032":"C","30033":"C","30034":"C","30035":"C","30038":"C",
  "30039":"C","30040":"C","30041":"C","30043":"C","30044":"C",
  "30045":"C","30046":"C","30047":"C","30052":"C","30058":"C",
  "30071":"C","30072":"C","30075":"C","30076":"C","30078":"C",
  "30092":"C","30093":"C","30094":"C","30096":"C","30097":"C",
  "30101":"C","30102":"C","30107":"C","30114":"C","30115":"C",
  "30116":"C","30117":"C","30120":"C","30121":"C","30127":"C",
  "30132":"C","30137":"C","30141":"C","30142":"C","30143":"C",
  "30144":"C","30152":"C","30157":"C","30517":"C","30518":"C",
  "30519":"C","30303":"C","30305":"C","30308":"C","30309":"C",
  "30312":"C","30313":"C","30316":"C","30317":"C","30318":"C",
  "30319":"C","30324":"C","30327":"C","30328":"C","30338":"C",
  "30339":"C","30340":"C","30341":"C","30342":"C","30346":"C",
  "30350":"C","30360":"C","30363":"C",
};

const zipToArea = {
  "30269":"Peachtree City area","30265":"Newnan area","30263":"Newnan area",
  "30214":"Fayetteville area","30215":"Fayetteville area","30213":"Fairburn area",
  "30268":"Palmetto area","30276":"Senoia area","30291":"Union City area",
  "30236":"Jonesboro area","30238":"Jonesboro area","30260":"Morrow area",
  "30274":"Riverdale area","30296":"College Park area","30297":"Hapeville / Forest Park area",
  "30349":"South Fulton / Atlanta area","30344":"East Point area",
  "30337":"College Park area","30331":"Atlanta area",
  "30253":"McDonough area","30252":"McDonough area","30281":"Stockbridge area",
  "30248":"Locust Grove area","30273":"Rex area","30228":"Hampton area",
};

const sizeMeta = {
  "11 Yard": { tons:1,   label:"Includes 1 ton",    bestFor:"Small cleanouts, garage/basement jobs, weight-conscious loads", short:"Best for smaller jobs and heavier debris control", height:"3.5'" },
  "16 Yard": { tons:1.5, label:"Includes 1.5 tons", bestFor:"Moving, decluttering, mixed cleanup, all-around use",           short:"Best all-around option for most mixed projects",    height:"4.5'" },
  "21 Yard": { tons:2,   label:"Includes 2 tons",   bestFor:"Renovation, demo, bulky cleanouts, larger jobs",                short:"Best for bigger projects with more volume",         height:"6'"   },
};

const comparisonMeta = {
  "11 Yard": { truckLoads:"4–5 pickup loads",  projectScale:"Small",  bestUse:"Garage cleanouts, roofing, dense debris" },
  "16 Yard": { truckLoads:"6–7 pickup loads",  projectScale:"Medium", bestUse:"Moving, decluttering, mixed cleanup"      },
  "21 Yard": { truckLoads:"8–10 pickup loads", projectScale:"Large",  bestUse:"Renovation, demo, bulky cleanouts"        },
};

const DUMPSTER_IMAGES = {
  "11 Yard": "/11 -yard image.png",
  "16 Yard": "/16 -yard image.png",
  "21 Yard": "/21 -yard image.png",
};

const basePricing = {
  "11 Yard": { "Early Bird":225, "Weekend Warrior":335, "Base Rental":275, "Full Reset":345 },
  "16 Yard": { "Early Bird":275, "Weekend Warrior":385, "Base Rental":325, "Full Reset":445 },
  "21 Yard": { "Early Bird":385, "Weekend Warrior":445, "Base Rental":385, "Full Reset":495 },
};

const rentalOptions = [
  { key:"Base Rental",     label:"2-Day Rental",  sub:"Next available delivery", tag:"Soonest"    },
  { key:"Early Bird",      label:"2-Day Rental",  sub:"Mon or Tue delivery",     tag:"Weekday Discount" },
  { key:"Weekend Warrior", label:"4-Day Rental",  sub:"Best overall value",      tag:"Recommended" },
  { key:"Full Reset",      label:"7-Day Rental",  sub:"Any weekday delivery",    tag:"Extended"   },
];

const allSizes = ["11 Yard", "16 Yard", "21 Yard"];

// ─── helpers ──────────────────────────────────────────────────────────────────

function getAreaLabel(zip) {
  if (!zip) return "Your area";
  return zipToArea[zip] || `ZIP ${zip} area`;
}

function containsHeavyKeywords(text) {
  return ["demo","renovation","remodel","cabinet","drywall","flooring","tile","brick","block","dirt","gravel","shingles","roof","deck","shed","heavy","weight bench","construction"].some(w => text.includes(w));
}
function containsLightKeywords(text) {
  return ["garage","attic","closet","cardboard","boxes","declutter","moving","household","furniture","basement","junk"].some(w => text.includes(w));
}

function normalizeRentalOption(key) {
  const map = {
    "Base Rental":     "2-Day Rental",
    "Early Bird":      "2-Day Rental",
    "Weekend Warrior": "4-Day Rental",
    "Full Reset":      "7-Day Rental",
  };
  return map[key] || "";
}

function getRentalDisplayLabel(key) {
  const map = {
    "Base Rental":     "2-Day Rental",
    "Early Bird":      "2-Day Rental (Mon/Tue delivery)",
    "Weekend Warrior": "4-Day Rental",
    "Full Reset":      "7-Day Rental",
  };
  return map[key] || key || "-";
}

function normalizeProjectForOdoo(project) {
  const map = {
    "Cleaning the garage / basement": "Cleanout",
    "Moving / decluttering":          "Moving",
    "Renovation / demo":              "Renovation",
    "General Cleanup":                "Cleanout",
    "Roofing":                        "Roofing",
    "Other":                          "Other",
  };
  return map[project] || (project ? "Other" : "");
}

function getRecommendation(customerType, project, otherText = "") {
  const o = String(otherText || "").toLowerCase();
  if (customerType === "Contractor" || customerType === "Contractor / Roofer") {
    if (project === "Roofing")           return { size:"11 Yard", holds:["Approx. 30 squares of single-layer shingles","Approx. 4-5 pickup truck loads of debris","Heavy roofing material with safer weight control"],   reason:"Roofing materials are deceptively heavy. We recommend the 11-Yard to keep the load within a safer lifting range and reduce overweight risk.",      note:"For larger tear-offs, two smaller loads are often better than one overweight container with added overage costs." };
    if (project === "Renovation / demo") return { size:"21 Yard", holds:["Larger renovation and demo loads","Approx. 8-10 pickup truck loads","Bulky debris that builds fast on jobsites"],                             reason:"Contractor demo jobs usually generate more volume and bulk than expected, so the 21-Yard is the better operational starting point.",                 note:"This gives your crew more working room up front and reduces the chance of needing an early swap." };
    if (project === "General Cleanup")  return { size:"16 Yard", holds:["General contractor cleanup and mixed debris","Approx. 6-7 pickup truck loads","Day-to-day jobsite volume without oversizing"],                 reason:"For mixed contractor cleanup, the 16-Yard is the strongest all-around fit because it balances usable capacity and fast turnaround.",                 note:"It handles a broad mix of material without jumping straight to the biggest box." };
    if (project === "Other") {
      if (containsHeavyKeywords(o))     return { size:"21 Yard", holds:["Heavier or bulkier contractor debris","Approx. 8-10 pickup truck loads","Projects likely to expand once work begins"],                         reason:"Based on what you described, this sounds more like a bulk-heavy contractor load that benefits from extra volume.",                                  note:"The 21-Yard gives more room to work and reduces the risk of under-ordering." };
      return                                   { size:"16 Yard", holds:["Mixed contractor debris","Approx. 6-7 pickup truck loads","Flexible jobsite cleanup where scope is still moving"],                             reason:"When contractor debris is mixed or unclear, the 16-Yard is the safest all-around recommendation.",                                                  note:"It gives you flexibility without overshooting the project size too early." };
    }
    return                                     { size:"16 Yard", holds:["General contractor debris","Approx. 6-7 pickup truck loads","A practical everyday jobsite starting point"],                                    reason:"The 16-Yard is the strongest contractor default for mixed cleanup and repeat jobsite use.",                                                          note:"It gives enough room for most common loads while staying efficient to turn." };
  }
  if (project === "Cleaning the garage / basement") return { size:"11 Yard", holds:["Garage and basement cleanouts","Approx. 4-5 pickup truck loads","Smaller household junk and boxed material"],                    reason:"Garage and basement cleanouts are often a strong fit for the 11-Yard when the job is mostly household junk and smaller items.",                       note:"If the project grows into furniture, multiple rooms, or bulkier material, the 16-Yard becomes the safer step up." };
  if (project === "Moving / decluttering")          return { size:"16 Yard", holds:["Moving and decluttering projects","Approx. 6-7 pickup truck loads","A broader mix of furniture, boxes, and overflow"],           reason:"Moving and decluttering projects usually expand once you start pulling things out, so the 16-Yard gives more breathing room.",                        note:"It is the strongest all-around fit for mixed household volume without overcommitting to the largest size." };
  if (project === "Renovation / demo")              return { size:"21 Yard", holds:["Renovation and demo debris","Approx. 8-10 pickup truck loads","Bulky material that builds fast during active work"],              reason:"Renovation and demo projects create more volume and bulk, so the 21-Yard is the safer recommendation for keeping the project moving.",                 note:"It reduces the chance of running out of space mid-project and needing another haul sooner than expected." };
  if (project === "Roofing")                        return { size:"11 Yard", holds:["Smaller roofing tear-offs","Approx. 4-5 pickup truck loads of shingles","Heavy debris with better weight control"],              reason:"Roofing debris gets heavy fast, so starting smaller is the safer move for weight control and pickup safety.",                                         note:"We would rather steer you into a safer fit than a larger box that becomes overweight and costly." };
  if (project === "Other") {
    if (containsHeavyKeywords(o))                   return { size:"21 Yard", holds:["Heavier or bulkier mixed debris","Approx. 8-10 pickup truck loads","Projects that sound more renovation-driven"],                 reason:"What you described sounds heavier, bulkier, or more demo-oriented, so the 21-Yard is the safer recommendation.",                                      note:"That gives you more room if the project expands once you get started." };
    if (containsLightKeywords(o))                   return { size:"11 Yard", holds:["Lighter household cleanup","Approx. 4-5 pickup truck loads","Smaller-volume junk where weight stays manageable"],                 reason:"What you described sounds more like a lighter cleanout, which often fits well in the 11-Yard.",                                                        note:"If the scope grows once you start, the 16-Yard is the next safer step up." };
    return                                                 { size:"16 Yard", holds:["Mixed cleanup jobs","Approx. 6-7 pickup truck loads","Projects where the final debris mix is still unclear"],                      reason:"When a project is mixed or unclear, the 16-Yard is usually the safest recommendation because it gives flexibility without overshooting too much.",       note:"It is the most balanced starting point for uncertain jobs." };
  }
  return { size:"16 Yard", holds:["Mixed cleanup jobs","Approx. 6-7 pickup truck loads","A practical all-around fit for household projects"], reason:"The 16-Yard is a strong all-around default for mixed cleanup and household projects.", note:"It gives more room than the smallest option without going oversized." };
}

// ─── sub-components ───────────────────────────────────────────────────────────

function ProgressChrome({ currentVisualStep, visibleTotalSteps, stepLabel, progressPercent, onBack, showBack }) {
  return (
    <div style={{ borderBottom:`1px solid ${C.surfaceBorder}`, marginBottom:0 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 24px 0", fontFamily:F }}>
        <span style={{ fontSize:11, fontWeight:700, color:C.inkFaint, letterSpacing:"0.3px" }}>
          Step {currentVisualStep} of {visibleTotalSteps}
        </span>
        <span style={{ fontSize:11, fontWeight:700, color:C.ink }}>{stepLabel}</span>
      </div>
      <div style={{ padding:"8px 24px 12px" }}>
        <div style={{ height:3, background:C.surfaceBorder, borderRadius:99, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${progressPercent}%`, background:C.pinkBar, borderRadius:99, transition:"width 300ms ease" }} />
        </div>
      </div>
      {showBack && (
        <div style={{ padding:"0 24px 10px" }}>
          <button onClick={onBack} style={{ background:"none", border:"none", fontSize:13, color:C.inkMuted, cursor:"pointer", padding:0, fontWeight:700, fontFamily:F }}>
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}

function CardBody({ children }) {
  return <div style={{ padding:"22px 24px" }}>{children}</div>;
}

function StepHeading({ eyebrow, title, text }) {
  return (
    <div style={{ marginBottom:20, fontFamily:F }}>
      {eyebrow && (
        <div style={{ fontSize:10, fontWeight:700, color:C.pinkText, letterSpacing:"1.2px", textTransform:"uppercase", marginBottom:5 }}>
          {eyebrow}
        </div>
      )}
      <h2 style={{ margin:"0 0 7px", fontSize:22, fontWeight:900, color:C.ink, letterSpacing:"-0.5px", lineHeight:1.15, fontFamily:F }}>
        {title}
      </h2>
      {text && <p style={{ margin:0, fontSize:14, color:C.inkMid, lineHeight:1.55, fontFamily:F }}>{text}</p>}
    </div>
  );
}

function OptionCard({ title, sub, tag, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width:"100%", textAlign:"left", padding:"16px 18px",
        borderRadius:12, fontFamily:F, cursor:"pointer",
        border: selected ? `1.5px solid ${C.ink}` : `1px solid ${C.surfaceBorder}`,
        background: selected ? C.white : C.surfaceBg,
        boxShadow: selected ? "0 0 0 1px rgba(26,26,26,0.06)" : "none",
        transition:"border-color 150ms, background 150ms",
      }}
    >
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:800, color:C.ink, fontFamily:F }}>{title}</div>
          {sub && <div style={{ marginTop:3, fontSize:13, color:C.inkMuted, lineHeight:1.4, fontFamily:F }}>{sub}</div>}
        </div>
        {tag && (
          <span style={{ background:C.pinkBg, color:C.pinkText, border:`1px solid ${C.pinkBorder}`, fontSize:11, fontWeight:800, padding:"3px 9px", borderRadius:99, whiteSpace:"nowrap", fontFamily:F }}>
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
        display:"block", width:"100%", padding:"15px",
        background: disabled ? C.inkFaint : C.ink, color:C.white, border:"none",
        borderRadius:12, fontSize:15, fontWeight:800,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily:F, letterSpacing:"0.1px",
        marginTop:18,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function TonnagePill({ label }) {
  return (
    <span style={{ display:"inline-block", background:C.pinkBg, border:`1px solid ${C.pinkBorder}`, color:C.pinkText, fontSize:11, fontWeight:800, padding:"4px 10px", borderRadius:99, fontFamily:F }}>
      {label}
    </span>
  );
}

function CardFooter() {
  return (
    <div style={{ borderTop:`1px solid ${C.surfaceBorder}`, padding:"13px 24px", display:"flex", justifyContent:"space-between", alignItems:"center", background:C.surfaceBg }}>
      <span style={{ fontSize:11, fontWeight:700, color:C.inkFaint, fontFamily:F, letterSpacing:"0.3px" }}>Questions? Call or text us anytime.</span>
      <a href="tel:4705484733" style={{ fontSize:14, fontWeight:900, color:C.ink, textDecoration:"none", fontFamily:F, whiteSpace:"nowrap", marginLeft:12 }}>470-548-4733</a>
    </div>
  );
}

// ─── Exit Modal ───────────────────────────────────────────────────────────────

function ExitModal({ onSubmit, onDismiss, submitting, error, capturedSize, capturedPrice }) {
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
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontFamily: F }}>
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => setSmsOptIn(e.target.checked)}
                style={{ marginTop: 3, flexShrink: 0 }}
              />
              <span style={{ fontSize: 13, color: C.inkMid, lineHeight: 1.45 }}>
                I agree to receive text messages from Little Junkers about my quote and rental.
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
// ─── Step 5 Date Picker ───────────────────────────────────────────────────────

function Step5DatePicker({
  effectiveSize, availabilityLoading, isAvailabilityDegraded,
  availableOptions, calculatedPrices, selectedWindow, duration,
  showMoreDates, setShowMoreDates, handleWindowSelect,
  handleFallbackOptionSelect, sizeMeta, rentalOptions, blockedDates,
}) {
  // ── tier definitions ──────────────────────────────────────────────────────
  const TIERS = [
    {
      key:       "Early Bird",
      label:     "Discounted 2-Day",
      sublabel:  "Mon or Tue delivery only",
      tag:       null,
      validDays: [1, 2],
      duration:  2,
    },
    {
      key:       "Base Rental",
      label:     "Standard 2-Day",
      sublabel:  "Any day except Mon/Tue",
      tag:       null,
      validDays: [0, 3, 4, 5, 6],
      duration:  2,
    },
    {
      key:       "Weekend Warrior",
      label:     "4-Day",
      sublabel:  "Any start date",
      tag:       "Most Flexible",
      validDays: null,
      duration:  4,
    },
    {
      key:       "Full Reset",
      label:     "7-Day",
      sublabel:  "Any start date",
      tag:       null,
      validDays: null,
      duration:  7,
    },
  ];

  const today = useMemo(() => {
    const d = new Date(); d.setHours(0,0,0,0); return d;
  }, []);
  const tomorrow = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() + 1); return d;
  }, [today]);
  const windowEnd = useMemo(() => {
    const d = new Date(today); d.setDate(d.getDate() + 90); return d;
  }, [today]);

  const [selectedTierKey, setSelectedTierKey] = useState(duration || null);
  // Open to the month containing the first bookable date (tomorrow), not today,
  // so the calendar never opens showing an entirely greyed-out month.
  const [calendarMonth, setCalendarMonth] = useState(() => ({
    year:  tomorrow.getFullYear(),
    month: tomorrow.getMonth(),
  }));

  const blocked = useMemo(() => {
    if (!blockedDates || !Array.isArray(blockedDates)) return new Set();
    return new Set(blockedDates);
  }, [blockedDates]);

  const toDateStr = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const formatDisplay = (d) => d.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
  const formatShort   = (d) => d.toLocaleDateString("en-US", { month:"short", day:"numeric" });

  const isDateAvailable = (d) => {
    if (d <= today) return false;
    if (d > windowEnd) return false;
    if (isAvailabilityDegraded) return true; // fallback: allow all
    return !blocked.has(toDateStr(d));
  };

  const isDateSelectableForTier = (d, tier) => {
    if (!isDateAvailable(d)) return false;
    if (tier.validDays && !tier.validDays.includes(d.getDay())) return false;
    // check full range doesn't cross a blocked date
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
    const endDate  = addDays(d, tier.duration);
    const windowObj = {
      start:      toDateStr(d),
      end:        toDateStr(endDate),
      startLabel: formatDisplay(d),
      endLabel:   formatDisplay(endDate),
      startIso:   d.toISOString(),
      endIso:     endDate.toISOString(),
    };
    const option = rentalOptions.find(o => o.key === tier.key) || { key: tier.key };
    handleWindowSelect(option, windowObj);
  };

  // ── calendar ──────────────────────────────────────────────────────────────
  const CalendarWidget = ({ tier }) => {
    const { year, month } = calendarMonth;
    const firstDay  = new Date(year, month, 1);
    const lastDay   = new Date(year, month + 1, 0);
    const startPad  = firstDay.getDay();
    const monthLabel = firstDay.toLocaleDateString("en-US", { month:"long", year:"numeric" });
    const dayHeaders = ["Su","Mo","Tu","We","Th","Fr","Sa"];

    const prevMonth = () => setCalendarMonth(prev => {
      let m = prev.month - 1, y = prev.year;
      if (m < 0) { m = 11; y--; }
      return { year:y, month:m };
    });
    const nextMonth = () => setCalendarMonth(prev => {
      let m = prev.month + 1, y = prev.year;
      if (m > 11) { m = 0; y++; }
      return { year:y, month:m };
    });

    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));

    const selectedStart = selectedWindow?.start;

    return (
      <div style={{ background:C.white }}>
        {/* month nav */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:`1px solid ${C.surfaceBorder}` }}>
          <button onClick={prevMonth} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.ink, padding:"0 8px", lineHeight:1 }}>‹</button>
          <span style={{ fontSize:14, fontWeight:800, color:C.ink, fontFamily:F }}>{monthLabel}</span>
          <button onClick={nextMonth} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.ink, padding:"0 8px", lineHeight:1 }}>›</button>
        </div>

        {/* day headers */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"8px 8px 2px" }}>
          {dayHeaders.map(h => (
            <div key={h} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:C.inkFaint, fontFamily:F, paddingBottom:2 }}>{h}</div>
          ))}
        </div>

        {/* date cells */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 8px 10px", gap:2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={`pad-${i}`} />;
            const dateStr    = toDateStr(d);
            // Don't render past dates at all — empty cell keeps grid alignment
            if (d <= today) return <div key={dateStr} />;
            const selectable = isDateSelectableForTier(d, tier);
            const isOutside  = d > windowEnd;
            const isWrongDay = tier.validDays && !tier.validDays.includes(d.getDay());
            const isFull     = !isOutside && !isWrongDay && !isDateAvailable(d);
            const isSelected = dateStr === selectedStart && duration === tier.key;

            let bg = "transparent", color = C.ink, opacity = 1, cursor = "pointer", textDeco = "none";
            if (isSelected)      { bg = C.pinkText; color = C.white; }
            else if (isOutside)  { color = C.inkFaint; opacity = 0.3; cursor = "default"; }
            else if (isWrongDay) { color = C.inkFaint; opacity = 0.25; cursor = "default"; }
            else if (isFull)     { color = C.inkFaint; opacity = 0.4; cursor = "not-allowed"; textDeco = "line-through"; }
            else if (selectable) { color = C.ink; }

            return (
              <button
                key={dateStr}
                onClick={() => selectable && handleDateSelect(d, tier)}
                style={{
                  padding:"7px 0", borderRadius:8, fontSize:13,
                  fontWeight: isSelected ? 800 : 500,
                  textAlign:"center", fontFamily:F,
                  background:bg, color, opacity, cursor,
                  border: "none",
                  textDecoration: textDeco,
                  transition:"background 100ms",
                }}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>

        {/* selected confirmation bar */}
        {selectedWindow?.start && duration === tier.key && (
          <div style={{ padding:"10px 16px 14px", borderTop:`1px solid ${C.surfaceBorder}`, textAlign:"center" }}>
            <span style={{ fontSize:13, fontWeight:700, color:C.pinkText, fontFamily:F }}>
              Drop off {formatShort(new Date(selectedWindow.start + "T12:00:00"))} · Pick up {formatShort(new Date(selectedWindow.end + "T12:00:00"))}
            </span>
          </div>
        )}

        {/* degraded fallback notice */}
        {isAvailabilityDegraded && (
          <div style={{ padding:"8px 16px", background:"#fffbe6", borderTop:`1px solid #ffe58f`, textAlign:"center" }}>
            <span style={{ fontSize:11, color:"#8a6300", fontFamily:F }}>Live availability temporarily unavailable — all dates shown as open</span>
          </div>
        )}
      </div>
    );
  };

  if (availabilityLoading) {
    return (
      <div style={{ padding:"40px 0", textAlign:"center" }}>
        <div style={{ fontSize:13, color:C.inkFaint, fontFamily:F }}>Checking availability…</div>
      </div>
    );
  }

  return (
    <div>
      <StepHeading
        eyebrow="Almost there"
        title="When do you want your dumpster?"
        text={`Delivery and includes ${sizeMeta[effectiveSize]?.tons || 1} ton${(sizeMeta[effectiveSize]?.tons || 1) !== 1 ? "s" : ""} included in all prices below.`}
      />

      {/* selected dumpster badge */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderRadius:12, border:`1px solid ${C.surfaceBorder}`, background:C.surfaceBg, marginBottom:16, fontFamily:F }}>
        <span style={{ fontSize:15, fontWeight:800, color:C.ink }}>{effectiveSize}</span>
        <span style={{ fontSize:12, fontWeight:700, color:C.pinkText, background:C.pinkBg, border:`1px solid ${C.pinkBorder}`, borderRadius:99, padding:"3px 10px" }}>
          Includes {sizeMeta[effectiveSize]?.tons || 1} ton{(sizeMeta[effectiveSize]?.tons || 1) !== 1 ? "s" : ""}
        </span>
      </div>

      {/* tier cards */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {TIERS.map(tier => {
          const price    = calculatedPrices[tier.key];
          const isActive = selectedTierKey === tier.key;
          return (
            <div key={tier.key}>
              <button
                onClick={() => handleTierSelect(tier.key)}
                style={{
                  width:"100%", textAlign:"left", padding:"16px 18px",
                  borderRadius: isActive ? "12px 12px 0 0" : 12,
                  cursor:"pointer", fontFamily:F,
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                  border: isActive ? `2px solid ${C.pinkText}` : `1px solid ${C.surfaceBorder}`,
                  borderBottom: isActive ? "none" : undefined,
                  background: isActive ? C.pinkBg : C.white,
                  boxShadow: isActive ? `0 0 0 3px ${C.pinkBorder}` : "0 1px 3px rgba(0,0,0,0.04)",
                  transition:"border-color 150ms, background 150ms",
                }}
              >
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                    <span style={{ fontSize:15, fontWeight:900, color: isActive ? C.pinkText : C.ink, fontFamily:F }}>
                      {tier.label}
                    </span>
                    {tier.tag && (
                      <span style={{ fontSize:10, fontWeight:800, color:C.pinkText, background: isActive ? C.white : C.pinkBg, border:`1px solid ${C.pinkBorder}`, borderRadius:99, padding:"2px 8px", fontFamily:F }}>
                        {tier.tag}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color: isActive ? C.pinkText : C.inkMuted, fontFamily:F }}>{tier.sublabel}</div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                  <div style={{ fontSize:24, fontWeight:900, color: isActive ? C.pinkText : C.ink, letterSpacing:"-0.5px", fontFamily:F }}>
                    {typeof price === "number" ? `$${price}` : "—"}
                  </div>
                  <div style={{ fontSize:11, color: isActive ? C.pinkText : C.inkFaint, fontFamily:F, marginTop:2 }}>
                    {isActive ? "select a date ↓" : "tap to select"}
                  </div>
                </div>
              </button>

              {/* calendar panel — opens below active card */}
              {isActive && (
                <div style={{
                  border:`2px solid ${C.pinkText}`, borderTop:"none",
                  borderRadius:"0 0 12px 12px", overflow:"hidden",
                  boxShadow:`0 0 0 3px ${C.pinkBorder}`,
                  marginBottom:2,
                }}>
                  <CalendarWidget tier={tier} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── main component ───────────────────────────────────────────────────────────

export default function Funnel() {
  const _urlZip = (() => {
    try { const p = new URLSearchParams(window.location.search).get("zip"); return (p && /^\d{5}$/.test(p.trim())) ? p.trim() : ""; } catch { return ""; }
  })();
  const _urlZipValid = _urlZip && !!zipToZone[_urlZip];

  const [step,                setStep]                = useState(_urlZipValid ? 1 : 0);
  const [zip,                 setZip]                 = useState(_urlZip || "");
  const [zipError,            setZipError]            = useState("");
  const [zoneKey,             setZoneKey]             = useState("");
  const [zoneFee,             setZoneFee]             = useState(0);
  const [customerType,        setCustomerType]        = useState("");
  const [returningPath,       setReturningPath]       = useState("");
  const [project,             setProject]             = useState("");
  const [otherText,           setOtherText]           = useState("");
  const [showConcreteNotice,  setShowConcreteNotice]  = useState(false);
  const [size,                setSize]                = useState("");
  const [overrideSize,        setOverrideSize]        = useState("");
  const [duration,            setDuration]            = useState("");
  const [selectedPrice,       setSelectedPrice]       = useState(null);
  const [availabilityData,    setAvailabilityData]    = useState(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError,   setAvailabilityError]   = useState("");
  const [selectedWindow,      setSelectedWindow]      = useState(null);
  const [showComparison,      setShowComparison]      = useState(false);
  const [showMoreDates,       setShowMoreDates]       = useState({});
  const [submitting,          setSubmitting]          = useState(false);
  const [submitted,           setSubmitted]           = useState(false);
  const [submitError,         setSubmitError]         = useState("");
  const [smsOptIn,            setSmsOptIn]            = useState(false);
  const [form, setForm] = useState({
    name:    "",
    email:   "",
    phone:   "",
    source:  "",
    street:  "",
    street2: "",
    city:    "",
    state:   "GA",
    zip:     "",
  });

  const [capturedLeadId,      setCapturedLeadId]      = useState(null);
  const [showExitModal,       setShowExitModal]       = useState(false);
  const [exitSubmitting,      setExitSubmitting]      = useState(false);
  const [exitError,           setExitError]           = useState("");
  const [exitSubmitted,       setExitSubmitted]       = useState(false);
  const [exitTriggered,       setExitTriggered]       = useState(false);

  const stepRef          = useRef(step);
  const idleTimerRef     = useRef(null);
  const historyPushedRef = useRef(false);
  const checkoutStartedRef = useRef(false);
  const turnstileWidgetIdRef = useRef(null);
  const turnstileRenderedRef = useRef(false);

  useEffect(() => { stepRef.current = step; }, [step]);

  useEffect(() => {
    if (_urlZipValid) {
      const found = zipToZone[_urlZip];
      setZoneKey(found);
      setZoneFee(zones[found].fee);
      setForm(prev => ({ ...prev, zip: _urlZip }));
    }
  }, []);

  useEffect(() => {
    if (step !== 6) return;
    if (typeof window === "undefined") return;
    if (!window.turnstile) return;
    if (turnstileRenderedRef.current) return;

    const container = document.getElementById("turnstile-widget");
    if (!container) return;

    container.innerHTML = "";

    turnstileWidgetIdRef.current = window.turnstile.render("#turnstile-widget", {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      theme: "light",
    });

    turnstileRenderedRef.current = true;
  }, [step]);

  const areaLabel        = getAreaLabel(zip);
  const effectiveSize    = overrideSize || size;
  const isQuickPath = returningPath === "quick";

  const recommendation = useMemo(() => getRecommendation(customerType, project, otherText), [customerType, project, otherText]);

  const stepLabel = {
    0:"Service Area", 1:"How to Proceed", 3:"Project Type",
    4: isQuickPath ? "Size Selection" : "Best Fit",
    5:"Delivery Date", 6:"Contact Info"
  }[step] || "";
  const visibleTotalSteps = isQuickPath ? 5 : 6;
  const currentVisualStep = (() => {
    if (step===0) return 1; if (step===1) return 2;
    if (step===3) return 3; if (step===4) return isQuickPath ? 3 : 4;
    if (step===5) return isQuickPath ? 4 : 5;
    if (step===6) return isQuickPath ? 5 : 6;
    return 1;
  })();
  const progressPercent = (currentVisualStep / visibleTotalSteps) * 100;

  const calculatedPrices = useMemo(() => {
    if (!effectiveSize || !basePricing[effectiveSize]) return {};
    const p = {};
    Object.entries(basePricing[effectiveSize]).forEach(([k, v]) => { p[k] = v + zoneFee; });
    return p;
  }, [effectiveSize, zoneFee]);

  const isAvailabilityDegraded = Boolean(availabilityError || availabilityData?.degraded);
  const availableOptions       = availabilityData?.available || {};

  const shouldShowExitModal = useCallback(() => {
    return stepRef.current >= 5 && !exitTriggered && !exitSubmitted && !submitted;
  }, [exitTriggered, exitSubmitted, submitted]);

  const triggerExitModal = useCallback(() => {
    if (!shouldShowExitModal()) return;
    setExitTriggered(true);
    setShowExitModal(true);
  }, [shouldShowExitModal]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (stepRef.current >= 5) {
      idleTimerRef.current = setTimeout(() => {
        triggerExitModal();
      }, IDLE_TIMEOUT_MS);
    }
  }, [triggerExitModal]);

  useEffect(() => {
    const events = ["touchstart", "touchmove", "mousedown", "mousemove", "keydown", "scroll"];
    events.forEach(e => window.addEventListener(e, resetIdleTimer, { passive:true }));
    resetIdleTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  useEffect(() => {
    if (step >= 5 && !historyPushedRef.current) {
      window.history.pushState({ funnelStep: step }, "");
      historyPushedRef.current = true;
    }
    const handlePopState = (e) => {
      if (stepRef.current >= 5) {
        window.history.pushState({ funnelStep: stepRef.current }, "");
        triggerExitModal();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [step, triggerExitModal]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      // Only trigger exit modal if page is hidden AND checkout has not started.
      // Customers routinely switch tabs to check banking apps, texts, or autofill —
      // that should never count as abandonment.
      if (document.visibilityState === "hidden" && !checkoutStartedRef.current) {
        triggerExitModal();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [triggerExitModal]);

  const handleExitModalDismiss = () => {
    setShowExitModal(false);
    setExitError("");
    resetIdleTimer();
  };

  const handleExitSubmit = async ({ name, phone, smsOptIn: optIn, smsOptInDate }) => {
    if (!phone) return;
    setExitSubmitting(true);
    setExitError("");
    const payload = {
      zip, areaLabel, zone:zoneKey, deliveryFee:zoneFee, customerType,
      selectedSize:  effectiveSize || null,
      rentalPrice:   selectedPrice || null,
      selectedWindow: selectedWindow || null,
      funnelSource:  "exit_capture",
      leadSourceName: "Website",
      smsOptIn:      optIn,
      smsOptInDate:  smsOptInDate,
      contact: { name: name || "", email: "", phone: phone, mobile: phone, source: "Exit Modal" },
    };
    try {
      const res  = await fetch("/api/submit-lead", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error || "Submission failed.");
      setExitSubmitted(true);
      setShowExitModal(false);
      setTimeout(() => { window.location.href = HOMEPAGE; }, 1800);
    } catch (err) {
      setExitError("Something went wrong. Call or text us at 470-548-4733.");
    } finally {
      setExitSubmitting(false);
    }
  };

  const handleClose = () => {
    if (step >= 5) {
      if (!exitSubmitted && !submitted) { setShowExitModal(true); } 
      else { window.location.href = HOMEPAGE; }
    } else { window.location.href = HOMEPAGE; }
  };

  const handleZipSubmit = () => {
    const clean = zip.trim();
    if (!/^\d{5}$/.test(clean)) { setZipError("Please enter a valid 5-digit ZIP code."); return; }
    const found = zipToZone[clean];
    if (!found) { setZipError("We may not service that area right now."); return; }
    setZipError(""); setZoneKey(found); setZoneFee(zones[found].fee);
    setForm(prev => ({ ...prev, zip: clean }));
    setStep(1);
  };

  const handlePath = (path, impliedCustomerType) => {
    setCustomerType(impliedCustomerType);
    setReturningPath(path); setProject(""); setOtherText("");
    setSize(""); setOverrideSize(""); setDuration(""); setSelectedPrice(null);
    setAvailabilityData(null); setAvailabilityLoading(false); setAvailabilityError(""); setSelectedWindow(null);
    setShowMoreDates({}); setShowConcreteNotice(false);
    setStep(path === "quick" ? 4 : 3);
  };

  const handleProject = (sel) => {
    if ((customerType === "Contractor" || customerType === "Contractor / Roofer") && sel === "Concrete") { setShowConcreteNotice(true); return; }
    setProject(sel);
    const reco = getRecommendation(customerType, sel, otherText);
    setSize(reco.size); setOverrideSize(""); setShowComparison(false);
    setDuration(""); setSelectedPrice(null);
    setAvailabilityData(null); setAvailabilityLoading(false); setAvailabilityError(""); setSelectedWindow(null);
    setShowMoreDates({});
    setStep(4);
  };

  const handleOtherContinue = () => {
    const reco = getRecommendation(customerType, "Other", otherText);
    setSize(reco.size); setOverrideSize(""); setShowComparison(false);
    setDuration(""); setSelectedPrice(null);
    setAvailabilityData(null); setAvailabilityLoading(false); setAvailabilityError(""); setSelectedWindow(null);
    setShowMoreDates({});
    setStep(4);
  };

  const handleSizeSelect = (sel) => {
    if (isQuickPath) {
      setSize(""); setOverrideSize(sel); setDuration(""); setSelectedPrice(null);
      setAvailabilityData(null); setAvailabilityLoading(false); setAvailabilityError(""); setSelectedWindow(null);
      setTimeout(() => {
        setDuration(""); setSelectedPrice(null); setSelectedWindow(null);
        setAvailabilityData(null); setAvailabilityError(""); setAvailabilityLoading(true);
        setStep(5);
        fetch(AVAILABILITY_ENDPOINT, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ size:sel }) })
          .then(r => r.json())
          .then(json => { setAvailabilityData(json); })
          .catch(err => {
            if (err.message === "Failed to fetch" || err.message?.includes("NetworkError")) { window.location.href = ECOM_FALLBACK; return; }
            setAvailabilityError("Live date availability is temporarily unavailable.");
            setAvailabilityData({ size:sel, available:{}, degraded:true });
          })
          .finally(() => setAvailabilityLoading(false));
      }, 120);
      return;
    }
    setOverrideSize(sel === size ? "" : sel);
    setDuration(""); setSelectedPrice(null);
    setAvailabilityData(null); setAvailabilityLoading(false); setAvailabilityError(""); setSelectedWindow(null);
  };

  const handleContinueFromStep4 = async () => {
    if (!effectiveSize) return alert("Please choose a dumpster size.");
    setDuration(""); setSelectedPrice(null); setSelectedWindow(null);
    setAvailabilityData(null); setAvailabilityError(""); setAvailabilityLoading(true);
    setStep(5);
    try {
      const res  = await fetch(AVAILABILITY_ENDPOINT, { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ size:effectiveSize }) });
      const json = await res.json();
      if (!res.ok || json?.error) throw new Error(json?.error || "Unable to load availability.");
      setAvailabilityData(json);
    } catch (err) {
      if (err.message === "Failed to fetch" || err.message?.includes("NetworkError")) { window.location.href = ECOM_FALLBACK; return; }
      setAvailabilityError("Live date availability is temporarily unavailable.");
      setAvailabilityData({ size:effectiveSize, available:{}, degraded:true });
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const handleWindowSelect = (option, windowObj) => {
    setDuration(option.key);
    setSelectedPrice(calculatedPrices[option.key] ?? null);
    setSelectedWindow(windowObj);
    setStep(6);
  };

  const handleFallbackOptionSelect = (option) => {
    setDuration(option.key);
    setSelectedPrice(calculatedPrices[option.key] ?? null);
    setSelectedWindow(null);
    setStep(6);
  };

  const handlePhoneBlur = async () => {
    if (capturedLeadId) return;
    const cleanPhone = form.phone.trim();
    if (cleanPhone.length < 10) return;
    const payload = {
      zip, areaLabel, zone:zoneKey, deliveryFee:zoneFee, customerType, returningPath,
      project: normalizeProjectForOdoo(project),
      otherText: project === "Other" ? otherText.trim() : "",
      recommendedSize: size,
      selectedSize: effectiveSize,
      includedTons: sizeMeta[effectiveSize]?.tons || null,
      rentalOption: normalizeRentalOption(duration),
      rentalPrice: selectedPrice,
      selectedWindow,
      funnelSource: "rent_a_dumpster_funnel_partial",
      leadSourceName: "Website",
      contact: { name: form.name.trim(), email: form.email.trim(), phone: cleanPhone, mobile: cleanPhone, source: form.source },
    };
    try {
      const res = await fetch("/api/submit-lead", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
      const json = await res.json();
      if (json?.success && json?.leadId) { setCapturedLeadId(json.leadId); }
    } catch (err) {}
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      alert("Please enter your name, email, and phone number.");
      return;
    }

    if (!selectedWindow?.startIso || !selectedWindow?.endIso) {
      setSubmitError("Please choose a delivery date before checkout.");
      return;
    }

    const token =
      window.turnstile && turnstileWidgetIdRef.current
        ? window.turnstile.getResponse(turnstileWidgetIdRef.current)
        : "";

    if (!token) {
      alert("Please complete the security check.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const payload = {
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
      rentalOption: normalizeRentalOption(duration),
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
        source: form.source,
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
      const resOdoo = await fetch("/api/submit-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const odooJson = await resOdoo.json();

      if (!resOdoo.ok || !odooJson?.success) {
        throw new Error(odooJson?.error || "Lead submission failed.");
      }

      const finalLeadId = odooJson.leadId || capturedLeadId;

      const holdPayload = {
        ...payload,
        leadId: finalLeadId,
        customerName: form.name.trim(),
        customerEmail: form.email.trim(),
        sizeCode: SIZE_CODE_MAP[effectiveSize],
        requestedStartAt: selectedWindow.startIso,
        requestedEndAt: selectedWindow.endIso,
      };

      const resHold = await fetch("/api/create-booking-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(holdPayload),
      });
      const holdJson = await resHold.json();

      if (!resHold.ok || !holdJson?.success || !holdJson?.hold?.id) {
        throw new Error(holdJson?.error || "Unable to create booking hold.");
      }

      const stripePayload = {
        leadId: finalLeadId,
        bookingHoldId: holdJson.hold.id,
        customerEmail: form.email.trim(),
        customerName: form.name.trim(),
        dumpsterSize: effectiveSize,
        rentalOption: getRentalDisplayLabel(duration),
        basePrice: selectedPrice - zoneFee,
        deliveryFee: zoneFee,
        zone: zoneKey,
        deliveryDate: selectedWindow.start,
        selectedWindow,
        requestedStartAt: selectedWindow.startIso,
        requestedEndAt: selectedWindow.endIso,
      };

      checkoutStartedRef.current = true;
      const resStripe = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(stripePayload),
      });
      const stripeJson = await resStripe.json();

      if (!resStripe.ok || !stripeJson?.url) {
        throw new Error(stripeJson?.error || "Stripe Checkout failed.");
      }

      window.location.href = stripeJson.url;
    } catch (err) {
      setSubmitError(
        err.message || "Something went wrong preparing your checkout. Please try again or call 470-548-4733."
      );
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (step===6) {
      turnstileRenderedRef.current = false; // Reset rendering ref when going back
      return setStep(5);
    }
    if (step===5) return setStep(4);
    if (step===4) return isQuickPath ? setStep(1) : setStep(3);
    if (step===3) return setStep(1);
    if (step===1) return setStep(0);
  };

  const inputStyle = { display:"block", width:"100%", padding:"12px 14px", border:`1.5px solid ${C.surfaceBorder}`, borderRadius:10, background:C.white, fontSize:14, color:C.ink, boxSizing:"border-box", fontFamily:F };
  const labelStyle = { display:"block", fontSize:10, fontWeight:700, color:C.inkFaint, letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:5, marginTop:14, fontFamily:F };
  const firstLabelStyle = { ...labelStyle, marginTop:0 };

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" />
      <div style={{ minHeight:"100vh", background:C.pageBg, padding:"20px 16px 40px", fontFamily:F }}>
        {exitSubmitted && (
          <div style={{ position:"fixed", top:20, left:"50%", transform:"translateX(-50%)", background:C.ink, color:C.white, padding:"12px 24px", borderRadius:12, fontSize:14, fontWeight:700, zIndex:1100, fontFamily:F, boxShadow:"0 4px 16px rgba(0,0,0,0.2)" }}>
            ✓ We'll text you shortly!
          </div>
        )}
        {showExitModal && (
          <ExitModal onSubmit={handleExitSubmit} onDismiss={handleExitModalDismiss} submitting={exitSubmitting} error={exitError} capturedSize={effectiveSize || null} capturedPrice={selectedPrice || null} />
        )}
        <div style={{ maxWidth:800, margin:"0 auto" }}>
          <header style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0 14px", marginBottom:16, borderBottom:`1px solid ${C.cardBorder}` }}>
            <img src="/little-junkers-logo.png" alt="Little Junkers" style={{ maxWidth:130, height:"auto", display:"block" }} />
            <div style={{ display:"flex", alignItems:"center", gap:16 }}>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:10, fontWeight:700, color:C.inkFaint, letterSpacing:"0.8px", textTransform:"uppercase" }}>Peachtree City, GA</div>
                <a href="tel:4705484733" style={{ fontSize:16, fontWeight:900, color:C.ink, textDecoration:"none", fontFamily:F }}>470-548-4733</a>
              </div>
              <button onClick={handleClose} aria-label="Close" style={{ width:40, height:40, borderRadius:"50%", background:C.surfaceBg, border:`1.5px solid ${C.surfaceBorder}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0, fontSize:18, color:C.ink, fontWeight:700, lineHeight:1 }}>✕</button>
            </div>
          </header>
          <main style={{ background:C.cardBg, border:`1px solid ${C.cardBorder}`, borderRadius:16, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.05)" }}>
            {step === 0 && (
              <div>
                {/* ── Hero ── */}
                <div style={{
                  background:"radial-gradient(circle at top right, rgba(255,206,228,0.22), transparent 34%), radial-gradient(circle at bottom left, rgba(194,88,122,0.13), transparent 32%), linear-gradient(135deg,#171511 0%,#211f1a 52%,#2a2523 100%)",
                  padding:"36px 28px 32px",
                  position:"relative",
                  borderRadius:"16px 16px 0 0",
                }}>
                  {/* Eyebrow */}
                  <div style={{ fontSize:10, fontWeight:800, color:C.heroAccent, letterSpacing:"1.6px", textTransform:"uppercase", marginBottom:14, opacity:0.85, fontFamily:F }}>
                    Dumpster Rental · South Atlanta
                  </div>
                  {/* Headline */}
                  <h1 style={{ margin:"0 0 18px", fontSize:30, fontWeight:900, color:C.white, letterSpacing:"-0.8px", lineHeight:1.12, fontFamily:F }}>
                    Check Dumpster Availability<br />
                    in{" "}
                    <span style={{ color:C.heroAccent }}>Your ZIP Code</span>
                  </h1>
                  {/* Subcopy */}
                  <p style={{ margin:"0 0 6px", fontSize:14, color:"#b8b0a6", lineHeight:1.6, fontFamily:F, maxWidth:480 }}>
                    Almost there — just need your ZIP to pull up local pricing.
                  </p>
                  {/* Subline */}
                  <p style={{ margin:"0 0 28px", fontSize:12, color:"rgba(255,255,255,0.4)", lineHeight:1.5, fontFamily:F, maxWidth:480 }}>
                    Hey, we hate when the price changes at checkout — providing your ZIP ensures no surprises.
                  </p>
                  {/* ZIP input + button + trust image — two-column grid */}
                  <style>{`
                    @media (max-width:760px) {
                      .lj-step0-grid { grid-template-columns: 1fr !important; }
                      .lj-step0-proof { margin-top: 8px !important; }
                    }
                    @media (max-width:520px) {
                      .lj-zip-row { flex-direction: column !important; }
                      .lj-zip-btn { width: 100% !important; }
                    }
                  `}</style>
                  <div
                    className="lj-step0-grid"
                    style={{
                      display:"grid",
                      gridTemplateColumns:"1.08fr 0.92fr",
                      gap:24,
                      alignItems:"center",
                    }}
                  >
                    {/* Left column: ZIP form + error + trust pills */}
                    <div>
                      <div className="lj-zip-row" style={{ display:"flex", gap:10, alignItems:"stretch", maxWidth:440 }}>
                        <input
                          placeholder="Your ZIP"
                          value={zip}
                          onChange={e => setZip(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleZipSubmit()}
                          maxLength={5}
                          inputMode="numeric"
                          style={{
                            flex:1,
                            padding:"14px 16px",
                            border:"1.5px solid rgba(255,255,255,0.12)",
                            borderRadius:12,
                            background:"rgba(255,255,255,0.07)",
                            fontSize:15,
                            color:C.white,
                            boxSizing:"border-box",
                            fontFamily:F,
                            outline:"none",
                            caretColor:C.heroAccent,
                          }}
                        />
                        <button
                          className="lj-zip-btn"
                          onClick={handleZipSubmit}
                          style={{
                            padding:"14px 22px",
                            background:C.heroAccent,
                            color:"#1e1c19",
                            border:"none",
                            borderRadius:12,
                            fontSize:14,
                            fontWeight:900,
                            cursor:"pointer",
                            fontFamily:F,
                            whiteSpace:"nowrap",
                            letterSpacing:"0.2px",
                            flexShrink:0,
                          }}
                        >
                          Check Availability →
                        </button>
                      </div>
                      {zipError && (
                        <div style={{ marginTop:10, color:"#ffb3b3", fontSize:13, lineHeight:1.4, fontFamily:F }}>
                          {zipError}
                        </div>
                      )}
                      {/* Trust pills */}
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:24 }}>
                        {[
                          "✓ Delivery included",
                          "✓ Driveway-safe trucks",
                          "✓ Locally owned",
                          "✓ Se habla español",
                        ].map(t => (
                          <span key={t} style={{
                            fontSize:11,
                            color:"rgba(255,255,255,0.65)",
                            fontWeight:700,
                            background:"rgba(255,255,255,0.07)",
                            border:"1px solid rgba(255,255,255,0.1)",
                            borderRadius:99,
                            padding:"5px 12px",
                            fontFamily:F,
                            letterSpacing:"0.2px",
                          }}>{t}</span>
                        ))}
                      </div>
                    </div>
                    {/* Right column: proof image */}
                    <div
                      className="lj-step0-proof"
                      style={{
                        background:"rgba(255,255,255,0.07)",
                        border:"1px solid rgba(255,255,255,0.12)",
                        borderRadius:18,
                        padding:10,
                        boxShadow:"0 14px 36px rgba(0,0,0,0.22)",
                      }}
                    >
                      <img
                        src="/Little_Junker_in_residential_driveway.JPEG"
                        alt="Pink Little Junkers dumpster placed in a residential driveway"
                        loading="eager"
                        style={{
                          width:"100%",
                          height:210,
                          objectFit:"cover",
                          borderRadius:13,
                          display:"block",
                        }}
                      />
                      <div style={{
                        marginTop:9,
                        fontSize:11,
                        lineHeight:1.45,
                        color:"rgba(255,255,255,0.68)",
                        fontWeight:800,
                        fontFamily:F,
                      }}>
                        Real pink dumpsters sized for residential driveways.
                      </div>
                    </div>
                  </div>
                </div>
                <CardFooter />
              </div>
            )}
            {step > 0 && (
              <div>
                <ProgressChrome currentVisualStep={currentVisualStep} visibleTotalSteps={visibleTotalSteps} stepLabel={stepLabel} progressPercent={progressPercent} onBack={goBack} showBack={true} />
                <CardBody>
                  {step === 1 && (
                    <div>
                      <StepHeading eyebrow="Coverage confirmed" title="How do you want to proceed?" text={`${areaLabel} is in our ${zones[zoneKey]?.label?.toLowerCase() || ""}.`} />
                      <div style={{ display:"grid", gap:10 }}>
                        <OptionCard title="Quick Select" sub="I already know which size I need" selected={returningPath==="quick"} onClick={() => handlePath("quick", "Returning")} />
                        <OptionCard title="Help Me Choose" sub="Walk me through sizing for my project" selected={returningPath==="recommend" && customerType !== "Contractor / Roofer"} onClick={() => handlePath("recommend", "New Customer")} />
                        <OptionCard title="Contractor / Roofer" sub="Business or repeat jobsite use — help me size" selected={returningPath==="recommend" && customerType === "Contractor / Roofer"} onClick={() => handlePath("recommend", "Contractor / Roofer")} />
                      </div>
                    </div>
                  )}
                  {step === 3 && (
                    <div>
                      <StepHeading eyebrow="Step 3" title={(customerType==="Contractor" || customerType==="Contractor / Roofer") ? "What type of debris are you dealing with?" : "What kind of cleanup are you tackling?"} text="Choose the option closest to your current project." />
                      <div style={{ display:"grid", gap:10 }}>
                        {((customerType==="Contractor" || customerType==="Contractor / Roofer") ? ["General Cleanup","Renovation / demo","Roofing","Concrete","Other"] : ["Cleaning the garage / basement","Moving / decluttering","Renovation / demo","Other"]).map(type => (
                          <OptionCard key={type} title={type} selected={project===type} onClick={() => type==="Other" ? setProject("Other") : handleProject(type)} />
                        ))}
                      </div>
                      {project === "Other" && (
                        <div style={{ marginTop:16 }}>
                          <label style={firstLabelStyle}>Tell us a little more</label>
                          <textarea value={otherText} onChange={e => setOtherText(e.target.value)} placeholder="Describe your project..." style={{ ...inputStyle, minHeight:90, resize:"vertical" }} />
                          <PrimaryButton onClick={handleOtherContinue}>Continue</PrimaryButton>
                        </div>
                      )}
                      {showConcreteNotice && (
                        <div style={{ marginTop:16, background:C.warningBg, border:`1px solid ${C.warningBorder}`, borderRadius:12, padding:16, fontFamily:F }}>
                          <div style={{ fontWeight:800, color:C.ink, marginBottom:6 }}>Concrete isn't something we haul right now</div>
                          <p style={{ margin:0, color:C.inkMid, lineHeight:1.5, fontSize:14 }}>We can still help with general cleanup, renovation debris, and roofing.</p>
                          <button onClick={() => setShowConcreteNotice(false)} style={{ marginTop:12, padding:"9px 16px", background:C.ink, color:C.white, border:"none", borderRadius:10, cursor:"pointer", fontWeight:700, fontFamily:F, fontSize:13 }}>Got it</button>
                        </div>
                      )}
                    </div>
                  )}
                  {step === 4 && (
                    <div>
                      <StepHeading eyebrow={isQuickPath ? "Quick select" : "Based on your project"} title={isQuickPath ? "Choose your rental size" : "Best fit for your project"} text={isQuickPath ? "Select the size you want." : "This is the strongest fit based on what you described."} />
                      {!isQuickPath && effectiveSize && (
                        <div style={{ display:"flex", gap:14, alignItems:"stretch", marginBottom:18, flexWrap:"wrap" }}>
                          <div onClick={handleContinueFromStep4} role="button" tabIndex={0} onKeyDown={e => e.key === "Enter" && handleContinueFromStep4()} style={{ flex:"1 1 300px", background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:20, cursor:"pointer" }}>
                            <div style={{ fontSize:36, fontWeight:900, color:C.ink, letterSpacing:"-1.5px", lineHeight:1, marginBottom:8 }}>{effectiveSize}</div>
                            <div style={{ marginBottom:14 }}><TonnagePill label={sizeMeta[effectiveSize]?.label || ""} /></div>
                            <ul style={{ margin:"0 0 16px", paddingLeft:18, lineHeight:1.75, color:C.inkMid, fontSize:13 }}>{recommendation.holds.map(item => <li key={item}>{item}</li>)}</ul>
                            <div style={{ background:C.white, border:`1px solid ${C.surfaceBorder}`, borderRadius:10, padding:"12px 14px" }}>
                              <p style={{ margin:"0 0 6px", fontSize:13, lineHeight:1.55, color:C.ink }}>{recommendation.reason}</p>
                              <div style={{ fontSize:12, color:C.inkMuted }}>{recommendation.note}</div>
                            </div>
                            <div style={{ marginTop:14, fontSize:12, fontWeight:700, color:C.pinkText, textAlign:"center" }}>Tap to continue →</div>
                          </div>
                          <div style={{ flex:"1 1 200px", display:"flex", flexDirection:"column", gap:12 }}>
                            <div style={{ background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:14, flex:1, display:"flex", alignItems:"center", justifyContent:"center", minHeight:160 }}>
                              <img src={DUMPSTER_IMAGES[effectiveSize]} alt={`${effectiveSize} dumpster`} style={{ width:"100%", maxWidth:260, height:"auto", objectFit:"contain" }} />
                            </div>
                          </div>
                        </div>
                      )}
                      {!isQuickPath && effectiveSize && (
                        <div style={{ marginBottom:8 }}>
                          <button onClick={() => setShowComparison(v => !v)} style={{ width:"100%", background:"none", border:`1px solid ${C.surfaceBorder}`, borderRadius:10, padding:"10px 16px", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                            <span style={{ fontSize:13, fontWeight:700, color:C.inkMid }}>{showComparison ? "Hide size comparison" : "Compare other sizes"}</span>
                            <span style={{ fontSize:14, color:C.inkMuted }}>{showComparison ? "▲" : "▼"}</span>
                          </button>
                          {showComparison && (
                            <div style={{ background:C.white, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:18, marginTop:10 }}>
                              <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10 }}>
                                {allSizes.map(sizeKey => {
                                  const isMatch = sizeKey === size;
                                  const isSelected = effectiveSize === sizeKey;
                                  return (
                                    <div key={sizeKey} style={{ background: isSelected ? C.white : C.surfaceBg, border: isSelected ? `1.5px solid ${C.ink}` : `1px solid ${C.surfaceBorder}`, borderRadius:12, padding:14 }}>
                                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                                        <div style={{ fontSize:17, fontWeight:900 }}>{sizeKey}</div>
                                        {isMatch && <span style={{ background:C.pinkBg, color:C.pinkText, fontSize:10, fontWeight:800, padding:"3px 8px", borderRadius:99 }}>Best Fit</span>}
                                      </div>
                                      <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>{sizeMeta[sizeKey].label}</div>
                                      {isSelected ? <div style={{ fontSize:12, fontWeight:800 }}>Selected</div> : <button onClick={() => handleSizeSelect(sizeKey)} style={{ width:"100%", padding:"9px", background:C.white, border:`1px solid ${C.surfaceBorder}`, borderRadius:10, fontSize:12, fontWeight:800 }}>Select</button>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          <PrimaryButton onClick={handleContinueFromStep4}>Continue with {effectiveSize}</PrimaryButton>
                        </div>
                      )}
                      {(isQuickPath || !effectiveSize) && (
                        <div style={{ display:"grid", gap:12 }}>
                          {allSizes.map(sizeKey => {
                            const meta = sizeMeta[sizeKey];
                            const hints = comparisonMeta[sizeKey];
                            const isSelected = effectiveSize === sizeKey;
                            return (
                              <div key={sizeKey} onClick={() => handleSizeSelect(sizeKey)} role="button" tabIndex={0}
                                onKeyDown={e => e.key === "Enter" && handleSizeSelect(sizeKey)}
                                style={{ padding:"18px 20px", borderRadius:14, cursor:"pointer", transition:"border 0.15s",
                                  border: isSelected ? `2px solid ${C.ink}` : `1.5px solid ${C.surfaceBorder}`,
                                  background: isSelected ? C.white : C.surfaceBg }}>
                                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:8 }}>
                                  <div style={{ fontSize:22, fontWeight:900, color:C.ink, letterSpacing:"-0.5px" }}>{sizeKey}</div>
                                  <TonnagePill label={meta.label} />
                                </div>
                                <ul style={{ margin:"0 0 10px", paddingLeft:18, lineHeight:1.75, color:C.inkMid, fontSize:13 }}>
                                  <li>{hints.truckLoads}</li>
                                  <li>{hints.bestUse}</li>
                                </ul>
                                <div style={{ fontSize:12, color:C.inkMuted, fontStyle:"italic" }}>{meta.bestFor}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {(isQuickPath || !effectiveSize) && <PrimaryButton onClick={handleContinueFromStep4}>Continue</PrimaryButton>}
                    </div>
                  )}
                  {step === 5 && (
                    <Step5DatePicker
                      effectiveSize={effectiveSize} availabilityLoading={availabilityLoading} isAvailabilityDegraded={isAvailabilityDegraded}
                      availableOptions={availableOptions} calculatedPrices={calculatedPrices} selectedWindow={selectedWindow}
                      duration={duration} showMoreDates={showMoreDates} setShowMoreDates={setShowMoreDates}
                      handleWindowSelect={handleWindowSelect} handleFallbackOptionSelect={handleFallbackOptionSelect}
                      sizeMeta={sizeMeta} rentalOptions={rentalOptions}
                      blockedDates={availabilityData?.blockedDates || []}
                    />
                  )}
                  {step === 6 && !submitted && (
                    <div>
                      <StepHeading eyebrow="Almost done" title="Complete your booking" text="Enter your service address and contact details." />
                      <div style={{ marginBottom: 18, border: `1px solid ${C.surfaceBorder}`, borderRadius: 14, overflow: "hidden" }}>
                        <div style={{ background: C.surfaceBg, padding: "9px 16px", fontSize: 10, fontWeight: 800, color: C.inkFaint, borderBottom: `1px solid ${C.surfaceBorder}` }}>Rental Summary</div>
                        {[
                          { label: "Service Area", value: areaLabel },
                          { label: "Dumpster", value: effectiveSize },
                          { label: "Rental", value: getRentalDisplayLabel(duration) },
                          { label: "Delivery date", value: selectedWindow ? `${selectedWindow.startLabel}` : "Subject to confirmation" },
                        ].map((row) => (
                          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${C.surfaceBorder}` }}>
                            <span style={{ fontSize: 13, color: C.inkMuted }}>{row.label}</span>
                            <span style={{ fontSize: 13, fontWeight: 700 }}>{row.value}</span>
                          </div>
                        ))}
                        <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", background: C.surfaceBg }}>
                          <span style={{ fontSize: 13, color: C.inkMuted }}>Total</span>
                          <span style={{ fontSize: 20, fontWeight: 900 }}>${selectedPrice}</span>
                        </div>
                      </div>
                      <div style={{ background: C.surfaceBg, border: `1px solid ${C.surfaceBorder}`, borderRadius: 14, padding: "18px" }}>
                        <label style={firstLabelStyle}>Name *</label>
                        <input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
                        <label style={labelStyle}>Email *</label>
                        <input placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
                        <label style={labelStyle}>Phone *</label>
                        <input placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={handlePhoneBlur} type="tel" style={inputStyle} />
                        <label style={labelStyle}>Service address *</label>
                        <input placeholder="Street address" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} style={inputStyle} />
                        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr", gap: 10, marginTop: 14 }}>
                          <input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle} />
                          <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} style={inputStyle}><option value="GA">GA</option></select>
                          <input value={form.zip} readOnly style={{ ...inputStyle, background: C.surfaceBg, color: C.inkMuted }} />
                        </div>
                        <label style={labelStyle}>How did you hear about us?</label>
                        <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} style={inputStyle}>
                          <option value="">Select one</option><option>Google</option><option>Facebook</option><option>Repeat Customer</option><option>Other</option>
                        </select>
                      </div>
                      <div id="turnstile-widget" style={{ marginTop: 16 }}></div>
                      {submitError && <div style={{ marginTop: 12, background: C.warningBg, border: `1px solid ${C.warningBorder}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: C.ink }}>{submitError}</div>}
                      <PrimaryButton onClick={handleSubmit} disabled={submitting}>{submitting ? "Preparing Checkout..." : "Proceed to Checkout"}</PrimaryButton>
                    </div>
                  )}
                </CardBody>
                <CardFooter />
              </div>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
