import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

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
  "30260":"B","30274":"B","30296":"B","30297":"B","30310":"B",
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
  "11 Yard": { "Early Bird":225, "Weekend Warrior":285, "Base Rental":275, "Full Reset":345 },
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
  handleFallbackOptionSelect, sizeMeta, rentalOptions,
}) {
  const standardWindows = availableOptions["Base Rental"]     || [];
  const earlyWindows    = availableOptions["Early Bird"]      || [];
  const weekendWindows  = availableOptions["Weekend Warrior"] || [];
  const resetWindows    = availableOptions["Full Reset"]      || [];

  const standardOption = rentalOptions.find(o => o.key === "Base Rental");
  const earlyOption    = rentalOptions.find(o => o.key === "Early Bird");
  const weekendOption  = rentalOptions.find(o => o.key === "Weekend Warrior");
  const resetOption    = rentalOptions.find(o => o.key === "Full Reset");

  const priceFor = (key) => calculatedPrices[key];
  const earlyIsDiscounted =
    typeof priceFor("Early Bird") === "number" &&
    typeof priceFor("Base Rental") === "number" &&
    priceFor("Early Bird") < priceFor("Base Rental");

  // Suppress Base Rental windows that share a start date with an Early Bird window.
  // If an Early Bird (discounted) option exists for that date, the Base Rental is
  // redundant and confusing — the cheaper option wins.
  const earlyBirdStartDates = new Set(earlyWindows.map(w => w.start));
  const filteredStandardWindows = earlyIsDiscounted
    ? standardWindows.filter(w => !earlyBirdStartDates.has(w.start))
    : standardWindows;

  const allRankedCandidates = [
    ...filteredStandardWindows.map(w => ({ type:"Base Rental",     option:standardOption, window:w })),
    ...earlyWindows.map(w =>           ({ type:"Early Bird",       option:earlyOption,    window:w })),
    ...weekendWindows.map(w =>         ({ type:"Weekend Warrior",  option:weekendOption,  window:w })),
    ...resetWindows.map(w =>           ({ type:"Full Reset",       option:resetOption,    window:w })),
  ].sort((a, b) => new Date(a.window.start).getTime() - new Date(b.window.start).getTime());

  const soonestCard = allRankedCandidates[0] || null;
  const weekdayCard = earlyWindows.length > 0
    ? { type:"Early Bird", option:earlyOption, window:earlyWindows[0] }
    : null;
  const weekendCard = weekendWindows.length > 0
    ? { type:"Weekend Warrior", option:weekendOption, window:weekendWindows[0] }
    : null;

  const featured = [];
  const seen = new Set();

  function pushUnique(card, label, sublabel, accentTag = null) {
    if (!card || !card.option || !card.window) return;
    const id = `${card.type}-${card.window.start}`;
    if (seen.has(id)) return;
    seen.add(id);
    featured.push({ ...card, cardLabel:label, cardSubLabel:sublabel, accentTag });
  }

  pushUnique(
    soonestCard,
    "Soonest available",
    soonestCard?.type === "Base Rental"
      ? "Standard 2-day rental"
      : soonestCard?.type === "Early Bird"
        ? (earlyIsDiscounted ? "Discounted 2-day rental" : "2-day rental · Mon or Tue delivery")
        : soonestCard?.type === "Weekend Warrior"
          ? "4-day rental"
          : "7-day rental"
  );
  pushUnique(
    weekdayCard,
    earlyIsDiscounted ? "Best weekday price" : "Weekday option",
    earlyIsDiscounted ? "Discounted 2-day rental · Mon or Tue delivery" : "2-day rental · Mon or Tue delivery"
  );
  pushUnique(weekendCard, "Weekend option", "4-day rental · best overall value", "Recommended");

  const featuredIds = new Set(featured.map(f => `${f.type}-${f.window.start}`));
  const moreCards   = allRankedCandidates.filter(c => !featuredIds.has(`${c.type}-${c.window.start}`));
  const hasMore     = moreCards.length > 0;

  const isSelectedCard = (optionKey, w) => selectedWindow?.start === w.start && duration === optionKey;

  const rentalTypeLabel = (type) => {
    if (type === "Base Rental")     return "Standard 2-Day Rental";
    if (type === "Early Bird")      return earlyIsDiscounted ? "Discounted 2-Day Rental" : "2-Day Rental";
    if (type === "Weekend Warrior") return "4-Day Rental";
    return "7-Day Rental";
  };
  const rentalTypeSub = (type) => {
    if (type === "Base Rental")     return "Next available delivery";
    if (type === "Early Bird")      return "Mon or Tue delivery";
    if (type === "Weekend Warrior") return "Best overall value";
    return "Any weekday delivery";
  };

  const PrimaryCard = ({ card }) => {
    const { option, window:w, cardLabel, cardSubLabel, type, accentTag } = card;
    const price      = priceFor(option.key);
    const isSelected = isSelectedCard(option.key, w);
    return (
      <button
        onClick={() => handleWindowSelect(option, w)}
        style={{
          width:"100%", textAlign:"left", padding:"18px 20px", borderRadius:14,
          cursor:"pointer", fontFamily:F,
          transition:"border-color 150ms, background 150ms, box-shadow 150ms",
          border: isSelected ? `2px solid ${C.pinkText}` : accentTag ? `1.5px solid ${C.pinkBorder}` : `1px solid ${C.surfaceBorder}`,
          background: isSelected ? C.pinkBg : C.white,
          boxShadow: isSelected ? `0 0 0 3px ${C.pinkBorder}` : accentTag ? "0 1px 4px rgba(194,88,122,0.08)" : "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ marginBottom:8, display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
              <span style={{ fontSize:10, fontWeight:800, letterSpacing:"0.6px", textTransform:"uppercase", fontFamily:F, color: isSelected ? C.pinkText : C.inkFaint }}>
                {cardLabel}
              </span>
              {accentTag && (
                <span style={{ background:C.pinkBg, color:C.pinkText, border:`1px solid ${C.pinkBorder}`, fontSize:10, fontWeight:800, padding:"2px 8px", borderRadius:99, fontFamily:F }}>
                  {accentTag}
                </span>
              )}
            </div>
            <div style={{ fontSize:20, fontWeight:900, color: isSelected ? C.pinkText : C.ink, letterSpacing:"-0.5px", lineHeight:1.1, fontFamily:F }}>{w.startLabel}</div>
            <div style={{ marginTop:4, fontSize:13, color: isSelected ? C.pinkText : C.inkMuted, fontFamily:F }}>Through {w.endLabel}</div>
            <div style={{ marginTop:8, fontSize:12, color: isSelected ? C.pinkText : C.inkMuted, fontFamily:F, opacity:0.9 }}>{cardSubLabel}</div>
            <div style={{ marginTop:8, fontSize:11, color: isSelected ? C.pinkText : C.inkFaint, fontFamily:F, fontWeight:700 }}>{rentalTypeLabel(type)}</div>
          </div>
          <div style={{ textAlign:"right", flexShrink:0 }}>
            <div style={{ fontSize:26, fontWeight:900, color: isSelected ? C.pinkText : C.ink, letterSpacing:"-0.8px", lineHeight:1, fontFamily:F }}>
              {typeof price === "number" ? `$${price}` : "—"}
            </div>
            {isSelected && (
              <div style={{ marginTop:6 }}>
                <span style={{ fontSize:11, fontWeight:800, color:C.pinkText, background:C.white, border:`1px solid ${C.pinkBorder}`, borderRadius:99, padding:"3px 9px", fontFamily:F }}>
                  Selected ✓
                </span>
              </div>
            )}
          </div>
        </div>
      </button>
    );
  };

  const MoreCard = ({ card }) => {
    const { option, window:w, type } = card;
    const price      = priceFor(option.key);
    const isSelected = isSelectedCard(option.key, w);
    return (
      <button
        onClick={() => handleWindowSelect(option, w)}
        style={{
          width:"100%", textAlign:"left", padding:"14px 16px", borderRadius:12,
          cursor:"pointer", fontFamily:F,
          border: isSelected ? `1.5px solid ${C.pinkText}` : `1px solid ${C.surfaceBorder}`,
          background: isSelected ? C.pinkBg : C.surfaceBg,
        }}
      >
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, fontWeight:800, color: isSelected ? C.pinkText : C.inkFaint, letterSpacing:"0.6px", textTransform:"uppercase", marginBottom:4, fontFamily:F }}>
              {rentalTypeLabel(type)} · {rentalTypeSub(type)}
            </div>
            <div style={{ fontSize:15, fontWeight:800, color: isSelected ? C.pinkText : C.ink, fontFamily:F }}>{w.startLabel}</div>
            <div style={{ fontSize:12, color: isSelected ? C.pinkText : C.inkMuted, marginTop:2, fontFamily:F }}>Through {w.endLabel}</div>
          </div>
          <div style={{ fontSize:20, fontWeight:900, color: isSelected ? C.pinkText : C.ink, letterSpacing:"-0.5px", fontFamily:F }}>
            {typeof price === "number" ? `$${price}` : "—"}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div>
      <StepHeading
        eyebrow="Almost there"
        title={availabilityLoading ? "Checking availability..." : "When do you want your dumpster?"}
        text={
          availabilityLoading
            ? `Pulling live delivery dates for your ${effectiveSize}.`
            : isAvailabilityDegraded
              ? "Live scheduling is temporarily unavailable. Choose a rental option and we'll confirm the date with you."
              : `Delivery and ${sizeMeta[effectiveSize]?.label?.toLowerCase()} included in all prices below.`
        }
      />

      <div style={{ marginBottom:18, background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:C.inkFaint, textTransform:"uppercase", letterSpacing:"0.5px", fontFamily:F }}>Selected Dumpster</div>
          <div style={{ fontSize:20, fontWeight:900, color:C.ink, marginTop:2, fontFamily:F }}>{effectiveSize}</div>
        </div>
        <TonnagePill label={sizeMeta[effectiveSize]?.label || ""} />
      </div>

      {availabilityLoading ? (
        <div style={{ background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:"24px 16px", fontFamily:F, textAlign:"center" }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.ink, marginBottom:4 }}>Checking dates...</div>
          <div style={{ fontSize:13, color:C.inkMuted }}>Pulling live availability from our schedule.</div>
        </div>
      ) : isAvailabilityDegraded ? (
        <div>
          <div style={{ marginBottom:12, background:C.warningBg, border:`1px solid ${C.warningBorder}`, borderRadius:12, padding:"12px 14px", color:C.ink, lineHeight:1.5, fontSize:13, fontFamily:F }}>
            <strong>Subject to confirmation:</strong> we'll confirm the exact delivery date after you submit.
          </div>
          <div style={{ display:"grid", gap:10 }}>
            {rentalOptions.map(opt => {
              const price = calculatedPrices[opt.key];
              return (
                <button key={opt.key} onClick={() => handleFallbackOptionSelect(opt)} style={{ width:"100%", textAlign:"left", padding:"14px 16px", borderRadius:12, border:`1px solid ${C.surfaceBorder}`, background:C.white, cursor:"pointer", fontFamily:F }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:15, fontWeight:800, color:C.ink }}>{opt.label}</div>
                      <div style={{ fontSize:12, color:C.inkMuted, marginTop:2 }}>{opt.sub}</div>
                    </div>
                    <div style={{ fontSize:20, fontWeight:900, color:C.ink }}>{typeof price === "number" ? `$${price}` : "—"}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : featured.length === 0 ? (
        <div style={{ background:C.warningBg, border:`1px solid ${C.warningBorder}`, borderRadius:12, padding:"12px 14px", color:C.ink, lineHeight:1.5, fontSize:13, fontFamily:F }}>
          No delivery windows found in the next 3 weeks for this size. <a href="tel:4705484733" style={{ color:C.ink, fontWeight:700 }}>Call us</a> to book or try a different size.
        </div>
      ) : (
        <div>
          <div style={{ display:"grid", gap:12 }}>
            {featured.map(card => <PrimaryCard key={`${card.type}-${card.window.start}`} card={card} />)}
          </div>
          {hasMore && (
            <div style={{ marginTop:14 }}>
              <button
                onClick={() => setShowMoreDates(prev => ({ ...prev, extended: !prev.extended }))}
                style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, fontWeight:700, color:C.inkMuted, fontFamily:F, padding:"4px 0", display:"flex", alignItems:"center", gap:6 }}
              >
                <span>{showMoreDates.extended ? "▲" : "▼"}</span>
                <span>{showMoreDates.extended ? "Hide other options" : "More dates and rental lengths"}</span>
              </button>
              {showMoreDates.extended && (
                <div style={{ marginTop:10, display:"grid", gap:10 }}>
                  {moreCards.map(card => <MoreCard key={`${card.type}-${card.window.start}`} card={card} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Funnel() {
  // Read optional ?zip= param from URL to allow pre-population from landing pages
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

  // Safety Net state
  const [capturedLeadId,      setCapturedLeadId]      = useState(null);

  // Exit modal state
  const [showExitModal,       setShowExitModal]       = useState(false);
  const [exitSubmitting,      setExitSubmitting]      = useState(false);
  const [exitError,           setExitError]           = useState("");
  const [exitSubmitted,       setExitSubmitted]       = useState(false);
  const [exitTriggered,       setExitTriggered]       = useState(false); // only fire once per session

  const stepRef          = useRef(step);
  const idleTimerRef     = useRef(null);
  const historyPushedRef = useRef(false);

  // Keep stepRef in sync
  useEffect(() => { stepRef.current = step; }, [step]);

  // If zip was pre-populated from URL param, hydrate zone state on mount
  useEffect(() => {
    if (_urlZipValid) {
      const found = zipToZone[_urlZip];
      setZoneKey(found);
      setZoneFee(zones[found].fee);
      setForm(prev => ({ ...prev, zip: _urlZip }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const areaLabel        = getAreaLabel(zip);
  const effectiveSize    = overrideSize || size;
  const isReturningQuick = customerType === "Returning" && returningPath === "quick";

  const recommendation = useMemo(() => getRecommendation(customerType, project, otherText), [customerType, project, otherText]);

  const stepLabel = {
    0:"Service Area", 1:"Customer Type", 2:"Path", 3:"Project Type",
    4: isReturningQuick ? "Size Selection" : "Best Fit",
    5:"Delivery Date", 6:"Contact Info"
  }[step];
  const visibleTotalSteps = isReturningQuick ? 6 : 7;
  const currentVisualStep = (() => {
    if (step===0) return 1; if (step===1) return 2; if (step===2) return 3;
    if (step===3) return 4; if (step===4) return isReturningQuick ? 4 : 5;
    if (step===5) return isReturningQuick ? 5 : 6;
    if (step===6) return isReturningQuick ? 6 : 7;
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

  // ── Exit intent logic ────────────────────────────────────────────────────

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

  // Idle timer — reset on any user interaction
  useEffect(() => {
    const events = ["touchstart", "touchmove", "mousedown", "mousemove", "keydown", "scroll"];
    events.forEach(e => window.addEventListener(e, resetIdleTimer, { passive:true }));
    resetIdleTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdleTimer));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  // History API back intercept — fires on browser back from Steps 5+
  useEffect(() => {
    if (step >= 5 && !historyPushedRef.current) {
      window.history.pushState({ funnelStep: step }, "");
      historyPushedRef.current = true;
    }

    const handlePopState = (e) => {
      if (stepRef.current >= 5) {
        // Push state again so back is intercepted again if modal dismissed
        window.history.pushState({ funnelStep: stepRef.current }, "");
        triggerExitModal();
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [step, triggerExitModal]);

  // Visibility change — tab switch / app switch on mobile
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        triggerExitModal();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [triggerExitModal]);

  // ── Exit modal handlers ─────────────────────────────────────────────────

  const handleExitModalDismiss = () => {
    setShowExitModal(false);
    setExitError("");
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
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
      contact: {
        name:   name || "",
        email:  "",
        phone:  phone,
        mobile: phone,
        source: "Exit Modal",
      },
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

  // ── X button handler ─────────────────────────────────────────────────────
  // NOTE: X button bypasses the exitTriggered guard intentionally.
  // triggerExitModal() will no-op if exitTriggered is already true (idle/back
  // already fired), so we force-show the modal directly here instead.
  const handleClose = () => {
    if (step >= 5) {
      if (!exitSubmitted && !submitted) {
        setShowExitModal(true);
      } else {
        window.location.href = HOMEPAGE;
      }
    } else {
      window.location.href = HOMEPAGE;
    }
  };

  // ── Form handlers ────────────────────────────────────────────────────────

  const handleZipSubmit = () => {
    const clean = zip.trim();
    if (!/^\d{5}$/.test(clean)) { setZipError("Please enter a valid 5-digit ZIP code."); return; }
    const found = zipToZone[clean];
    if (!found) { setZipError("We may not service that area right now. If you're nearby, contact us and we'll confirm."); return; }
    setZipError(""); setZoneKey(found); setZoneFee(zones[found].fee);
    setForm(prev => ({ ...prev, zip: clean }));
    setStep(1);
  };

  const handleCustomerType = (type) => {
    setCustomerType(type); setReturningPath(""); setProject(""); setOtherText("");
    setSize(""); setOverrideSize(""); setDuration(""); setSelectedPrice(null);
    setAvailabilityData(null); setAvailabilityLoading(false); setAvailabilityError(""); setSelectedWindow(null);
    setShowMoreDates({}); setShowConcreteNotice(false);
    setStep(type === "Returning" ? 2 : 3);
  };

  const handleReturningPath = (path) => {
    setReturningPath(path); setProject(""); setOtherText("");
    setSize(""); setOverrideSize(""); setDuration(""); setSelectedPrice(null);
    setAvailabilityData(null); setAvailabilityLoading(false); setAvailabilityError(""); setSelectedWindow(null);
    setShowMoreDates({});
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
    if (isReturningQuick) {
      setSize(""); setOverrideSize(sel); setDuration(""); setSelectedPrice(null);
      setAvailabilityData(null); setAvailabilityLoading(false); setAvailabilityError(""); setSelectedWindow(null);
      setTimeout(() => {
        setDuration(""); setSelectedPrice(null); setSelectedWindow(null);
        setAvailabilityData(null); setAvailabilityError(""); setAvailabilityLoading(true);
        setStep(5);
        fetch("/api/availability", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ size:sel }) })
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
      const res  = await fetch("/api/availability", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify({ size:effectiveSize }) });
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

  // ── Safety Net Soft Push ──
  const handlePhoneBlur = async () => {
    if (capturedLeadId) return; // already pushed, don't spam
    const cleanPhone = form.phone.trim();
    if (cleanPhone.length < 10) return; // wait for a real phone number

    const payload = {
      zip, areaLabel, zone:zoneKey, deliveryFee:zoneFee, customerType, returningPath,
      project:        normalizeProjectForOdoo(project),
      otherText:      project === "Other" ? otherText.trim() : "",
      recommendedSize: size,
      selectedSize:   effectiveSize,
      includedTons:   sizeMeta[effectiveSize]?.tons || null,
      rentalOption:   normalizeRentalOption(duration),
      rentalPrice:    selectedPrice,
      selectedWindow,
      funnelSource:   "rent_a_dumpster_funnel_partial",
      leadSourceName: "Website",
      contact: {
        name:   form.name.trim(),
        email:  form.email.trim(),
        phone:  cleanPhone,
        mobile: cleanPhone,
        source: form.source,
      },
    };

    try {
      const res = await fetch("/api/submit-lead", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
      const json = await res.json();
      if (json?.success && json?.leadId) {
        setCapturedLeadId(json.leadId);
      }
    } catch (err) {
      console.error("Soft push failed silently in background");
    }
  };

  // ── Final Checkout Push ──
  const handleSubmit = async () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) return alert("Please enter your name, email, and phone number.");
    setSubmitting(true); setSubmitError("");

    const payload = {
      leadId:         capturedLeadId, // Triggers the upsert if we caught them on blur!
      zip, areaLabel, zone:zoneKey, deliveryFee:zoneFee, customerType, returningPath,
      project:        normalizeProjectForOdoo(project),
      otherText:      project === "Other" ? otherText.trim() : "",
      recommendedSize: size,
      selectedSize:   effectiveSize,
      includedTons:   sizeMeta[effectiveSize]?.tons || null,
      rentalOption:   normalizeRentalOption(duration),
      rentalPrice:    selectedPrice,
      selectedWindow,
      pricingShown:   calculatedPrices,
      funnelSource:   "rent_a_dumpster_funnel",
      leadSourceName: "Website",
      smsOptIn,
      smsOptInDate:   smsOptIn ? new Date().toISOString() : null,
      contact: {
        name:   form.name.trim(),
        email:  form.email.trim(),
        phone:  form.phone.trim(),
        mobile: form.phone.trim(),
        source: form.source,
      },
    };

    try {
      // 1. Send the full payload to Odoo
      const resOdoo  = await fetch("/api/submit-lead", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(payload) });
      const odooJson = await resOdoo.json();
      if (!resOdoo.ok || !odooJson?.success) throw new Error(odooJson?.error || "Lead Submission failed.");

      const finalLeadId = odooJson.leadId || capturedLeadId;

      // 2. Prep the Stripe Checkout Payload
      const stripePayload = {
        leadId:        finalLeadId,
        customerEmail: form.email.trim(),
        customerName:  form.name.trim(),
        dumpsterSize:  effectiveSize,
        rentalOption:  getRentalDisplayLabel(duration),
        basePrice:     selectedPrice - zoneFee, // separate out the base price for the receipt
        deliveryFee:   zoneFee,
        zone:          zoneKey,
      };

      // 3. Request the Checkout Session URL
      const resStripe = await fetch("/api/create-checkout", { method:"POST", headers:{ "Content-Type":"application/json" }, body:JSON.stringify(stripePayload) });
      const stripeJson = await resStripe.json();
      if (!resStripe.ok || !stripeJson?.url) throw new Error(stripeJson?.error || "Stripe Checkout failed.");

      // 4. Redirect the user to pay
      window.location.href = stripeJson.url;

    } catch (err) {
      setSubmitError("Something went wrong preparing your checkout. Please try again or call us at 470-548-4733.");
      setSubmitting(false); // Only re-enable the button if it fails
    }
  };

  const goBack = () => {
    if (step===6) return setStep(5);
    if (step===5) return setStep(4);
    if (step===4) return isReturningQuick ? setStep(2) : setStep(3);
    if (step===3) return customerType === "Returning" ? setStep(2) : setStep(1);
    if (step===2) return setStep(1);
    if (step===1) return setStep(0);
  };

  const phoneHasValue = form.phone.trim().length > 0;

  const inputStyle = {
    display:"block", width:"100%", padding:"12px 14px",
    border:`1.5px solid ${C.surfaceBorder}`, borderRadius:10,
    background:C.white, fontSize:14, color:C.ink,
    boxSizing:"border-box", fontFamily:F,
  };
  const labelStyle = {
    display:"block", fontSize:10, fontWeight:700, color:C.inkFaint,
    letterSpacing:"0.8px", textTransform:"uppercase", marginBottom:5, marginTop:14, fontFamily:F,
  };
  const firstLabelStyle = { ...labelStyle, marginTop:0 };

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight:"100vh", background:C.pageBg, padding:"20px 16px 40px", fontFamily:F }}>

      {/* Exit submitted confirmation toast */}
      {exitSubmitted && (
        <div style={{
          position:"fixed", top:20, left:"50%", transform:"translateX(-50%)",
          background:C.ink, color:C.white, padding:"12px 24px", borderRadius:12,
          fontSize:14, fontWeight:700, zIndex:1100, fontFamily:F,
          boxShadow:"0 4px 16px rgba(0,0,0,0.2)",
        }}>
          ✓ We'll text you shortly!
        </div>
      )}

      {/* Exit modal */}
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

      <div style={{ maxWidth:800, margin:"0 auto" }}>

        {/* Header */}
        <header style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"12px 0 14px", marginBottom:16,
          borderBottom:`1px solid ${C.cardBorder}`,
        }}>
          <img src="/little-junkers-logo.png" alt="Little Junkers" style={{ maxWidth:130, height:"auto", display:"block" }} />
          <div style={{ display:"flex", alignItems:"center", gap:16 }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:10, fontWeight:700, color:C.inkFaint, letterSpacing:"0.8px", textTransform:"uppercase" }}>Peachtree City, GA</div>
              <a href="tel:4705484733" style={{ fontSize:16, fontWeight:900, color:C.ink, textDecoration:"none", fontFamily:F }}>470-548-4733</a>
            </div>
            {/* X close button — prominent, always visible */}
            <button
              onClick={handleClose}
              aria-label="Close"
              style={{
                width:40, height:40, borderRadius:"50%",
                background:C.surfaceBg, border:`1.5px solid ${C.surfaceBorder}`,
                display:"flex", alignItems:"center", justifyContent:"center",
                cursor:"pointer", flexShrink:0,
                fontSize:18, color:C.ink, fontWeight:700, lineHeight:1,
              }}
            >
              ✕
            </button>
          </div>
        </header>

        <main style={{
          background:C.cardBg, border:`1px solid ${C.cardBorder}`,
          borderRadius:16, overflow:"hidden",
          boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.05)",
        }}>

          {/* ── Step 0: ZIP ── */}
          {step === 0 && (
            <div>
              <div style={{ background:C.heroBg, padding:"28px 24px 24px", position:"relative" }}>
                <div style={{ position:"absolute", top:16, right:16, background:C.pink, color:C.heroBg, fontSize:10, fontWeight:800, padding:"4px 11px", borderRadius:99, letterSpacing:"0.4px" }}>
                  Serving South Atlanta
                </div>
                <div style={{ fontSize:10, fontWeight:700, color:C.heroAccent, letterSpacing:"1.4px", textTransform:"uppercase", marginBottom:8 }}>
                  Dumpster rental
                </div>
                <h1 style={{ margin:"0 0 4px", fontSize:28, fontWeight:900, color:C.white, letterSpacing:"-0.7px", lineHeight:1.1, fontFamily:F }}>
                  Check your<br />service area
                </h1>
              </div>
              <div style={{ padding:"20px 24px 4px" }}>
                <p style={{ margin:"0 0 18px", fontSize:14, color:C.inkMid, lineHeight:1.55, fontFamily:F }}>
                  Enter your ZIP and we'll verify coverage and show exact pricing for your location.
                </p>
                <div style={{ display:"flex", gap:10 }}>
                  <input
                    placeholder="5-digit ZIP" value={zip}
                    onChange={e => setZip(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleZipSubmit()}
                    maxLength={5}
                    style={{ ...inputStyle, flex:1, marginTop:0 }}
                  />
                  <button onClick={handleZipSubmit} style={{ padding:"12px 20px", background:C.ink, color:C.white, border:"none", borderRadius:10, fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:F, whiteSpace:"nowrap" }}>
                    Verify →
                  </button>
                </div>
                {zipError && <div style={{ marginTop:8, color:"#b3261e", fontSize:13, lineHeight:1.4, fontFamily:F }}>{zipError}</div>}
                <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginTop:14, marginBottom:20 }}>
                  {["Delivery included in pricing","Peachtree City & South Atlanta","¡Se habla español!"].map(t => (
                    <span key={t} style={{ fontSize:11, color:C.inkMuted, fontWeight:600, background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:99, padding:"4px 10px", fontFamily:F }}>{t}</span>
                  ))}
                </div>
              </div>
              <CardFooter />
            </div>
          )}

          {/* ── Steps 1-6 ── */}
          {step > 0 && (
            <div>
              <ProgressChrome
                currentVisualStep={currentVisualStep}
                visibleTotalSteps={visibleTotalSteps}
                stepLabel={stepLabel}
                progressPercent={progressPercent}
                onBack={goBack}
                showBack={true}
              />

              <CardBody>

                {/* Step 1 */}
                {step === 1 && (
                  <div>
                    <StepHeading
                      eyebrow="Coverage confirmed"
                      title="How can we help?"
                      text={`${areaLabel} is in our ${zones[zoneKey]?.label?.toLowerCase() || ""}. Delivery pricing will be built into the options we show you next.`}
                    />
                    <div style={{ display:"grid", gap:10 }}>
                      {[
                        { label:"New Customer",        sub:"First time renting with us"        },
                        { label:"Returning",           sub:"You've rented from us before"       },
                        { label:"Contractor / Roofer", sub:"Business or repeat jobsite use"     },
                      ].map(item => (
                        <OptionCard key={item.label} title={item.label} sub={item.sub} selected={customerType===item.label} onClick={() => handleCustomerType(item.label)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 2 */}
                {step === 2 && customerType === "Returning" && (
                  <div>
                    <StepHeading eyebrow="Welcome back" title="How do you want to proceed?" text="Move fast if you already know your size, or let us help match the best fit for this job." />
                    <div style={{ display:"grid", gap:10 }}>
                      <OptionCard title="Quick Select" sub="I know my size already"           selected={returningPath==="quick"}     onClick={() => handleReturningPath("quick")}     />
                      <OptionCard title="Guide Me"     sub="Help me size it for this project" selected={returningPath==="recommend"} onClick={() => handleReturningPath("recommend")} />
                    </div>
                  </div>
                )}

                {/* Step 3 */}
                {step === 3 && (
                  <div>
                    <StepHeading
                      eyebrow="Step 3"
                      title={(customerType==="Contractor" || customerType==="Contractor / Roofer") ? "What type of debris are you dealing with?" : customerType==="Returning" ? "What are you tossing this time?" : "What kind of cleanup are you tackling?"}
                      text={(customerType==="Contractor" || customerType==="Contractor / Roofer") ? "We'll filter out unsupported material and match the best container for the job." : "Choose the option closest to your current project so we can size it correctly."}
                    />
                    <div style={{ display:"grid", gap:10 }}>
                      {((customerType==="Contractor" || customerType==="Contractor / Roofer")
                        ? ["General Cleanup","Renovation / demo","Roofing","Concrete","Other"]
                        : ["Cleaning the garage / basement","Moving / decluttering","Renovation / demo","Other"]
                      ).map(type => (
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
                        <p style={{ margin:0, color:C.inkMid, lineHeight:1.5, fontSize:14 }}>We can still help with general cleanup, renovation debris, roofing, and other non-concrete projects.</p>
                        <button onClick={() => setShowConcreteNotice(false)} style={{ marginTop:12, padding:"9px 16px", background:C.ink, color:C.white, border:"none", borderRadius:10, cursor:"pointer", fontWeight:700, fontFamily:F, fontSize:13 }}>Got it</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4 */}
                {step === 4 && (
                  <div>
                    <StepHeading
                      eyebrow={isReturningQuick ? "Quick select" : "Based on your project"}
                      title={isReturningQuick ? "Choose your rental size" : "Best fit for your project"}
                      text={isReturningQuick ? "Select the size you want and we'll show rental options and pricing next." : "This is the strongest fit based on what you described."}
                    />

                    {!isReturningQuick && effectiveSize && (
                      <div style={{ display:"flex", gap:14, alignItems:"stretch", marginBottom:18, flexWrap:"wrap" }}>
                        <div
                          onClick={handleContinueFromStep4} role="button" tabIndex={0}
                          onKeyDown={e => e.key === "Enter" && handleContinueFromStep4()}
                          style={{ flex:"1 1 300px", background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:20, cursor:"pointer", transition:"border-color 150ms, box-shadow 150ms" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = C.ink; e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = C.surfaceBorder; e.currentTarget.style.boxShadow = "none"; }}
                        >
                          <div style={{ fontSize:36, fontWeight:900, color:C.ink, letterSpacing:"-1.5px", lineHeight:1, marginBottom:8, fontFamily:F }}>{effectiveSize}</div>
                          <div style={{ marginBottom:14 }}><TonnagePill label={sizeMeta[effectiveSize]?.label || ""} /></div>
                          <div style={{ fontSize:10, fontWeight:700, color:C.inkFaint, letterSpacing:"0.6px", textTransform:"uppercase", marginBottom:6, fontFamily:F }}>What this size holds</div>
                          <ul style={{ margin:"0 0 16px", paddingLeft:18, lineHeight:1.75, color:C.inkMid, fontSize:13, fontFamily:F }}>
                            {recommendation.holds.map(item => <li key={item}>{item}</li>)}
                          </ul>
                          <div style={{ background:C.white, border:`1px solid ${C.surfaceBorder}`, borderRadius:10, padding:"12px 14px" }}>
                            <div style={{ fontSize:10, fontWeight:800, color:C.inkFaint, letterSpacing:"0.7px", textTransform:"uppercase", marginBottom:6, fontFamily:F }}>Why this size</div>
                            <p style={{ margin:"0 0 6px", fontSize:13, lineHeight:1.55, color:C.ink, fontFamily:F }}>{recommendation.reason}</p>
                            <div style={{ fontSize:12, color:C.inkMuted, lineHeight:1.45, fontFamily:F }}>{recommendation.note}</div>
                          </div>
                          <div style={{ marginTop:14, fontSize:12, fontWeight:700, color:C.pinkText, fontFamily:F, textAlign:"center" }}>Tap to continue with {effectiveSize} →</div>
                        </div>
                        <div style={{ flex:"1 1 200px", display:"flex", flexDirection:"column", gap:12 }}>
                          <div style={{ background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:14, flex:1, display:"flex", alignItems:"center", justifyContent:"center", minHeight:160 }}>
                            <img src={DUMPSTER_IMAGES[effectiveSize]} alt={`${effectiveSize} dumpster`} style={{ width:"100%", maxWidth:260, height:"auto", objectFit:"contain", display:"block" }} />
                          </div>
                          <div style={{ background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:12, padding:"10px 14px" }}>
                            <div style={{ fontSize:10, fontWeight:700, color:C.inkFaint, letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:5, fontFamily:F }}>Container Footprint</div>
                            <div style={{ fontSize:13, color:C.ink, fontWeight:600, lineHeight:1.6, fontFamily:F }}>12' L × 7.5' W</div>
                            <div style={{ fontSize:13, color:C.ink, fontWeight:600, lineHeight:1.6, fontFamily:F }}>Height: {sizeMeta[effectiveSize]?.height || "-"}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {(customerType==="Contractor" || customerType==="Contractor / Roofer") && project==="Roofing" && (
                      <div style={{ background:C.warningBg, border:`1px solid ${C.warningBorder}`, borderRadius:12, padding:"12px 14px", color:C.ink, lineHeight:1.5, fontSize:13, marginBottom:16, fontFamily:F }}>
                        <strong>Roofing note:</strong> Roofing debris gets heavy quickly, so we bias smaller here to reduce overweight risk.
                      </div>
                    )}

                    {!isReturningQuick && effectiveSize && (
                      <PrimaryButton onClick={handleContinueFromStep4} style={{ marginTop:0, marginBottom:14 }}>
                        Continue with {effectiveSize}
                      </PrimaryButton>
                    )}

                    {!isReturningQuick && effectiveSize && (
                      <div style={{ marginBottom:8 }}>
                        <button
                          onClick={() => setShowComparison(v => !v)}
                          style={{ width:"100%", background:"none", border:`1px solid ${C.surfaceBorder}`, borderRadius:10, padding:"10px 16px", cursor:"pointer", fontFamily:F, display:"flex", justifyContent:"space-between", alignItems:"center" }}
                        >
                          <span style={{ fontSize:13, fontWeight:700, color:C.inkMid }}>{showComparison ? "Hide size comparison" : "Compare other sizes"}</span>
                          <span style={{ fontSize:14, color:C.inkMuted, lineHeight:1 }}>{showComparison ? "▲" : "▼"}</span>
                        </button>
                        {showComparison && (
                          <div style={{ background:C.white, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:18, marginTop:10 }}>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10 }}>
                              {allSizes.map(sizeKey => {
                                const isMatch    = sizeKey === size;
                                const isSelected = effectiveSize === sizeKey;
                                return (
                                  <div key={sizeKey} style={{ textAlign:"left", background: isSelected ? C.white : C.surfaceBg, border: isSelected ? `1.5px solid ${C.ink}` : `1px solid ${C.surfaceBorder}`, borderRadius:12, padding:14, fontFamily:F, boxShadow: isSelected ? "0 0 0 1px rgba(26,26,26,0.06)" : "none" }}>
                                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:10 }}>
                                      <div style={{ fontSize:17, fontWeight:900, color:C.ink, letterSpacing:"-0.4px", fontFamily:F }}>{sizeKey}</div>
                                      {isMatch && <span style={{ background:C.pinkBg, color:C.pinkText, border:`1px solid ${C.pinkBorder}`, fontSize:10, fontWeight:800, padding:"3px 8px", borderRadius:99, fontFamily:F }}>Best Fit</span>}
                                    </div>
                                    <div style={{ marginBottom:6 }}>
                                      <div style={{ fontSize:10, color:C.inkFaint, textTransform:"uppercase", letterSpacing:"0.4px", fontWeight:700, marginBottom:2 }}>Project Scale</div>
                                      <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{comparisonMeta[sizeKey].projectScale}</div>
                                    </div>
                                    <div style={{ marginBottom:6 }}>
                                      <div style={{ fontSize:10, color:C.inkFaint, textTransform:"uppercase", letterSpacing:"0.4px", fontWeight:700, marginBottom:2 }}>Truck Loads</div>
                                      <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{comparisonMeta[sizeKey].truckLoads}</div>
                                    </div>
                                    <div style={{ marginBottom:8 }}>
                                      <div style={{ fontSize:10, color:C.inkFaint, textTransform:"uppercase", letterSpacing:"0.4px", fontWeight:700, marginBottom:2 }}>Included Weight</div>
                                      <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>{sizeMeta[sizeKey].label}</div>
                                    </div>
                                    <div style={{ fontSize:12, color:C.inkMuted, lineHeight:1.4, marginBottom:10 }}>{comparisonMeta[sizeKey].bestUse}</div>
                                    {isSelected
                                      ? <div style={{ fontSize:12, fontWeight:800, color:C.ink }}>Selected</div>
                                      : <button onClick={() => handleSizeSelect(sizeKey)} style={{ width:"100%", padding:"9px", background:C.white, color:C.ink, border:`1px solid ${C.surfaceBorder}`, borderRadius:10, fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:F }}>Select</button>
                                    }
                                  </div>
                                );
                              })}
                            </div>
                            <PrimaryButton onClick={handleContinueFromStep4} style={{ marginTop:16 }}>Continue with {effectiveSize}</PrimaryButton>
                          </div>
                        )}
                      </div>
                    )}

                    {(isReturningQuick || !effectiveSize) && (
                      <div style={{ display:"grid", gap:10 }}>
                        {allSizes.map(sizeKey => {
                          const isSelected = effectiveSize === sizeKey;
                          return (
                            <button key={sizeKey} onClick={() => handleSizeSelect(sizeKey)} style={{ width:"100%", textAlign:"left", padding:"16px 18px", borderRadius:12, border: isSelected ? `1.5px solid ${C.ink}` : `1px solid ${C.surfaceBorder}`, background: isSelected ? C.white : C.surfaceBg, cursor:"pointer", fontFamily:F }}>
                              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                                <div>
                                  <div style={{ fontSize:16, fontWeight:800, color:C.ink }}>{sizeKey}</div>
                                  <div style={{ marginTop:3, fontSize:13, color:C.inkMuted, lineHeight:1.4 }}>{sizeMeta[sizeKey].short}</div>
                                </div>
                              </div>
                              <div style={{ marginTop:10, marginBottom:8 }}><TonnagePill label={sizeMeta[sizeKey].label} /></div>
                              <div style={{ fontSize:13, color:C.inkMuted, lineHeight:1.45 }}><strong style={{ color:C.ink }}>Best for:</strong> {sizeMeta[sizeKey].bestFor}</div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {(isReturningQuick || !effectiveSize) && <PrimaryButton onClick={handleContinueFromStep4}>Continue</PrimaryButton>}
                  </div>
                )}

                {/* Step 5 */}
                {step === 5 && (
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
                  />
                )}

                {/* Step 6 — success (Fallback only, normally redirects to Stripe) */}
               {step === 6 && !submitted && (
  <div>
    <StepHeading
      eyebrow="Almost done"
      title="Complete your booking"
      text="Enter your service address and contact details, then continue to secure checkout."
    />

    <div style={{ marginBottom: 18, border: `1px solid ${C.surfaceBorder}`, borderRadius: 14, overflow: "hidden" }}>
      <div
        style={{
          background: C.surfaceBg,
          padding: "9px 16px",
          fontSize: 10,
          fontWeight: 800,
          color: C.inkFaint,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
          fontFamily: F,
          borderBottom: `1px solid ${C.surfaceBorder}`,
        }}
      >
        Rental Summary
      </div>

      {[
        { label: "Service Area", value: areaLabel },
        { label: "Delivery", value: `${zones[zoneKey]?.label || ""} ${zoneFee > 0 ? `(+$${zoneFee})` : "— Included"}` },
        { label: "Dumpster", value: effectiveSize || "-" },
        { label: "Weight included", value: sizeMeta[effectiveSize]?.label || "-" },
        { label: "Rental", value: getRentalDisplayLabel(duration) },
        {
          label: "Delivery date",
          value: selectedWindow
            ? `${selectedWindow.startLabel} – ${selectedWindow.endLabel}`
            : isAvailabilityDegraded
              ? "Subject to confirmation"
              : "-",
        },
      ].map((row) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 16px",
            borderBottom: `1px solid ${C.surfaceBorder}`,
            fontFamily: F,
          }}
        >
          <span style={{ fontSize: 13, color: C.inkMuted }}>{row.label}</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, textAlign: "right" }}>{row.value}</span>
        </div>
      ))}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          background: C.surfaceBg,
          fontFamily: F,
        }}
      >
        <span style={{ fontSize: 13, color: C.inkMuted }}>Total</span>
        <span style={{ fontSize: 20, fontWeight: 900, color: C.ink, letterSpacing: "-0.4px" }}>
          {selectedPrice != null ? `$${selectedPrice}` : "-"}
        </span>
      </div>
    </div>

    <div
      style={{
        background: C.surfaceBg,
        border: `1px solid ${C.surfaceBorder}`,
        borderRadius: 14,
        padding: "18px 18px 6px",
      }}
    >
      <label style={firstLabelStyle}>Name *</label>
      <input
        placeholder="Your name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        style={inputStyle}
      />

      <label style={labelStyle}>Email *</label>
      <input
        placeholder="you@example.com"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        style={inputStyle}
      />

      <label style={labelStyle}>Phone *</label>
      <input
        placeholder="For faster scheduling"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        onBlur={handlePhoneBlur}
        type="tel"
        style={inputStyle}
      />

      {form.phone.trim().length > 0 && (
        <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, marginBottom: 6, fontFamily: F }}>
          <input
            type="checkbox"
            checked={smsOptIn}
            onChange={(e) => setSmsOptIn(e.target.checked)}
            style={{ marginTop: 3 }}
          />
          <span style={{ fontSize: 13, color: C.inkMid, lineHeight: 1.45 }}>
            I agree to receive text messages from Little Junkers about my quote and rental.
          </span>
        </label>
      )}

      <label style={labelStyle}>Service address *</label>
      <input
        placeholder="Street address"
        value={form.street}
        onChange={(e) => setForm({ ...form, street: e.target.value })}
        style={inputStyle}
      />

      <label style={labelStyle}>Apt / Suite</label>
      <input
        placeholder="Apartment, suite, gate code, etc. (optional)"
        value={form.street2}
        onChange={(e) => setForm({ ...form, street2: e.target.value })}
        style={inputStyle}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 0.8fr", gap: 10, marginTop: 14 }}>
        <div>
          <label style={firstLabelStyle}>City *</label>
          <input
            placeholder="City"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div>
          <label style={firstLabelStyle}>State *</label>
          <select
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value })}
            style={inputStyle}
          >
            <option value="GA">GA</option>
          </select>
        </div>

        <div>
          <label style={firstLabelStyle}>ZIP *</label>
          <input
            placeholder="ZIP"
            value={form.zip}
            readOnly
            style={{ ...inputStyle, background: C.surfaceBg, color: C.inkMuted, cursor: "not-allowed" }}
          />
        </div>
      </div>

      <label style={labelStyle}>How did you hear about us?</label>
      <select
        value={form.source}
        onChange={(e) => setForm({ ...form, source: e.target.value })}
        style={{ ...inputStyle, marginBottom: 18 }}
      >
        <option value="">Select one</option>
        <option>Google</option>
        <option>Facebook</option>
        <option>Referral</option>
        <option>Repeat Customer</option>
        <option>Yard Sign</option>
        <option>Saw a Dumpster / Truck</option>
        <option>Other</option>
      </select>
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
          fontFamily: F,
        }}
      >
        {submitError}
      </div>
    )}

    <PrimaryButton onClick={handleSubmit} disabled={submitting}>
      {submitting ? "Preparing Checkout..." : "Proceed to Checkout"}
    </PrimaryButton>
  </div>
)}

              </CardBody>
              <CardFooter />
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
