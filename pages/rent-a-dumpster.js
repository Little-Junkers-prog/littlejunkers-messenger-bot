import { useMemo, useState } from "react";

const COLORS = {
  pink: "#ffcee4",
  charcoal: "#545454",
  charcoalDark: "#3a3a3a",
  gray: "#737373",
  grayLight: "#f6f6f6",
  border: "#e1e1e1",
  white: "#ffffff",
  warningBg: "#fff8eb",
  warningBorder: "#f2cf7a",
};

const FONT_STACK = "system-ui, sans-serif";

const zones = {
  A: { fee: 0, label: "Local Area" },
  B: { fee: 49, label: "Extended Area" },
  C: { fee: 89, label: "Outer Area" },
};

const zipToZone = {
  "30213": "A",
  "30214": "A",
  "30215": "A",
  "30263": "A",
  "30265": "A",
  "30268": "A",
  "30269": "A",
  "30276": "A",
  "30291": "A",

  "30106": "B",
  "30126": "B",
  "30134": "B",
  "30135": "B",
  "30168": "B",
  "30223": "B",
  "30224": "B",
  "30228": "B",
  "30236": "B",
  "30238": "B",
  "30260": "B",
  "30274": "B",
  "30296": "B",
  "30297": "B",
  "30310": "B",
  "30311": "B",
  "30314": "B",
  "30315": "B",
  "30331": "B",
  "30336": "B",
  "30337": "B",
  "30344": "B",
  "30349": "B",
  "30354": "B",

  "30002": "C",
  "30004": "C",
  "30005": "C",
  "30009": "C",
  "30017": "C",
  "30019": "C",
  "30021": "C",
  "30022": "C",
  "30028": "C",
  "30030": "C",
  "30032": "C",
  "30033": "C",
  "30034": "C",
  "30035": "C",
  "30038": "C",
  "30039": "C",
  "30040": "C",
  "30041": "C",
  "30043": "C",
  "30044": "C",
  "30045": "C",
  "30046": "C",
  "30047": "C",
  "30052": "C",
  "30058": "C",
  "30071": "C",
  "30072": "C",
  "30075": "C",
  "30076": "C",
  "30078": "C",
  "30092": "C",
  "30093": "C",
  "30094": "C",
  "30096": "C",
  "30097": "C",
  "30101": "C",
  "30102": "C",
  "30107": "C",
  "30114": "C",
  "30115": "C",
  "30116": "C",
  "30117": "C",
  "30120": "C",
  "30121": "C",
  "30127": "C",
  "30132": "C",
  "30137": "C",
  "30141": "C",
  "30142": "C",
  "30143": "C",
  "30144": "C",
  "30152": "C",
  "30157": "C",
  "30517": "C",
  "30518": "C",
  "30519": "C",
  "30303": "C",
  "30305": "C",
  "30308": "C",
  "30309": "C",
  "30312": "C",
  "30313": "C",
  "30316": "C",
  "30317": "C",
  "30318": "C",
  "30319": "C",
  "30324": "C",
  "30327": "C",
  "30328": "C",
  "30338": "C",
  "30339": "C",
  "30340": "C",
  "30341": "C",
  "30342": "C",
  "30346": "C",
  "30350": "C",
  "30360": "C",
  "30363": "C",
};

const zipToArea = {
  "30269": "Peachtree City area",
  "30265": "Newnan area",
  "30263": "Newnan area",
  "30214": "Fayetteville area",
  "30215": "Fayetteville area",
  "30213": "Fairburn area",
  "30268": "Palmetto area",
  "30276": "Senoia area",
  "30291": "Union City area",
  "30236": "Jonesboro area",
  "30238": "Jonesboro area",
  "30260": "Morrow area",
  "30274": "Riverdale area",
  "30296": "College Park area",
  "30297": "Hapeville / Forest Park area",
  "30349": "South Fulton / Atlanta area",
  "30344": "East Point area",
  "30337": "College Park area",
  "30331": "Atlanta area",
};

const sizeMeta = {
  "11 Yard": {
    tons: 1,
    label: "Includes 1 ton",
    bestFor: "Small cleanouts, garage/basement jobs, weight-conscious loads",
    short: "Best for smaller jobs and heavier debris control",
    height: "3.5'",
  },
  "16 Yard": {
    tons: 1.5,
    label: "Includes 1.5 tons",
    bestFor: "Moving, decluttering, mixed cleanup, all-around use",
    short: "Best all-around option for most mixed projects",
    height: "4.5'",
  },
  "21 Yard": {
    tons: 2,
    label: "Includes 2 tons",
    bestFor: "Renovation, demo, bulky cleanouts, larger jobs",
    short: "Best for bigger projects with more volume",
    height: "6'",
  },
};

const comparisonMeta = {
  "11 Yard": {
    truckLoads: "4–5 pickup loads",
    projectScale: "Small",
    bestUse: "Garage cleanouts, roofing, dense debris",
  },
  "16 Yard": {
    truckLoads: "6–7 pickup loads",
    projectScale: "Medium",
    bestUse: "Moving, decluttering, mixed cleanup",
  },
  "21 Yard": {
    truckLoads: "8–10 pickup loads",
    projectScale: "Large",
    bestUse: "Renovation, demo, bulky cleanouts",
  },
};

const DUMPSTER_IMAGES = {
  "11 Yard": "/11 -yard image.png",
  "16 Yard": "/16 -yard image.png",
  "21 Yard": "/21 -yard image.png",
};

const basePricing = {
  "11 Yard": {
    "Early Bird": 225,
    "Weekend Warrior": 285,
    "Base Rental": 275,
    "Full Reset": 345,
  },
  "16 Yard": {
    "Early Bird": 275,
    "Weekend Warrior": 385,
    "Base Rental": 325,
    "Full Reset": 445,
  },
  "21 Yard": {
    "Early Bird": 385,
    "Weekend Warrior": 445,
    "Base Rental": 385,
    "Full Reset": 495,
  },
};

