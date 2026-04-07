import { useMemo, useState } from "react";

const C = {
  // Page
  pageBg:        "#edeae4",
  // Card
  cardBg:        "#ffffff",
  cardBorder:    "#e5e0d8",
  // Hero band (step 0)
  heroBg:        "#1e1c19",
  heroAccent:    "#ffcee4",
  // Surfaces
  surfaceBg:     "#faf8f5",
  surfaceBorder: "#e8e3db",
  // Text
  ink:           "#1a1a1a",
  inkMid:        "#555555",
  inkMuted:      "#999999",
  inkFaint:      "#b8b0a6",
  // Pink accent
  pink:          "#ffcee4",
  pinkBar:       "#ffb3d4",
  pinkText:      "#c2587a",
  pinkBg:        "#fff5fb",
  pinkBorder:    "#ffd6eb",
  // Status
  warningBg:     "#fff8eb",
  warningBorder: "#f2cf7a",
  white:         "#ffffff",
};

const F = "system-ui, -apple-system, sans-serif";

// ─── data (unchanged) ────────────────────────────────────────────────────────

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
  "11 Yard": { tons:1,   label:"Includes 1 ton",     bestFor:"Small cleanouts, garage/basement jobs, weight-conscious loads", short:"Best for smaller jobs and heavier debris control", height:"3.5'" },
  "16 Yard": { tons:1.5, label:"Includes 1.5 tons",  bestFor:"Moving, decluttering, mixed cleanup, all-around use",           short:"Best all-around option for most mixed projects",    height:"4.5'" },
  "21 Yard": { tons:2,   label:"Includes 2 tons",    bestFor:"Renovation, demo, bulky cleanouts, larger jobs",                short:"Best for bigger projects with more volume",         height:"6'"   },
};

const comparisonMeta = {
  "11 Yard": { truckLoads:"4–5 pickup loads",  projectScale:"Small",  bestUse:"Garage cleanouts, roofing, dense debris"   },
  "16 Yard": { truckLoads:"6–7 pickup loads",  projectScale:"Medium", bestUse:"Moving, decluttering, mixed cleanup"        },
  "21 Yard": { truckLoads:"8–10 pickup loads", projectScale:"Large",  bestUse:"Renovation, demo, bulky cleanouts"          },
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
  { key:"Early Bird",      label:"Early Bird",      sub:"(Mon–Tue Delivery) Best Price", tag:"Best Value"   },
  { key:"Weekend Warrior", label:"Weekend Warrior", sub:"(Fri–Mon) Most Popular",        tag:"Most Popular", highlight:true },
  { key:"Base Rental",     label:"Base Rental",     sub:"2-Day Rental",                  tag:"Quick Job"    },
  { key:"Full Reset",      label:"Full Reset",      sub:"7-Day Rental",                  tag:"Big Project"  },
];