const rentalOptions = [
  {
    key: "Early Bird",
    label: "Early Bird",
    sub: "(Mon–Tue Delivery) Best Price",
    tag: "Best Value",
  },
  {
    key: "Weekend Warrior",
    label: "Weekend Warrior",
    sub: "(Fri–Mon) Most Popular",
    tag: "Most Popular",
    highlight: true,
  },
  {
    key: "Base Rental",
    label: "Base Rental",
    sub: "2-Day Rental",
    tag: "Quick Job",
  },
  {
    key: "Full Reset",
    label: "Full Reset",
    sub: "7-Day Rental",
    tag: "Big Project",
  },
];

const allSizes = ["11 Yard", "16 Yard", "21 Yard"];

export default function Funnel() {
  const [step, setStep] = useState(0);

  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState("");
  const [zoneKey, setZoneKey] = useState("");
  const [zoneFee, setZoneFee] = useState(0);

  const [customerType, setCustomerType] = useState("");
  const [returningPath, setReturningPath] = useState("");

  const [project, setProject] = useState("");
  const [otherText, setOtherText] = useState("");

  const [showConcreteNotice, setShowConcreteNotice] = useState(false);

  const [size, setSize] = useState("");
  const [overrideSize, setOverrideSize] = useState("");

  const [duration, setDuration] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    source: "",
  });

  const areaLabel = getAreaLabel(zip);
  const effectiveSize = overrideSize || size;
  const isReturningQuick = customerType === "Returning" && returningPath === "quick";

  const recommendation = useMemo(() => {
    return getRecommendation(customerType, project, otherText);
  }, [customerType, project, otherText]);

  const stepLabel = {
    0: "Service Area",
    1: "Customer Type",
    2: "Path",
    3: "Project Type",
    4: "Precision Match",
    5: "Rental Option",
    6: "Contact Info",
  }[step];

  const visibleTotalSteps = isReturningQuick ? 6 : 7;

  const currentVisualStep = (() => {
    if (step === 0) return 1;
    if (step === 1) return 2;
    if (step === 2) return 3;
    if (step === 3) return 4;
    if (step === 4) return isReturningQuick ? 4 : 5;
    if (step === 5) return isReturningQuick ? 5 : 6;
    if (step === 6) return isReturningQuick ? 6 : 7;
    return 1;
  })();

  const progressPercent = (currentVisualStep / visibleTotalSteps) * 100;

  const calculatedPrices = useMemo(() => {
    if (!effectiveSize || !basePricing[effectiveSize]) return {};
    const pricing = {};
    Object.entries(basePricing[effectiveSize]).forEach(([key, amount]) => {
      pricing[key] = amount + zoneFee;
    });
    return pricing;
  }, [effectiveSize, zoneFee]);

  const handleZipSubmit = () => {
    const cleanZip = zip.trim();
    if (!/^\d{5}$/.test(cleanZip)) {
      setZipError("Please enter a valid 5-digit ZIP code.");
      return;
    }

    const foundZone = zipToZone[cleanZip];
    if (!foundZone) {
      setZipError(
        "We may not service that area right now. If you're nearby, contact us and we’ll confirm."
      );
      return;
    }

    setZipError("");
    setZoneKey(foundZone);
    setZoneFee(zones[foundZone].fee);
    setStep(1);
  };

  const handleCustomerType = (type) => {
    setCustomerType(type);
    setReturningPath("");
    setProject("");
    setOtherText("");
    setSize("");
    setOverrideSize("");
    setDuration("");
    setShowConcreteNotice(false);

    if (type === "Returning") {
      setStep(2);
    } else {
      setStep(3);
    }
  };

  const handleReturningPath = (path) => {
    setReturningPath(path);
    setProject("");
    setOtherText("");
    setSize("");
    setOverrideSize("");
    setDuration("");

    if (path === "quick") {
      setStep(4);
    } else {
      setStep(3);
    }
  };

  const handleProject = (selectedProject) => {
    if (customerType === "Contractor" && selectedProject === "Concrete") {
      setShowConcreteNotice(true);
      return;
    }

    setProject(selectedProject);
    const reco = getRecommendation(customerType, selectedProject, otherText);
    setSize(reco.size);
    setOverrideSize("");
    setStep(4);
  };

  const handleOtherContinue = () => {
    const reco = getRecommendation(customerType, "Other", otherText);
    setSize(reco.size);
    setOverrideSize("");
    setStep(4);
  };

  const handleSizeSelect = (selectedSize) => {
    if (isReturningQuick) {
      setSize("");
      setOverrideSize(selectedSize);
      return;
    }

    if (selectedSize === size) {
      setOverrideSize("");
    } else {
      setOverrideSize(selectedSize);
    }
  };

  const handleContinueFromStep4 = () => {
    if (!effectiveSize) {
      alert("Please choose a dumpster size.");
      return;
    }
    setStep(5);
  };

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim()) {
      alert("Please enter your name and email.");
      return;
    }

    const payload = {
      zip,
      areaLabel,
      zone: zoneKey,
      deliveryFee: zoneFee,
      customerType,
      returningPath,
      project,
      otherText,
      recommendedSize: size,
      selectedSize: effectiveSize,
      includedTons: sizeMeta[effectiveSize]?.tons || null,
      rentalOption: duration,
      pricingShown: calculatedPrices,
      contact: form,
    };

    console.log(payload);
    alert("Lead captured (next step: Odoo)");
  };

  const goBack = () => {
    if (step === 6) return setStep(5);
    if (step === 5) return setStep(4);

    if (step === 4) {
      if (isReturningQuick) return setStep(2);
      return setStep(3);
    }

    if (step === 3) {
      if (customerType === "Returning") return setStep(2);
      return setStep(1);
    }

    if (step === 2) return setStep(1);
    if (step === 1) return setStep(0);
  };

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <Header />

        <main style={styles.card}>
          <div style={styles.cardProgressWrap}>
            <div style={styles.progressMeta}>
              <span style={styles.progressStep}>
                Step {currentVisualStep} of {visibleTotalSteps}
              </span>
              <span style={styles.progressLabel}>{stepLabel}</span>
            </div>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${progressPercent}%` }} />
            </div>
          </div>

          {step > 0 && (
            <div style={styles.topRow}>
              <button onClick={goBack} style={styles.backButton}>
                ← Back
              </button>
            </div>
          )}

          {step === 0 && (
            <>
              <SectionTitle
                title="Check your service area"
                text="Start with your ZIP code so we can verify coverage and show area-based pricing."
              />

              <div style={styles.formSection}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>ZIP Code</label>
                  <input
                    placeholder="Enter 5-digit ZIP"
                    value={zip}
                    onChange={(e) => setZip(e.target.value)}
                    style={styles.input}
                    maxLength={5}
                  />
                </div>

                {zipError ? <div style={styles.errorText}>{zipError}</div> : null}

                <button onClick={handleZipSubmit} style={styles.primaryButton}>
                  Check My Area
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <SectionTitle
                title="Choose your project path"
                text={`${areaLabel} is in our ${
                  zones[zoneKey]?.label?.toLowerCase() || ""
                }. Delivery pricing will be built into the options we show you next.`}
              />

              <div style={styles.optionGrid}>
                {[
                  { label: "New Customer", sub: "First time renting with us" },
                  { label: "Returning", sub: "You’ve rented from us before" },
                  { label: "Contractor", sub: "Business or repeat jobsite use" },
                ].map((item) => (
                  <OptionCard
                    key={item.label}
                    title={item.label}
                    sub={item.sub}
                    selected={customerType === item.label}
                    onClick={() => handleCustomerType(item.label)}
                  />
                ))}
              </div>
            </>
          )}

          {step === 2 && customerType === "Returning" && (
            <>
              <SectionTitle
                title="Choose how you want to proceed"
                text="Move fast if you already know your size, or let the tool match the best fit for this job."
              />

              <div style={styles.optionGrid}>
                <OptionCard
                  title="Quick Select"
                  sub="I know my size already"
                  selected={returningPath === "quick"}
                  onClick={() => handleReturningPath("quick")}
                />
                <OptionCard
                  title="Guide Me"
                  sub="Use this project to size it correctly"
                  selected={returningPath === "recommend"}
                  onClick={() => handleReturningPath("recommend")}
                />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <SectionTitle
                title={
                  customerType === "Contractor"
                    ? "What type of debris are you dealing with?"
                    : customerType === "Returning"
                    ? "What are you tossing this time?"
                    : "What kind of cleanup are you tackling?"
                }
                text={
                  customerType === "Contractor"
                    ? "We’ll filter out unsupported material and match the best container for the job."
                    : "Choose the option that’s closest to your current project so we can size it correctly."
                }
              />

              <div style={styles.optionGrid}>
                {(customerType === "Contractor"
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
                      "Roofing",
                      "Other",
                    ]
                ).map((type) => (
                  <OptionCard
                    key={type}
                    title={type}
                    selected={project === type}
                    onClick={() => {
                      if (type === "Other") {
                        setProject("Other");
                      } else {
                        handleProject(type);
                      }
                    }}
                  />
                ))}
              </div>

              {project === "Other" && (
                <div style={{ marginTop: 14 }}>
                  <label style={styles.label}>Tell us a little more</label>
                  <textarea
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    placeholder="Describe your project..."
                    style={styles.textarea}
                  />
                  <button style={styles.primaryButton} onClick={handleOtherContinue}>
                    Continue
                  </button>
                </div>
              )}

              {showConcreteNotice && (
                <div style={styles.noticeBox}>
                  <div style={styles.noticeTitle}>Concrete isn’t something we haul right now</div>
                  <p style={styles.noticeText}>
                    We can still help with general cleanup, renovation debris,
                    roofing, and other non-concrete projects.
                  </p>
                  <button
                    style={styles.noticeButton}
                    onClick={() => setShowConcreteNotice(false)}
                  >
                    Got it
                  </button>
                </div>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <SectionTitle
                title={isReturningQuick ? "Choose your dumpster size" : "Precision Match"}
                text={
                  isReturningQuick
                    ? "Select the size you want and we’ll show the rental options and pricing next."
                    : "Based on the project details you entered, this is the strongest fit to start with."
                }
              />

              {!isReturningQuick && effectiveSize && (
                <div style={styles.matchShell}>
                  <div style={styles.matchPaneLeft}>
                    <div style={styles.matchLabel}>Calculated Project Match</div>
                    <div style={styles.recoSize}>{effectiveSize}</div>

                    <div style={styles.recoMetaRow}>
                      <span style={styles.tonnagePill}>
                        {sizeMeta[effectiveSize]?.label || ""}
                      </span>
                    </div>

                    <div style={styles.recoSubTitle}>What this size holds</div>
                    <ul style={styles.capacityList}>
                      {recommendation.holds.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>

                    <div style={styles.logicBox}>
                      <div style={styles.logicTitle}>Why this works</div>
                      <p style={styles.recoText}>{recommendation.reason}</p>
                      <div style={styles.recoCallout}>{recommendation.note}</div>
                    </div>
                  </div>

                  <div style={styles.matchPaneRight}>
                    <div style={styles.imageFrame}>
                      <img
                        src={DUMPSTER_IMAGES[effectiveSize]}
                        alt={`${effectiveSize} dumpster`}
                        style={styles.dumpsterImage}
                      />
                    </div>

                    <div style={styles.dimensionCard}>
                      <div style={styles.dimensionTitle}>Container Footprint</div>
                      <div style={styles.dimensionLine}>12' L x 7.5' W</div>
                      <div style={styles.dimensionLine}>
                        Height: {sizeMeta[effectiveSize]?.height || "-"}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!isReturningQuick && effectiveSize && (
                <div style={styles.comparisonBox}>
                  <div style={styles.comparisonTitle}>Compare size options</div>
                  <div style={styles.comparisonSubtitle}>
                    Review the other size options before you continue.
                  </div>

                  <div style={styles.comparisonGrid}>
                    {allSizes.map((sizeKey) => {
                      const isMatch = sizeKey === size;
                      const isSelected = effectiveSize === sizeKey;

                      return (
                        <div
                          key={sizeKey}
                          style={{
                            ...styles.comparisonCard,
                            ...(isMatch ? styles.comparisonCardMatch : {}),
                            ...(isSelected ? styles.comparisonCardSelected : {}),
                          }}
                        >
                          <div style={styles.comparisonTopRow}>
                            <div style={styles.comparisonSize}>{sizeKey}</div>
                            {isMatch ? (
                              <span style={styles.comparisonTag}>Your Match</span>
                            ) : null}
                          </div>

                          <div style={styles.comparisonMetric}>
                            <span style={styles.comparisonMetricLabel}>Project Scale</span>
                            <strong>{comparisonMeta[sizeKey].projectScale}</strong>
                          </div>

                          <div style={styles.comparisonMetric}>
                            <span style={styles.comparisonMetricLabel}>Truck Load Equivalent</span>
                            <strong>{comparisonMeta[sizeKey].truckLoads}</strong>
                          </div>

                          <div style={styles.comparisonMetric}>
                            <span style={styles.comparisonMetricLabel}>Included Weight</span>
                            <strong>{sizeMeta[sizeKey].label}</strong>
                          </div>

                          <div style={styles.comparisonUse}>
                            <strong>Best for:</strong> {comparisonMeta[sizeKey].bestUse}
                          </div>

                          {isSelected ? (
                            <div style={styles.selectedIndicator}>Selected</div>
                          ) : (
                            <button
                              onClick={() => handleSizeSelect(sizeKey)}
                              style={styles.selectButton}
                            >
                              Select
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {customerType === "Contractor" && project === "Roofing" && (
                <div style={styles.warningStrip}>
                  <strong>Roofing note:</strong> Roofing debris gets heavy quickly, so we bias
                  smaller here to reduce overweight risk.
                </div>
              )}

              {(isReturningQuick || !effectiveSize) && (
                <div style={styles.optionGrid}>
                  {allSizes.map((sizeKey) => {
                    const isMatch = !isReturningQuick && sizeKey === size;
                    const isSelected = effectiveSize === sizeKey;

                    return (
                      <button
                        key={sizeKey}
                        onClick={() => handleSizeSelect(sizeKey)}
                        style={{
                          ...styles.sizeCard,
                          ...(isSelected ? styles.optionCardSelected : {}),
                          ...(isMatch ? styles.recommendedCard : {}),
                        }}
                      >
                        <div style={styles.optionTop}>
                          <div>
                            <div style={styles.optionTitle}>{sizeKey}</div>
                            <div style={styles.optionSub}>{sizeMeta[sizeKey].short}</div>
                          </div>
                          {isMatch ? <span style={styles.tag}>Best Fit</span> : null}
                        </div>

                        <div style={styles.sizeMetaRow}>
                          <span style={styles.tonnagePill}>{sizeMeta[sizeKey].label}</span>
                        </div>

                        <div style={styles.sizeBestFor}>
                          <strong>Best for:</strong> {sizeMeta[sizeKey].bestFor}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <button onClick={handleContinueFromStep4} style={styles.primaryButton}>
                Continue
              </button>
            </>
          )}

          {step === 5 && (
            <>
              <SectionTitle
                title="Choose your rental option"
                text={`Pricing below includes delivery to the ${areaLabel}. ${sizeMeta[effectiveSize]?.label || ""}.`}
              />

              <div style={styles.selectedSizeStrip}>
                <div>
                  <div style={styles.selectedSizeLabel}>Selected Dumpster</div>
                  <div style={styles.selectedSizeValue}>{effectiveSize}</div>
                </div>
                <span style={styles.tonnagePill}>
                  {sizeMeta[effectiveSize]?.label || ""}
                </span>
              </div>

              <div style={styles.optionGrid}>
                {rentalOptions.map((option) => {
                  const displayPrice = calculatedPrices[option.key];

                  return (
                    <button
                      key={option.key}
                      onClick={() => {
                        setDuration(option.label);
                        setStep(6);
                      }}
                      style={{
                        ...styles.optionCard,
                        ...(option.highlight ? styles.highlightCard : {}),
                      }}
                    >
                      <div style={styles.optionTop}>
                        <div>
                          <div style={styles.optionTitle}>{option.label}</div>
                          <div style={styles.optionSub}>{option.sub}</div>
                          <div style={styles.priceText}>
                            {typeof displayPrice === "number"
                              ? `$${displayPrice}`
                              : "Pricing unavailable"}
                          </div>
                          <div style={styles.priceSupport}>
                            Includes delivery + {sizeMeta[effectiveSize]?.label?.toLowerCase()}
                          </div>
                        </div>
                        {option.tag ? <span style={styles.tag}>{option.tag}</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <SectionTitle
                title="Submit your request"
                text="We’ll use this information to confirm availability and finalize your rental."
              />

              <div style={styles.summaryBox}>
                <div style={styles.summaryTitle}>Recommendation Summary</div>
                <div style={styles.summaryRow}>
                  <span>ZIP</span>
                  <strong>{zip}</strong>
                </div>
                <div style={styles.summaryRow}>
                  <span>Service Area</span>
                  <strong>{areaLabel}</strong>
                </div>
                <div style={styles.summaryRow}>
                  <span>Delivery Area</span>
                  <strong>
                    {zones[zoneKey]?.label} {zoneFee > 0 ? `(+$${zoneFee})` : "(Included)"}
                  </strong>
                </div>
                <div style={styles.summaryRow}>
                  <span>Dumpster</span>
                  <strong>{effectiveSize || "-"}</strong>
                </div>
                <div style={styles.summaryRow}>
                  <span>Included Disposal Weight</span>
                  <strong>{sizeMeta[effectiveSize]?.label || "-"}</strong>
                </div>
                <div style={styles.summaryRow}>
                  <span>Rental</span>
                  <strong>{duration || "-"}</strong>
                </div>
              </div>

              <div style={styles.formSection}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Name *</label>
                  <input
                    placeholder="Your name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    style={styles.input}
                  />

                  <label style={styles.label}>Email *</label>
                  <input
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    style={styles.input}
                  />

                  <label style={styles.label}>Phone</label>
                  <input
                    placeholder="For faster scheduling — optional"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    style={styles.input}
                  />

                  <label style={styles.label}>How did you hear about us?</label>
                  <select
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    style={styles.input}
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

                <button onClick={handleSubmit} style={styles.primaryButton}>
                  Submit Request
                </button>
              </div>
            </>
          )}

          <CardFooter />
        </main>
      </div>
    </div>
  );
}

function Header() {
  return (
    <header style={styles.header}>
      <div style={styles.headerLeft}>
        <img
          src="/little-junkers-logo.png"
          alt="Little Junkers logo"
          style={styles.headerLogo}
        />
      </div>

      <div style={styles.headerRight}>
        <div style={styles.headerMetaPrimary}>Peachtree City, GA</div>
        <a href="tel:4708136270" style={styles.headerMetaLink}>
          470-813-6270
        </a>
      </div>
    </header>
  );
}

function CardFooter() {
  return (
    <div style={styles.cardFooter}>
      <div style={styles.cardFooterTitle}>Little Junkers • Peachtree City, GA</div>
      <a href="tel:4708136270" style={styles.cardFooterLink}>
        470-813-6270
      </a>
    </div>
  );
}

function SectionTitle({ title, text }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h2 style={styles.h2}>{title}</h2>
      <p style={styles.sectionText}>{text}</p>
    </div>
  );
}

function OptionCard({ title, sub, tag, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.optionCard,
        ...(selected ? styles.optionCardSelected : {}),
      }}
    >
      <div style={styles.optionTop}>
        <div>
          <div style={styles.optionTitle}>{title}</div>
          {sub ? <div style={styles.optionSub}>{sub}</div> : null}
        </div>
        {tag ? <span style={styles.tag}>{tag}</span> : null}
      </div>
    </button>
  );
}

function getAreaLabel(zip) {
  if (!zip) return "Your area";
  return zipToArea[zip] || `ZIP ${zip} area`;
}

function getRecommendation(customerType, project, otherText = "") {
  const otherLower = String(otherText || "").toLowerCase();

  if (customerType === "Contractor") {
    if (project === "Roofing") {
      return {
        size: "11 Yard",
        holds: [
          "Approx. 30 squares of single-layer shingles",
          "Approximately 4-5 pickup truck loads of debris",
          "Heavy roofing material with safer weight control",
        ],
        reason:
          "Roofing materials are deceptively heavy. We recommend the 11-Yard to keep the load within a safer lifting range and reduce overweight risk.",
        note:
          "For larger tear-offs, two smaller loads are often better than one overweight container with added overage costs.",
      };
    }

    if (project === "Renovation / demo") {
      return {
        size: "21 Yard",
        holds: [
          "Larger renovation and demo loads",
          "Approximately 8-10 pickup truck loads",
          "Bulky debris that builds fast on active jobsites",
        ],
        reason:
          "Contractor demo jobs usually generate more volume and bulk than expected, so the 21-Yard is the better operational starting point.",
        note:
          "This gives your crew more working room up front and reduces the chance of needing an early swap.",
      };
    }

    if (project === "General Cleanup") {
      return {
        size: "16 Yard",
        holds: [
          "General contractor cleanup and mixed debris",
          "Approximately 6-7 pickup truck loads",
          "Day-to-day jobsite volume without oversizing",
        ],
        reason:
          "For mixed contractor cleanup, the 16-Yard is the strongest all-around fit because it balances usable capacity and fast turnaround.",
        note:
          "It handles a broad mix of material without jumping straight to the biggest box.",
      };
    }

    if (project === "Other") {
      if (containsHeavyKeywords(otherLower)) {
        return {
          size: "21 Yard",
          holds: [
            "Heavier or bulkier contractor debris",
            "Approximately 8-10 pickup truck loads",
            "Projects likely to expand once work begins",
          ],
          reason:
            "Based on what you described, this sounds more like a bulk-heavy contractor load that benefits from extra volume.",
          note:
            "The 21-Yard gives more room to work and reduces the risk of under-ordering.",
        };
      }

      return {
        size: "16 Yard",
        holds: [
          "Mixed contractor debris",
          "Approximately 6-7 pickup truck loads",
          "Flexible jobsite cleanup where scope is still moving",
        ],
        reason:
          "When contractor debris is mixed or unclear, the 16-Yard is the safest all-around recommendation.",
        note:
          "It gives you flexibility without overshooting the project size too early.",
      };
    }

    return {
      size: "16 Yard",
      holds: [
        "General contractor debris",
        "Approximately 6-7 pickup truck loads",
        "A practical everyday jobsite starting point",
      ],
      reason:
        "The 16-Yard is the strongest contractor default for mixed cleanup and repeat jobsite use.",
      note:
        "It gives enough room for most common loads while staying efficient to turn.",
    };
  }

  if (project === "Cleaning the garage / basement") {
    return {
      size: "11 Yard",
      holds: [
        "Garage and basement cleanouts",
        "Approximately 4-5 pickup truck loads",
        "Smaller household junk and boxed material",
      ],
      reason:
        "Garage and basement cleanouts are often a strong fit for the 11-Yard when the job is mostly household junk and smaller items.",
      note:
        "If the project grows into furniture, multiple rooms, or bulkier material, the 16-Yard becomes the safer step up.",
    };
  }

  if (project === "Moving / decluttering") {
    return {
      size: "16 Yard",
      holds: [
        "Moving and decluttering projects",
        "Approximately 6-7 pickup truck loads",
        "A broader mix of furniture, boxes, and overflow",
      ],
      reason:
        "Moving and decluttering projects usually expand once you start pulling things out, so the 16-Yard gives more breathing room.",
      note:
        "It is the strongest all-around fit for mixed household volume without overcommitting to the largest size.",
    };
  }

  if (project === "Renovation / demo") {
    return {
      size: "21 Yard",
      holds: [
        "Renovation and demo debris",
        "Approximately 8-10 pickup truck loads",
        "Bulky material that builds fast during active work",
      ],
      reason:
        "Renovation and demo projects create more volume and bulk, so the 21-Yard is the safer recommendation for keeping the project moving.",
      note:
        "It reduces the chance of running out of space mid-project and needing another haul sooner than expected.",
    };
  }

  if (project === "Roofing") {
    return {
      size: "11 Yard",
      holds: [
        "Smaller roofing tear-offs",
        "Approximately 4-5 pickup truck loads of shingles",
        "Heavy debris with better weight control",
      ],
      reason:
        "Roofing debris gets heavy fast, so starting smaller is the safer move for weight control and pickup safety.",
      note:
        "We would rather steer you into a safer fit than a larger box that becomes overweight and costly.",
    };
  }

  if (project === "Other") {
    if (containsHeavyKeywords(otherLower)) {
      return {
        size: "21 Yard",
        holds: [
          "Heavier or bulkier mixed debris",
          "Approximately 8-10 pickup truck loads",
          "Projects that sound more renovation-driven",
        ],
        reason:
          "What you described sounds heavier, bulkier, or more demo-oriented, so the 21-Yard is the safer recommendation.",
        note:
          "That gives you more room if the project expands once you get started.",
      };
    }

    if (containsLightKeywords(otherLower)) {
      return {
        size: "11 Yard",
        holds: [
          "Lighter household cleanup",
          "Approximately 4-5 pickup truck loads",
          "Smaller-volume junk where weight stays manageable",
        ],
        reason:
          "What you described sounds more like a lighter cleanout, which often fits well in the 11-Yard.",
        note:
          "If the scope grows once you start, the 16-Yard is the next safer step up.",
      };
    }

    return {
      size: "16 Yard",
      holds: [
        "Mixed cleanup jobs",
        "Approximately 6-7 pickup truck loads",
        "Projects where the final debris mix is still unclear",
      ],
      reason:
        "When a project is mixed or unclear, the 16-Yard is usually the safest recommendation because it gives flexibility without overshooting too much.",
      note:
        "It is the most balanced starting point for uncertain jobs.",
    };
  }

  return {
    size: "16 Yard",
    holds: [
      "Mixed cleanup jobs",
      "Approximately 6-7 pickup truck loads",
      "A practical all-around fit for household projects",
    ],
    reason:
      "The 16-Yard is a strong all-around default for mixed cleanup and household projects.",
    note:
      "It gives more room than the smallest option without going oversized.",
  };
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
  ].some((word) => text.includes(word));
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
  ].some((word) => text.includes(word));
}

const styles = {
  page: {
    minHeight: "100vh",
    background: COLORS.white,
    padding: "24px 16px 36px",
    color: COLORS.charcoalDark,
    fontFamily: FONT_STACK,
  },
  shell: {
    maxWidth: 1100,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    paddingBottom: 16,
    marginBottom: 20,
    borderBottom: `1px solid ${COLORS.border}`,
    flexWrap: "wrap",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    minWidth: 0,
  },
  headerLogo: {
    width: "100%",
    maxWidth: 140,
    height: "auto",
    objectFit: "contain",
    display: "block",
  },
  headerRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    minWidth: 180,
    marginLeft: "auto",
  },
  headerMetaPrimary: {
    fontSize: 14,
    color: COLORS.gray,
    fontWeight: 700,
    fontFamily: FONT_STACK,
  },
  headerMetaLink: {
    fontSize: 18,
    fontWeight: 900,
    color: COLORS.charcoalDark,
    textDecoration: "none",
    fontFamily: FONT_STACK,
  },
  card: {
    background: COLORS.white,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 28,
    boxShadow: "0 10px 28px rgba(0,0,0,0.05)",
  },
  cardProgressWrap: {
    marginBottom: 20,
  },
  progressMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 8,
    fontFamily: FONT_STACK,
    gap: 12,
    flexWrap: "wrap",
  },
  progressStep: {
    fontWeight: 700,
    color: COLORS.charcoalDark,
  },
  progressLabel: {
    fontWeight: 600,
  },
  progressBar: {
    width: "100%",
    height: 10,
    borderRadius: 999,
    background: COLORS.grayLight,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: COLORS.pink,
    borderRadius: 999,
    transition: "width 250ms ease",
  },
  topRow: {
    marginBottom: 12,
  },
  backButton: {
    background: "none",
    border: "none",
    fontSize: 14,
    color: COLORS.gray,
    cursor: "pointer",
    padding: 0,
    fontWeight: 700,
    fontFamily: FONT_STACK,
  },
  h2: {
    margin: "0 0 8px 0",
    fontSize: 30,
    color: COLORS.charcoalDark,
    fontWeight: 900,
    fontFamily: FONT_STACK,
    letterSpacing: "-0.6px",
  },
  sectionText: {
    margin: 0,
    color: COLORS.gray,
    fontSize: 16,
    lineHeight: 1.5,
    fontFamily: FONT_STACK,
  },
  formSection: {
    background: COLORS.grayLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 18,
  },
  optionGrid: {
    display: "grid",
    gap: 14,
  },
  optionCard: {
    width: "100%",
    textAlign: "left",
    padding: "18px 18px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.grayLight,
    cursor: "pointer",
    fontFamily: FONT_STACK,
  },
  sizeCard: {
    width: "100%",
    textAlign: "left",
    padding: "18px 18px",
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.grayLight,
    cursor: "pointer",
    fontFamily: FONT_STACK,
  },
  optionCardSelected: {
    background: COLORS.white,
    border: `1px solid ${COLORS.charcoalDark}`,
    boxShadow: "0 0 0 2px rgba(58,58,58,0.08)",
  },
  recommendedCard: {
    border: `1px solid ${COLORS.charcoalDark}`,
  },
  highlightCard: {
    border: `1px solid ${COLORS.charcoalDark}`,
    boxShadow: "0 8px 18px rgba(0,0,0,0.06)",
  },
  optionTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: COLORS.charcoalDark,
    fontFamily: FONT_STACK,
  },
  optionSub: {
    marginTop: 6,
    color: COLORS.gray,
    fontSize: 14,
    lineHeight: 1.4,
    fontFamily: FONT_STACK,
  },
  tag: {
    background: COLORS.pink,
    color: COLORS.charcoalDark,
    fontSize: 12,
    fontWeight: 800,
    padding: "6px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    fontFamily: FONT_STACK,
  },
  sizeMetaRow: {
    marginTop: 12,
    marginBottom: 12,
  },
  tonnagePill: {
    display: "inline-block",
    background: COLORS.white,
    border: `1px solid ${COLORS.border}`,
    color: COLORS.charcoalDark,
    fontSize: 12,
    fontWeight: 800,
    padding: "7px 10px",
    borderRadius: 999,
    fontFamily: FONT_STACK,
  },
  sizeBestFor: {
    fontSize: 14,
    lineHeight: 1.5,
    color: COLORS.gray,
    fontFamily: FONT_STACK,
  },
  matchShell: {
    display: "flex",
    gap: 18,
    alignItems: "stretch",
    marginBottom: 18,
    flexWrap: "wrap",
  },
  matchPaneLeft: {
    flex: "1 1 420px",
    minWidth: 280,
    background: COLORS.white,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 22,
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
  },
  matchPaneRight: {
    flex: "1 1 320px",
    minWidth: 260,
    background: COLORS.grayLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    gap: 16,
  },
  matchLabel: {
    display: "inline-block",
    background: COLORS.grayLight,
    color: COLORS.charcoalDark,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 800,
    marginBottom: 14,
    fontFamily: FONT_STACK,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  recoSize: {
    fontSize: 42,
    fontWeight: 900,
    fontFamily: FONT_STACK,
    color: COLORS.charcoalDark,
    marginBottom: 8,
    letterSpacing: "-1px",
    lineHeight: 1,
  },
  recoMetaRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 18,
  },
  recoSubTitle: {
    fontWeight: 800,
    marginBottom: 8,
    fontFamily: FONT_STACK,
  },
  capacityList: {
    marginTop: 0,
    marginBottom: 16,
    paddingLeft: 20,
    lineHeight: 1.8,
    color: COLORS.gray,
    fontFamily: FONT_STACK,
  },
  logicBox: {
    background: COLORS.grayLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 14,
  },
  logicTitle: {
    fontSize: 14,
    fontWeight: 800,
    color: COLORS.charcoalDark,
    marginBottom: 8,
    fontFamily: FONT_STACK,
  },
  recoText: {
    margin: "0 0 10px 0",
    fontSize: 16,
    lineHeight: 1.6,
    color: COLORS.charcoalDark,
    fontFamily: FONT_STACK,
  },
  recoCallout: {
    color: COLORS.gray,
    lineHeight: 1.5,
    fontSize: 14,
    fontFamily: FONT_STACK,
  },
  imageFrame: {
    background: COLORS.white,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 14,
    minHeight: 240,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  dumpsterImage: {
    width: "100%",
    maxWidth: 360,
    height: "auto",
    display: "block",
    objectFit: "contain",
  },
  dimensionCard: {
    background: COLORS.white,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 14,
  },
  dimensionTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: COLORS.charcoalDark,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontFamily: FONT_STACK,
  },
  dimensionLine: {
    fontSize: 15,
    color: COLORS.gray,
    lineHeight: 1.6,
    fontFamily: FONT_STACK,
  },
  comparisonBox: {
    background: COLORS.grayLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 18,
    marginBottom: 18,
  },
  comparisonTitle: {
    fontSize: 18,
    fontWeight: 900,
    color: COLORS.charcoalDark,
    fontFamily: FONT_STACK,
    marginBottom: 6,
  },
  comparisonSubtitle: {
    fontSize: 14,
    lineHeight: 1.5,
    color: COLORS.gray,
    fontFamily: FONT_STACK,
    marginBottom: 14,
  },
  comparisonGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  comparisonCard: {
    textAlign: "left",
    background: COLORS.white,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 14,
    fontFamily: FONT_STACK,
  },
  comparisonCardMatch: {
    border: `1px solid ${COLORS.charcoalDark}`,
    boxShadow: "0 4px 10px rgba(0,0,0,0.04)",
  },
  comparisonCardSelected: {
    boxShadow: "0 0 0 2px rgba(58,58,58,0.12)",
  },
  comparisonTopRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 12,
  },
  comparisonSize: {
    fontSize: 20,
    fontWeight: 900,
    color: COLORS.charcoalDark,
    fontFamily: FONT_STACK,
    letterSpacing: "-0.4px",
  },
  comparisonTag: {
    background: COLORS.pink,
    color: COLORS.charcoalDark,
    fontSize: 11,
    fontWeight: 800,
    padding: "5px 8px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    fontFamily: FONT_STACK,
  },
  comparisonMetric: {
    display: "grid",
    gap: 2,
    marginBottom: 10,
    color: COLORS.charcoalDark,
    fontFamily: FONT_STACK,
    fontSize: 13,
    lineHeight: 1.4,
  },
  comparisonMetricLabel: {
    color: COLORS.gray,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    fontWeight: 700,
  },
  comparisonUse: {
    fontSize: 13,
    lineHeight: 1.5,
    color: COLORS.gray,
    fontFamily: FONT_STACK,
    marginTop: 6,
  },
  selectedIndicator: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: 800,
    color: COLORS.charcoalDark,
    fontFamily: FONT_STACK,
  },
  selectButton: {
    marginTop: 14,
    width: "100%",
    padding: "10px 12px",
    background: COLORS.white,
    color: COLORS.charcoalDark,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: FONT_STACK,
  },
  warningStrip: {
    background: COLORS.warningBg,
    border: `1px solid ${COLORS.warningBorder}`,
    borderRadius: 12,
    padding: 14,
    color: COLORS.charcoalDark,
    lineHeight: 1.6,
    fontSize: 14,
    marginBottom: 14,
    fontFamily: FONT_STACK,
  },
  selectedSizeStrip: {
    marginBottom: 16,
    background: COLORS.grayLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 16,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  selectedSizeLabel: {
    fontSize: 12,
    fontWeight: 700,
    color: COLORS.gray,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontFamily: FONT_STACK,
  },
  selectedSizeValue: {
    fontSize: 22,
    fontWeight: 900,
    color: COLORS.charcoalDark,
    marginTop: 4,
    fontFamily: FONT_STACK,
  },
  primaryButton: {
    display: "block",
    width: "100%",
    marginTop: 18,
    padding: "18px",
    background: COLORS.charcoalDark,
    color: COLORS.white,
    border: "none",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: 800,
    letterSpacing: "0.3px",
    cursor: "pointer",
    fontFamily: FONT_STACK,
  },
  formGroup: {
    display: "grid",
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.charcoalDark,
    marginTop: 8,
    fontFamily: FONT_STACK,
  },
  input: {
    display: "block",
    width: "100%",
    padding: 14,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    background: COLORS.white,
    fontSize: 15,
    boxSizing: "border-box",
    fontFamily: FONT_STACK,
  },
  textarea: {
    width: "100%",
    minHeight: 100,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.white,
    fontSize: 15,
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: FONT_STACK,
  },
  summaryBox: {
    marginBottom: 18,
    background: COLORS.grayLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    padding: 18,
  },
  summaryTitle: {
    fontWeight: 800,
    fontSize: 16,
    marginBottom: 12,
    color: COLORS.charcoalDark,
    fontFamily: FONT_STACK,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 0",
    borderBottom: "1px solid #ececec",
    color: COLORS.gray,
    fontSize: 14,
    fontFamily: FONT_STACK,
  },
  priceText: {
    marginTop: 10,
    fontSize: 24,
    fontWeight: 900,
    color: COLORS.charcoalDark,
    fontFamily: FONT_STACK,
  },
  priceSupport: {
    marginTop: 6,
    fontSize: 13,
    color: COLORS.gray,
    lineHeight: 1.5,
    fontFamily: FONT_STACK,
  },
  noticeBox: {
    marginTop: 16,
    background: COLORS.warningBg,
    border: `1px solid ${COLORS.warningBorder}`,
    borderRadius: 12,
    padding: 16,
  },
  noticeTitle: {
    fontWeight: 800,
    color: COLORS.charcoalDark,
    marginBottom: 8,
    fontFamily: FONT_STACK,
  },
  noticeText: {
    margin: 0,
    color: COLORS.charcoal,
    lineHeight: 1.6,
    fontFamily: FONT_STACK,
  },
  noticeButton: {
    marginTop: 14,
    padding: "12px 16px",
    background: COLORS.charcoalDark,
    color: COLORS.white,
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 700,
    fontFamily: FONT_STACK,
  },
  errorText: {
    marginTop: 10,
    color: "#b3261e",
    fontSize: 14,
    lineHeight: 1.5,
    fontFamily: FONT_STACK,
  },
  cardFooter: {
    marginTop: 24,
    padding: 16,
    background: COLORS.grayLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    textAlign: "center",
  },
  cardFooterTitle: {
    fontSize: 13,
    fontWeight: 800,
    color: COLORS.charcoalDark,
    marginBottom: 6,
    fontFamily: FONT_STACK,
  },
  cardFooterLink: {
    fontSize: 16,
    fontWeight: 900,
    color: COLORS.charcoalDark,
    textDecoration: "none",
    fontFamily: FONT_STACK,
  },
};