const allSizes = ["11 Yard", "16 Yard", "21 Yard"];

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function getRecommendation(customerType, project, otherText = "") {
  const o = String(otherText || "").toLowerCase();
  if (customerType === "Contractor") {
    if (project === "Roofing")          return { size:"11 Yard", holds:["Approx. 30 squares of single-layer shingles","Approx. 4-5 pickup truck loads of debris","Heavy roofing material with safer weight control"],    reason:"Roofing materials are deceptively heavy. We recommend the 11-Yard to keep the load within a safer lifting range and reduce overweight risk.",       note:"For larger tear-offs, two smaller loads are often better than one overweight container with added overage costs." };
    if (project === "Renovation / demo") return { size:"21 Yard", holds:["Larger renovation and demo loads","Approx. 8-10 pickup truck loads","Bulky debris that builds fast on jobsites"],                              reason:"Contractor demo jobs usually generate more volume and bulk than expected, so the 21-Yard is the better operational starting point.",                  note:"This gives your crew more working room up front and reduces the chance of needing an early swap." };
    if (project === "General Cleanup")  return { size:"16 Yard", holds:["General contractor cleanup and mixed debris","Approx. 6-7 pickup truck loads","Day-to-day jobsite volume without oversizing"],                  reason:"For mixed contractor cleanup, the 16-Yard is the strongest all-around fit because it balances usable capacity and fast turnaround.",                  note:"It handles a broad mix of material without jumping straight to the biggest box." };
    if (project === "Other") {
      if (containsHeavyKeywords(o))     return { size:"21 Yard", holds:["Heavier or bulkier contractor debris","Approx. 8-10 pickup truck loads","Projects likely to expand once work begins"],                          reason:"Based on what you described, this sounds more like a bulk-heavy contractor load that benefits from extra volume.",                                   note:"The 21-Yard gives more room to work and reduces the risk of under-ordering." };
      return                                   { size:"16 Yard", holds:["Mixed contractor debris","Approx. 6-7 pickup truck loads","Flexible jobsite cleanup where scope is still moving"],                              reason:"When contractor debris is mixed or unclear, the 16-Yard is the safest all-around recommendation.",                                                   note:"It gives you flexibility without overshooting the project size too early." };
    }
    return                                     { size:"16 Yard", holds:["General contractor debris","Approx. 6-7 pickup truck loads","A practical everyday jobsite starting point"],                                     reason:"The 16-Yard is the strongest contractor default for mixed cleanup and repeat jobsite use.",                                                           note:"It gives enough room for most common loads while staying efficient to turn." };
  }
  if (project === "Cleaning the garage / basement") return { size:"11 Yard", holds:["Garage and basement cleanouts","Approx. 4-5 pickup truck loads","Smaller household junk and boxed material"],                     reason:"Garage and basement cleanouts are often a strong fit for the 11-Yard when the job is mostly household junk and smaller items.",                        note:"If the project grows into furniture, multiple rooms, or bulkier material, the 16-Yard becomes the safer step up." };
  if (project === "Moving / decluttering")          return { size:"16 Yard", holds:["Moving and decluttering projects","Approx. 6-7 pickup truck loads","A broader mix of furniture, boxes, and overflow"],            reason:"Moving and decluttering projects usually expand once you start pulling things out, so the 16-Yard gives more breathing room.",                         note:"It is the strongest all-around fit for mixed household volume without overcommitting to the largest size." };
  if (project === "Renovation / demo")              return { size:"21 Yard", holds:["Renovation and demo debris","Approx. 8-10 pickup truck loads","Bulky material that builds fast during active work"],               reason:"Renovation and demo projects create more volume and bulk, so the 21-Yard is the safer recommendation for keeping the project moving.",                  note:"It reduces the chance of running out of space mid-project and needing another haul sooner than expected." };
  if (project === "Roofing")                        return { size:"11 Yard", holds:["Smaller roofing tear-offs","Approx. 4-5 pickup truck loads of shingles","Heavy debris with better weight control"],               reason:"Roofing debris gets heavy fast, so starting smaller is the safer move for weight control and pickup safety.",                                          note:"We would rather steer you into a safer fit than a larger box that becomes overweight and costly." };
  if (project === "Other") {
    if (containsHeavyKeywords(o))                   return { size:"21 Yard", holds:["Heavier or bulkier mixed debris","Approx. 8-10 pickup truck loads","Projects that sound more renovation-driven"],                  reason:"What you described sounds heavier, bulkier, or more demo-oriented, so the 21-Yard is the safer recommendation.",                                       note:"That gives you more room if the project expands once you get started." };
    if (containsLightKeywords(o))                   return { size:"11 Yard", holds:["Lighter household cleanup","Approx. 4-5 pickup truck loads","Smaller-volume junk where weight stays manageable"],                  reason:"What you described sounds more like a lighter cleanout, which often fits well in the 11-Yard.",                                                         note:"If the scope grows once you start, the 16-Yard is the next safer step up." };
    return                                                 { size:"16 Yard", holds:["Mixed cleanup jobs","Approx. 6-7 pickup truck loads","Projects where the final debris mix is still unclear"],                       reason:"When a project is mixed or unclear, the 16-Yard is usually the safest recommendation because it gives flexibility without overshooting too much.",        note:"It is the most balanced starting point for uncertain jobs." };
  }
  return { size:"16 Yard", holds:["Mixed cleanup jobs","Approx. 6-7 pickup truck loads","A practical all-around fit for household projects"], reason:"The 16-Yard is a strong all-around default for mixed cleanup and household projects.", note:"It gives more room than the smallest option without going oversized." };
}

// ─── sub-components ──────────────────────────────────────────────────────────

function ProgressChrome({ currentVisualStep, visibleTotalSteps, stepLabel, progressPercent, onBack, showBack }) {
  return (
    <div style={{ borderBottom: `1px solid ${C.surfaceBorder}`, marginBottom: 0 }}>
      {/* Step meta row */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 24px 0", fontFamily:F }}>
        <span style={{ fontSize:11, fontWeight:700, color:C.inkFaint, letterSpacing:"0.3px" }}>
          Step {currentVisualStep} of {visibleTotalSteps}
        </span>
        <span style={{ fontSize:11, fontWeight:700, color:C.ink }}>
          {stepLabel}
        </span>
      </div>
      {/* Bar */}
      <div style={{ padding:"8px 24px 12px" }}>
        <div style={{ height:3, background:C.surfaceBorder, borderRadius:99, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${progressPercent}%`, background:C.pinkBar, borderRadius:99, transition:"width 300ms ease" }} />
        </div>
      </div>
      {/* Back */}
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

function PrimaryButton({ onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        display:"block", width:"100%", padding:"15px",
        background:C.ink, color:C.white, border:"none",
        borderRadius:12, fontSize:15, fontWeight:800,
        cursor:"pointer", fontFamily:F, letterSpacing:"0.1px",
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
      <span style={{ fontSize:11, fontWeight:700, color:C.inkFaint, fontFamily:F, letterSpacing:"0.3px" }}>Little Junkers LLC</span>
      <a href="tel:4708136270" style={{ fontSize:14, fontWeight:900, color:C.ink, textDecoration:"none", fontFamily:F }}>470-813-6270</a>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function Funnel() {
  const [step,               setStep]               = useState(0);
  const [zip,                setZip]                = useState("");
  const [zipError,           setZipError]           = useState("");
  const [zoneKey,            setZoneKey]            = useState("");
  const [zoneFee,            setZoneFee]            = useState(0);
  const [customerType,       setCustomerType]       = useState("");
  const [returningPath,      setReturningPath]      = useState("");
  const [project,            setProject]            = useState("");
  const [otherText,          setOtherText]          = useState("");
  const [showConcreteNotice, setShowConcreteNotice] = useState(false);
  const [size,               setSize]               = useState("");
  const [overrideSize,       setOverrideSize]       = useState("");
  const [duration,           setDuration]           = useState("");
  const [selectedPrice,      setSelectedPrice]      = useState(null);
  const [showComparison,     setShowComparison]     = useState(false);
  const [form,               setForm]               = useState({ name:"", email:"", phone:"", source:"" });

  const areaLabel      = getAreaLabel(zip);
  const effectiveSize  = overrideSize || size;
  const isReturningQuick = customerType === "Returning" && returningPath === "quick";

  const recommendation = useMemo(() => getRecommendation(customerType, project, otherText), [customerType, project, otherText]);

  const stepLabel = { 0:"Service Area", 1:"Customer Type", 2:"Path", 3:"Project Type", 4:isReturningQuick?"Size Selection":"Best Fit", 5:"Rental Option", 6:"Contact Info" }[step];
  const visibleTotalSteps = isReturningQuick ? 6 : 7;
  const currentVisualStep = (() => {
    if (step===0) return 1; if (step===1) return 2; if (step===2) return 3;
    if (step===3) return 4; if (step===4) return isReturningQuick?4:5;
    if (step===5) return isReturningQuick?5:6; if (step===6) return isReturningQuick?6:7;
    return 1;
  })();
  const progressPercent = (currentVisualStep / visibleTotalSteps) * 100;

  const calculatedPrices = useMemo(() => {
    if (!effectiveSize || !basePricing[effectiveSize]) return {};
    const p = {};
    Object.entries(basePricing[effectiveSize]).forEach(([k, v]) => { p[k] = v + zoneFee; });
    return p;
  }, [effectiveSize, zoneFee]);

  // ── handlers (unchanged logic) ──
  const handleZipSubmit = () => {
    const clean = zip.trim();
    if (!/^\d{5}$/.test(clean)) { setZipError("Please enter a valid 5-digit ZIP code."); return; }
    const found = zipToZone[clean];
    if (!found) { setZipError("We may not service that area right now. If you're nearby, contact us and we'll confirm."); return; }
    setZipError(""); setZoneKey(found); setZoneFee(zones[found].fee); setStep(1);
  };

  const handleCustomerType = (type) => {
    setCustomerType(type); setReturningPath(""); setProject(""); setOtherText("");
    setSize(""); setOverrideSize(""); setDuration(""); setSelectedPrice(null); setShowConcreteNotice(false);
    setStep(type === "Returning" ? 2 : 3);
  };

  const handleReturningPath = (path) => {
    setReturningPath(path); setProject(""); setOtherText("");
    setSize(""); setOverrideSize(""); setDuration(""); setSelectedPrice(null);
    setStep(path === "quick" ? 4 : 3);
  };

  const handleProject = (sel) => {
    if (customerType === "Contractor" && sel === "Concrete") { setShowConcreteNotice(true); return; }
    setProject(sel);
    const reco = getRecommendation(customerType, sel, otherText);
    setSize(reco.size); setOverrideSize(""); setShowComparison(false); setStep(4);
  };

  const handleOtherContinue = () => {
    const reco = getRecommendation(customerType, "Other", otherText);
    setSize(reco.size); setOverrideSize(""); setShowComparison(false); setStep(4);
  };

  const handleSizeSelect = (sel) => {
    if (isReturningQuick) { setSize(""); setOverrideSize(sel); return; }
    setOverrideSize(sel === size ? "" : sel);
  };

  const handleContinueFromStep4 = () => {
    if (!effectiveSize) return alert("Please choose a dumpster size.");
    setStep(5);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim()) return alert("Please enter your name and email.");
    const payload = {
      zip, areaLabel, zone:zoneKey, deliveryFee:zoneFee, customerType, returningPath,
      project, otherText, recommendedSize:size, selectedSize:effectiveSize,
      includedTons:sizeMeta[effectiveSize]?.tons||null, rentalOption:duration,
      rentalPrice:selectedPrice, pricingShown:calculatedPrices, contact:form,
    };
    console.log(payload);
    alert("Lead captured (next step: Odoo)");
  };

  const goBack = () => {
    if (step===6) return setStep(5); if (step===5) return setStep(4);
    if (step===4) return isReturningQuick?setStep(2):setStep(3);
    if (step===3) return customerType==="Returning"?setStep(2):setStep(1);
    if (step===2) return setStep(1); if (step===1) return setStep(0);
  };

  // ── shared input / label styles ──
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

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:C.pageBg, padding:"20px 16px 40px", fontFamily:F }}>
      <div style={{ maxWidth:800, margin:"0 auto" }}>

        {/* ── HEADER ── */}
        <header style={{
          display:"flex", justifyContent:"space-between", alignItems:"center",
          padding:"12px 0 14px", marginBottom:16,
          borderBottom:`1px solid ${C.cardBorder}`,
        }}>
          <div>
            <img src="/little-junkers-logo.png" alt="Little Junkers" style={{ maxWidth:130, height:"auto", display:"block" }} />
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:10, fontWeight:700, color:C.inkFaint, letterSpacing:"0.8px", textTransform:"uppercase" }}>Peachtree City, GA</div>
            <a href="tel:4708136270" style={{ fontSize:16, fontWeight:900, color:C.ink, textDecoration:"none", fontFamily:F }}>470-813-6270</a>
          </div>
        </header>

        {/* ── MAIN CARD ── */}
        <main style={{
          background:C.cardBg,
          border:`1px solid ${C.cardBorder}`,
          borderRadius:16,
          overflow:"hidden",
          boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.05)",
        }}>

          {/* ── STEP 0: HERO ENTRY ── */}
          {step === 0 && (
            <div>
              {/* Dark hero band */}
              <div style={{
                background:C.heroBg,
                padding:"28px 24px 24px",
                position:"relative",
              }}>
                <div style={{
                  position:"absolute", top:16, right:16,
                  background:C.pink, color:C.heroBg,
                  fontSize:10, fontWeight:800, padding:"4px 11px",
                  borderRadius:99, letterSpacing:"0.4px",
                }}>
                  Serving South Atlanta
                </div>
                <div style={{ fontSize:10, fontWeight:700, color:C.heroAccent, letterSpacing:"1.4px", textTransform:"uppercase", marginBottom:8 }}>
                  Dumpster rental
                </div>
                <h1 style={{ margin:"0 0 4px", fontSize:28, fontWeight:900, color:C.white, letterSpacing:"-0.7px", lineHeight:1.1, fontFamily:F }}>
                  Check your<br />service area
                </h1>
              </div>

              {/* Form body */}
              <div style={{ padding:"20px 24px 4px" }}>
                <p style={{ margin:"0 0 18px", fontSize:14, color:C.inkMid, lineHeight:1.55, fontFamily:F }}>
                  Enter your ZIP and we'll verify coverage and show exact pricing for your location.
                </p>
                <div style={{ display:"flex", gap:10 }}>
                  <input
                    placeholder="5-digit ZIP"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleZipSubmit()}
                    maxLength={5}
                    style={{ ...inputStyle, flex:1, marginTop:0 }}
                  />
                  <button
                    onClick={handleZipSubmit}
                    style={{
                      padding:"12px 20px", background:C.ink, color:C.white,
                      border:"none", borderRadius:10, fontSize:14, fontWeight:800,
                      cursor:"pointer", fontFamily:F, whiteSpace:"nowrap",
                    }}
                  >
                    Verify →
                  </button>
                </div>
                {zipError && <div style={{ marginTop:8, color:"#b3261e", fontSize:13, lineHeight:1.4, fontFamily:F }}>{zipError}</div>}

                {/* Trust chips */}
                <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginTop:14, marginBottom:20 }}>
                  {["Delivery included in pricing","Peachtree City & South Atlanta","¡Se habla español!"].map(t => (
                    <span key={t} style={{ fontSize:11, color:C.inkMuted, fontWeight:600, background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:99, padding:"4px 10px", fontFamily:F }}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <CardFooter />
            </div>
          )}

          {/* ── STEPS 1–6: Standard chrome + content ── */}
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

                {/* STEP 1 */}
                {step === 1 && (
                  <div>
                    <StepHeading
                      eyebrow="Coverage confirmed"
                      title="How can we help?"
                      text={`${areaLabel} is in our ${zones[zoneKey]?.label?.toLowerCase() || ""}. Delivery pricing will be built into the options we show you next.`}
                    />
                    <div style={{ display:"grid", gap:10 }}>
                      {[
                        { label:"New Customer",  sub:"First time renting with us"        },
                        { label:"Returning",     sub:"You've rented from us before"       },
                        { label:"Contractor",    sub:"Business or repeat jobsite use"     },
                      ].map(item => (
                        <OptionCard key={item.label} title={item.label} sub={item.sub} selected={customerType===item.label} onClick={() => handleCustomerType(item.label)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* STEP 2 */}
                {step === 2 && customerType === "Returning" && (
                  <div>
                    <StepHeading
                      eyebrow="Welcome back"
                      title="How do you want to proceed?"
                      text="Move fast if you already know your size, or let us help match the best fit for this job."
                    />
                    <div style={{ display:"grid", gap:10 }}>
                      <OptionCard title="Quick Select" sub="I know my size already"              selected={returningPath==="quick"}     onClick={() => handleReturningPath("quick")}     />
                      <OptionCard title="Guide Me"     sub="Help me size it for this project"    selected={returningPath==="recommend"} onClick={() => handleReturningPath("recommend")} />
                    </div>
                  </div>
                )}

                {/* STEP 3 */}
                {step === 3 && (
                  <div>
                    <StepHeading
                      eyebrow="Step 3"
                      title={customerType==="Contractor" ? "What type of debris are you dealing with?" : customerType==="Returning" ? "What are you tossing this time?" : "What kind of cleanup are you tackling?"}
                      text={customerType==="Contractor" ? "We'll filter out unsupported material and match the best container for the job." : "Choose the option closest to your current project so we can size it correctly."}
                    />
                    <div style={{ display:"grid", gap:10 }}>
                      {(customerType==="Contractor"
                        ? ["General Cleanup","Renovation / demo","Roofing","Concrete","Other"]
                        : ["Cleaning the garage / basement","Moving / decluttering","Renovation / demo","Roofing","Other"]
                      ).map(type => (
                        <OptionCard key={type} title={type} selected={project===type} onClick={() => type==="Other" ? setProject("Other") : handleProject(type)} />
                      ))}
                    </div>

                    {project === "Other" && (
                      <div style={{ marginTop:16 }}>
                        <label style={firstLabelStyle}>Tell us a little more</label>
                        <textarea
                          value={otherText}
                          onChange={e => setOtherText(e.target.value)}
                          placeholder="Describe your project..."
                          style={{ ...inputStyle, minHeight:90, resize:"vertical" }}
                        />
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

                {/* STEP 4 */}
                {step === 4 && (
                  <div>
                    <StepHeading
                      eyebrow={isReturningQuick ? "Quick select" : "Based on your project"}
                      title={isReturningQuick ? "Choose your rental size" : "Best fit for your project"}
                      text={isReturningQuick ? "Select the size you want and we'll show rental options and pricing next." : "This is the strongest fit based on what you described."}
                    />

                    {/* Recommendation split pane */}
                    {!isReturningQuick && effectiveSize && (
                      <div style={{ display:"flex", gap:14, alignItems:"stretch", marginBottom:18, flexWrap:"wrap" }}>
                        {/* Left: logic */}
                        <div style={{ flex:"1 1 300px", background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:20 }}>
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
                        </div>
                        {/* Right: visual */}
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

                    {/* Roofing note */}
                    {customerType==="Contractor" && project==="Roofing" && (
                      <div style={{ background:C.warningBg, border:`1px solid ${C.warningBorder}`, borderRadius:12, padding:"12px 14px", color:C.ink, lineHeight:1.5, fontSize:13, marginBottom:16, fontFamily:F }}>
                        <strong>Roofing note:</strong> Roofing debris gets heavy quickly, so we bias smaller here to reduce overweight risk.
                      </div>
                    )}

                    {/* Continue — always visible, above comparison */}
                    {!isReturningQuick && effectiveSize && (
                      <PrimaryButton onClick={handleContinueFromStep4} style={{ marginTop:0, marginBottom:14 }}>
                        Continue with {effectiveSize}
                      </PrimaryButton>
                    )}

                    {/* Collapsible comparison */}
                    {!isReturningQuick && effectiveSize && (
                      <div style={{ marginBottom:8 }}>
                        <button
                          onClick={() => setShowComparison(v => !v)}
                          style={{
                            width:"100%", background:"none", border:`1px solid ${C.surfaceBorder}`,
                            borderRadius:10, padding:"10px 16px", cursor:"pointer", fontFamily:F,
                            display:"flex", justifyContent:"space-between", alignItems:"center",
                          }}
                        >
                          <span style={{ fontSize:13, fontWeight:700, color:C.inkMid }}>
                            {showComparison ? "Hide size comparison" : "Compare other sizes"}
                          </span>
                          <span style={{ fontSize:14, color:C.inkMuted, lineHeight:1 }}>
                            {showComparison ? "▲" : "▼"}
                          </span>
                        </button>

                        {showComparison && (
                          <div style={{ background:C.white, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:18, marginTop:10 }}>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:10 }}>
                              {allSizes.map(sizeKey => {
                                const isMatch    = sizeKey === size;
                                const isSelected = effectiveSize === sizeKey;
                                return (
                                  <div key={sizeKey} style={{
                                    textAlign:"left", background: isSelected ? C.white : C.surfaceBg,
                                    border: isSelected ? `1.5px solid ${C.ink}` : `1px solid ${C.surfaceBorder}`,
                                    borderRadius:12, padding:14, fontFamily:F,
                                    boxShadow: isSelected ? "0 0 0 1px rgba(26,26,26,0.06)" : "none",
                                  }}>
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
                            {/* Secondary continue after comparing */}
                            <PrimaryButton onClick={handleContinueFromStep4} style={{ marginTop:16 }}>
                              Continue with {effectiveSize}
                            </PrimaryButton>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Quick select grid */}
                    {(isReturningQuick || !effectiveSize) && (
                      <div style={{ display:"grid", gap:10 }}>
                        {allSizes.map(sizeKey => {
                          const isSelected = effectiveSize === sizeKey;
                          return (
                            <button key={sizeKey} onClick={() => handleSizeSelect(sizeKey)} style={{
                              width:"100%", textAlign:"left", padding:"16px 18px", borderRadius:12,
                              border: isSelected ? `1.5px solid ${C.ink}` : `1px solid ${C.surfaceBorder}`,
                              background: isSelected ? C.white : C.surfaceBg,
                              cursor:"pointer", fontFamily:F,
                            }}>
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

                    {/* Continue for quick-select / no-size path */}
                    {(isReturningQuick || !effectiveSize) && (
                      <PrimaryButton onClick={handleContinueFromStep4}>Continue</PrimaryButton>
                    )}
                  </div>
                )}

                {/* STEP 5 */}
                {step === 5 && (
                  <div>
                    <StepHeading
                      eyebrow="Choose your rental"
                      title="Select your rental option"
                      text={`Pricing below includes delivery to the ${areaLabel}. ${sizeMeta[effectiveSize]?.label || ""}.`}
                    />
                    {/* Size strip */}
                    <div style={{ marginBottom:16, background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", gap:12 }}>
                      <div>
                        <div style={{ fontSize:10, fontWeight:700, color:C.inkFaint, textTransform:"uppercase", letterSpacing:"0.5px", fontFamily:F }}>Selected Dumpster</div>
                        <div style={{ fontSize:20, fontWeight:900, color:C.ink, marginTop:2, fontFamily:F }}>{effectiveSize}</div>
                      </div>
                      <TonnagePill label={sizeMeta[effectiveSize]?.label || ""} />
                    </div>
                    <div style={{ display:"grid", gap:10 }}>
                      {rentalOptions.map(option => {
                        const displayPrice = calculatedPrices[option.key];
                        return (
                          <button
                            key={option.key}
                            onClick={() => { setDuration(option.label); setSelectedPrice(calculatedPrices[option.key] ?? null); setStep(6); }}
                            style={{
                              width:"100%", textAlign:"left", padding:"16px 18px",
                              borderRadius:12, cursor:"pointer", fontFamily:F,
                              border: option.highlight ? `1.5px solid ${C.ink}` : `1px solid ${C.surfaceBorder}`,
                              background: option.highlight ? C.white : C.surfaceBg,
                              boxShadow: option.highlight ? "0 2px 8px rgba(0,0,0,0.04)" : "none",
                            }}
                          >
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:10 }}>
                              <div>
                                <div style={{ fontSize:16, fontWeight:800, color:C.ink, fontFamily:F }}>{option.label}</div>
                                <div style={{ marginTop:2, fontSize:13, color:C.inkMuted, fontFamily:F }}>{option.sub}</div>
                                <div style={{ marginTop:8, fontSize:22, fontWeight:900, color:C.ink, fontFamily:F, letterSpacing:"-0.5px" }}>
                                  {typeof displayPrice === "number" ? `$${displayPrice}` : "Pricing unavailable"}
                                </div>
                                <div style={{ marginTop:2, fontSize:12, color:C.inkMuted, fontFamily:F }}>
                                  Includes delivery + {sizeMeta[effectiveSize]?.label?.toLowerCase()}
                                </div>
                              </div>
                              {option.tag && (
                                <span style={{ background:C.pinkBg, color:C.pinkText, border:`1px solid ${C.pinkBorder}`, fontSize:11, fontWeight:800, padding:"3px 9px", borderRadius:99, whiteSpace:"nowrap", fontFamily:F }}>
                                  {option.tag}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* STEP 6 */}
                {step === 6 && (
                  <div>
                    <StepHeading
                      eyebrow="Almost done"
                      title="Submit your request"
                      text="We'll use this information to confirm availability and finalize your rental."
                    />

                    {/* Summary table */}
                    <div style={{ marginBottom:18, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, overflow:"hidden" }}>
                      <div style={{ background:C.surfaceBg, padding:"9px 16px", fontSize:10, fontWeight:800, color:C.inkFaint, letterSpacing:"0.8px", textTransform:"uppercase", fontFamily:F, borderBottom:`1px solid ${C.surfaceBorder}` }}>
                        Rental Summary
                      </div>
                      {[
                        { label:"Service Area",    value: areaLabel },
                        { label:"Delivery",        value: `${zones[zoneKey]?.label || ""} ${zoneFee > 0 ? `(+$${zoneFee})` : "— Included"}` },
                        { label:"Dumpster",        value: effectiveSize || "-" },
                        { label:"Weight included", value: sizeMeta[effectiveSize]?.label || "-" },
                        { label:"Rental",          value: duration || "-" },
                      ].map(row => (
                        <div key={row.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", borderBottom:`1px solid ${C.surfaceBorder}`, fontFamily:F }}>
                          <span style={{ fontSize:13, color:C.inkMuted }}>{row.label}</span>
                          <span style={{ fontSize:13, fontWeight:700, color:C.ink }}>{row.value}</span>
                        </div>
                      ))}
                      {/* Price row — highlighted */}
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 16px", background:C.surfaceBg, fontFamily:F }}>
                        <span style={{ fontSize:13, color:C.inkMuted }}>Total</span>
                        <span style={{ fontSize:20, fontWeight:900, color:C.ink, letterSpacing:"-0.4px" }}>
                          {selectedPrice != null ? `$${selectedPrice}` : "-"}
                        </span>
                      </div>
                    </div>

                    {/* Contact form */}
                    <div style={{ background:C.surfaceBg, border:`1px solid ${C.surfaceBorder}`, borderRadius:14, padding:"18px 18px 6px" }}>
                      <label style={firstLabelStyle}>Name *</label>
                      <input placeholder="Your name"           value={form.name}   onChange={e => setForm({...form, name:e.target.value})}   style={inputStyle} />
                      <label style={labelStyle}>Email *</label>
                      <input placeholder="you@example.com"     value={form.email}  onChange={e => setForm({...form, email:e.target.value})}  style={inputStyle} />
                      <label style={labelStyle}>Phone</label>
                      <input placeholder="For faster scheduling" value={form.phone} onChange={e => setForm({...form, phone:e.target.value})}  style={inputStyle} />
                      <label style={labelStyle}>How did you hear about us?</label>
                      <select value={form.source} onChange={e => setForm({...form, source:e.target.value})} style={{ ...inputStyle, marginBottom:18 }}>
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

                    <PrimaryButton onClick={handleSubmit}>Submit Request</PrimaryButton>
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
