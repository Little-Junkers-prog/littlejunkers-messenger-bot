import { useMemo, useState } from "react";

const COLORS = {
  pink: "#ffcee4",
  charcoal: "#545454",
  charcoalDark: "#3a3a3a",
  gray: "#737373",
  grayLight: "#f6f6f6",
  border: "#e8e8e8",
  white: "#ffffff",
  successBg: "#fff4f8",
  warningBg: "#fff8eb",
  warningBorder: "#f2cf7a",
};

const zones = {
  A: { fee: 0, label: "Local Area" },
  B: { fee: 49, label: "Extended Area" },
  C: { fee: 89, label: "Outer Area" },
};

const zipToZone = {
  // Zone A
  "30213": "A",
  "30214": "A",
  "30215": "A",
  "30263": "A",
  "30265": "A",
  "30268": "A",
  "30269": "A",
  "30276": "A",
  "30291": "A",

  // Zone B
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

  // Zone C
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
  const [showOtherSizes, setShowOtherSizes] = useState(false);

  const [duration, setDuration] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    source: "",
  });

  const effectiveSize = overrideSize || size;

  const recommendation = useMemo(() => {
    return getRecommendation(customerType, project, otherText);
  }, [customerType, project, otherText]);

  const stepLabel = {
    0: "Service Area",
    1: "Customer Type",
    2: "Path",
    3: "Project Type",
    4: "Recommendation",
    5: "Rental Option",
    6: "Contact Info",
  }[step];

  const visibleTotalSteps = customerType === "Returning" && returningPath === "quick"
    ? 5
    : 6;

  const currentVisualStep = (() => {
    if (step === 0) return 1;
    if (customerType === "Returning" && returningPath === "quick") {
      const map = { 0: 1, 1: 2, 2: 3, 5: 4, 6: 5 };
      return map[step] || 1;
    }
    const map = { 0: 1, 1: 2, 2: 3, 3: 3, 4: 4, 5: 5, 6: 6 };
    return map[step] || 1;
  })();

  const progressPercent = (currentVisualStep / visibleTotalSteps) * 100;

  const calculatedPrices = useMemo(() => {
    const sizeKey = effectiveSize;
    if (!sizeKey || !basePricing[sizeKey]) return {};

    const pricing = {};
    Object.entries(basePricing[sizeKey]).forEach(([key, amount]) => {
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
    setProject("");
    setOtherText("");
    setSize("");
    setOverrideSize("");
    setDuration("");
    setReturningPath("");

    if (type === "Returning") {
      setStep(2);
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
    setShowOtherSizes(false);
    setStep(4);
  };

  const availableOtherSizes = getAlternativeSizes(size);

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim()) {
      alert("Please enter your name and email.");
      return;
    }

    const payload = {
      zip,
      zone: zoneKey,
      deliveryFee: zoneFee,
      customerType,
      returningPath,
      project,
      otherText,
      recommendedSize: size,
      selectedSize: effectiveSize,
      rentalOption: duration,
      pricingShown: calculatedPrices,
      contact: form,
    };

    console.log(payload);
    alert("Lead captured (next step: Odoo)");
  };

  const goBack = () => {
    if (step === 6) {
      setStep(5);
      return;
    }
    if (step === 5) {
      if (customerType === "Returning" && returningPath === "quick") {
        setStep(2);
      } else {
        setStep(4);
      }
      return;
    }
    if (step === 4) {
      setStep(3);
      return;
    }
    if (step === 3) {
      if (customerType === "Returning") {
        setStep(2);
      } else {
        setStep(1);
      }
      return;
    }
    if (step === 2) {
      setStep(1);
      return;
    }
    if (step === 1) {
      setStep(0);
      return;
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.heroBanner}>
          <div style={styles.logoText}>Little Junkers</div>
          <h1 style={styles.heroTitle}>Dumpster Rentals for DIY Cleanup</h1>
          <p style={styles.heroSubtitle}>
            You load it. We haul it. Simple, fast, and built for homeowners,
            repeat customers, and small contractors.
          </p>
        </div>

        <div style={styles.progressWrap}>
          <div style={styles.progressMeta}>
            <span style={styles.progressStep}>
              Step {currentVisualStep} of {visibleTotalSteps}
            </span>
            <span style={styles.progressLabel}>{stepLabel}</span>
          </div>
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progressPercent}%`,
              }}
            />
          </div>
        </div>

        <main style={styles.card}>
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
                title="Let’s make sure we service your area"
                text="Enter your ZIP code first so we can show pricing with delivery included."
              />

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
            </>
          )}

          {step === 1 && (
            <>
              <SectionTitle
                title="Let’s get you the right dumpster"
                text={`ZIP ${zip} is in our ${zones[zoneKey]?.label || ""}. ${
                  zoneFee > 0
                    ? `Delivery fee of $${zoneFee} will be included in pricing.`
                    : "Delivery is included in pricing."
                }`}
              />

              <div style={styles.optionGrid}>
                {[
                  {
                    label: "New Customer",
                    sub: "First time renting with us",
                  },
                  {
                    label: "Returning",
                    sub: "You’ve rented from us before",
                  },
                  {
                    label: "Contractor",
                    sub: "Business or repeat jobsite use",
                  },
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
                title="Welcome back"
                text="Want a quick path, or would you like a fresh recommendation?"
              />

              <div style={styles.optionGrid}>
                <OptionCard
                  title="Quick Select"
                  sub="I know what I need"
                  selected={returningPath === "quick"}
                  onClick={() => {
                    setReturningPath("quick");
                    setStep(5);
                  }}
                />
                <OptionCard
                  title="Recommend for Me"
                  sub="Guide me through the best fit"
                  selected={returningPath === "recommend"}
                  onClick={() => {
                    setReturningPath("recommend");
                    setStep(3);
                  }}
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
                    : "What kind of cleanup are you tackling?"
                }
                text={
                  customerType === "Contractor"
                    ? "We’ll filter out the stuff we don’t haul and point you toward the best fit."
                    : "Pick the project type that’s closest to your job."
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
                  <button
                    style={styles.primaryButton}
                    onClick={() => {
                      const reco = getRecommendation(customerType, "Other", otherText);
                      setSize(reco.size);
                      setOverrideSize("");
                      setShowOtherSizes(false);
                      setStep(4);
                    }}
                  >
                    Continue
                  </button>
                </div>
              )}

              {showConcreteNotice && (
                <div style={styles.noticeBox}>
                  <div style={styles.noticeTitle}>Concrete isn’t something we haul right now</div>
                  <p style={styles.noticeText}>
                    We’d still love to help with general cleanup, renovation debris,
                    roofing, and other non-concrete projects.
                  </p>
                  <button
                    style={styles.noticeButton}
                    onClick={() => {
                      setShowConcreteNotice(false);
                    }}
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
                title="This is your best fit"
                text="We’re aiming to recommend the size most likely to keep your project moving without running out of space."
              />

              <div style={styles.recoBox}>
                <div style={styles.recoBadge}>Recommended</div>
                <div style={styles.recoSize}>{size}</div>
                <div style={styles.recoBody}>
                  <div style={styles.recoSubTitle}>Holds:</div>
                  <ul style={styles.capacityList}>
                    {recommendation.holds.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>

                  <p style={styles.recoText}>{recommendation.reason}</p>

                  <div style={styles.recoCallout}>
                    <strong>Why this size:</strong> {recommendation.note}
                  </div>

                  <div style={styles.socialProof}>👍 Most customers choose this size</div>
                </div>
              </div>

              {customerType !== "Contractor" && availableOtherSizes.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  {!showOtherSizes ? (
                    <button
                      style={styles.secondaryLink}
                      onClick={() => setShowOtherSizes(true)}
                    >
                      See other size options
                    </button>
                  ) : (
                    <div style={styles.altSizeWrap}>
                      <div style={styles.altSizeTitle}>Going against the recommendation?</div>
                      <div style={styles.altSizeText}>
                        That’s okay — here are smaller options, but they may fill faster than expected.
                      </div>
                      <div style={styles.optionGrid}>
                        {availableOtherSizes.map((alt) => (
                          <OptionCard
                            key={alt}
                            title={alt}
                            sub={alt === size ? "Recommended" : "Smaller option"}
                            selected={effectiveSize === alt}
                            onClick={() => setOverrideSize(alt === size ? "" : alt)}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <button onClick={() => setStep(5)} style={styles.primaryButton}>
                Continue
              </button>
            </>
          )}

          {step === 5 && (
            <>
              <SectionTitle
                title="Pick how you want to run your project"
                text="Pricing below already includes your delivery area."
              />

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
                            Starting at{" "}
                            {typeof displayPrice === "number"
                              ? `$${displayPrice}`
                              : "Call for pricing"}
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
                title="Let’s lock this in"
                text="We’ll use this info to confirm your request and get everything lined up."
              />

              <div style={styles.summaryBox}>
                <div style={styles.summaryTitle}>Your Selection</div>
                <div style={styles.summaryRow}>
                  <span>ZIP</span>
                  <strong>{zip}</strong>
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
                  <span>Rental</span>
                  <strong>{duration || "-"}</strong>
                </div>
              </div>

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
                Submit
              </button>
            </>
          )}
        </main>
      </div>
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

function getAlternativeSizes(recommended) {
  if (recommended === "21 Yard") return ["21 Yard", "16 Yard", "11 Yard"];
  if (recommended === "16 Yard") return ["16 Yard", "11 Yard"];
  if (recommended === "11 Yard") return ["11 Yard"];
  return [];
}

function getRecommendation(customerType, project, otherText = "") {
  const otherLower = String(otherText || "").toLowerCase();

  if (customerType === "Contractor") {
    if (project === "Roofing") {
      return {
        size: "11 Yard",
        holds: [
          "Smaller, controlled roofing loads",
          "Heavy debris with better weight management",
          "Projects where multiple pulls may make more sense",
        ],
        reason:
          "Roofing debris trends heavy, so we keep the recommendation tighter to protect against overloaded containers.",
        note:
          "If volume is higher, you may need more than one haul — but starting smaller is the safer move.",
      };
    }

    if (project === "Renovation / demo") {
      return {
        size: "16 Yard",
        holds: [
          "Renovation debris",
          "Light-to-moderate demo work",
          "Bigger cleanup loads without jumping too large",
        ],
        reason:
          "For most contractor demo jobs, the 16-yard is the best starting point before moving into more complex multi-container logic.",
        note:
          "This gives room without tying up your biggest container unless the project really needs it.",
      };
    }

    return {
      size: "16 Yard",
      holds: [
        "General contractor cleanup",
        "Mixed debris loads",
        "Flexible jobsite use",
      ],
      reason:
        "For contractor work, the 16-yard is the strongest default because it balances volume, versatility, and turnaround.",
      note:
        "As the funnel evolves, this is the path that can become your contractor fast lane.",
    };
  }

  if (project === "Cleaning the garage / basement") {
    return {
      size: "16 Yard",
      holds: [
        "2–3 rooms of furniture",
        "Garage or basement cleanout",
        "Bulkier household cleanup items",
      ],
      reason:
        "Garage and basement projects almost always grow once you get started, so the 16-yard gives helpful breathing room.",
      note:
        "Choosing smaller often leads to running out of space faster than expected.",
    };
  }

  if (project === "Moving / decluttering") {
    return {
      size: "11 Yard",
      holds: [
        "Lighter decluttering jobs",
        "Smaller household cleanouts",
        "Limited furniture and bagged junk",
      ],
      reason:
        "For lighter projects, the 11-yard can work well when the material is mostly household junk and not bulky demo debris.",
      note:
        "If you start adding furniture, attic cleanup, or extra rooms, the 16-yard becomes the safer choice.",
    };
  }

  if (project === "Renovation / demo") {
    return {
      size: "16 Yard",
      holds: [
        "Renovation debris",
        "Demo materials from smaller jobs",
        "More volume than a light cleanout",
      ],
      reason:
        "Renovation projects create more unpredictable debris, so the 16-yard is the safer recommendation for keeping the project moving.",
      note:
        "Most customers doing this kind of project are happier with a little extra room.",
    };
  }

  if (project === "Roofing") {
    return {
      size: "11 Yard",
      holds: [
        "Smaller, weight-conscious roofing loads",
        "Heavy debris with better control",
        "Jobs where multiple smaller pulls make sense",
      ],
      reason:
        "Roofing debris gets heavy quickly, so a smaller container is the better starting point for weight control.",
      note:
        "We’d rather guide you toward a safer fit than oversell a bigger box that becomes too heavy.",
    };
  }

  if (project === "Other") {
    if (
      otherLower.includes("attic") ||
      otherLower.includes("furniture") ||
      otherLower.includes("garage")
    ) {
      return {
        size: "16 Yard",
        holds: [
          "Garage + attic overflow",
          "Bulkier furniture loads",
          "Mixed household cleanup",
        ],
        reason:
          "Based on what you described, the 16-yard sounds like the safer choice for mixed cleanup volume.",
        note:
          "This gives you more room if the job grows once you get started.",
      };
    }

    return {
      size: "16 Yard",
      holds: [
        "Mixed cleanup jobs",
        "Unclear or expanding projects",
        "More flexibility without going oversized",
      ],
      reason:
        "When a project is mixed or unclear, the 16-yard is usually the safest recommendation because it gives flexibility without overshooting too much.",
      note:
        "This is where smarter recommendation logic can get even stronger later.",
    };
  }

  return {
    size: "16 Yard",
    holds: [
      "Mixed cleanup jobs",
      "Garage or basement projects",
      "Light renovation debris",
    ],
    reason:
      "The 16-yard is a strong default because it handles most residential jobs better than the smallest option.",
    note:
      "It’s the most common recommendation for a reason — it leaves room for the project to grow.",
  };
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #fff8fb 0%, #ffffff 22%)",
    padding: "36px 16px",
    color: COLORS.charcoalDark,
  },
  shell: {
    maxWidth: 760,
    margin: "0 auto",
  },
  heroBanner: {
    background: COLORS.pink,
    borderRadius: 20,
    padding: "24px 20px",
    marginBottom: 24,
    textAlign: "center",
  },
  logoText: {
    fontSize: 16,
    fontWeight: 800,
    color: COLORS.charcoalDark,
    marginBottom: 10,
    letterSpacing: 0.4,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: 800,
    margin: "0 0 6px 0",
    color: COLORS.charcoalDark,
  },
  heroSubtitle: {
    fontSize: 15,
    color: COLORS.charcoal,
    margin: 0,
    lineHeight: 1.6,
  },
  progressWrap: {
    marginBottom: 20,
  },
  progressMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 8,
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
    background: "#f0f0f0",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: COLORS.charcoal,
    borderRadius: 999,
    transition: "width 180ms ease",
  },
  card: {
    background: COLORS.white,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 24,
    padding: 28,
    boxShadow: "0 10px 32px rgba(0,0,0,0.06)",
  },
  topRow: {
    marginBottom: 10,
  },
  backButton: {
    background: "none",
    border: "none",
    fontSize: 14,
    color: COLORS.gray,
    cursor: "pointer",
    padding: 0,
    fontWeight: 700,
  },
  h2: {
    margin: "0 0 8px 0",
    fontSize: 28,
    color: COLORS.charcoalDark,
  },
  sectionText: {
    margin: 0,
    color: COLORS.gray,
    fontSize: 16,
    lineHeight: 1.5,
  },
  optionGrid: {
    display: "grid",
    gap: 14,
  },
  optionCard: {
    width: "100%",
    textAlign: "left",
    padding: "18px 18px",
    borderRadius: 18,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.grayLight,
    cursor: "pointer",
  },
  optionCardSelected: {
    background: COLORS.successBg,
    border: `1px solid ${COLORS.pink}`,
    boxShadow: "0 0 0 3px rgba(255,206,228,0.35)",
  },
  highlightCard: {
    border: `2px solid ${COLORS.pink}`,
    transform: "scale(1.01)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.08)",
  },
  optionTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: COLORS.charcoalDark,
  },
  optionSub: {
    marginTop: 6,
    color: COLORS.gray,
    fontSize: 14,
    lineHeight: 1.4,
  },
  tag: {
    background: COLORS.pink,
    color: COLORS.charcoalDark,
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 10px",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  recoBox: {
    borderRadius: 22,
    border: `1px solid ${COLORS.pink}`,
    background: COLORS.successBg,
    padding: 22,
    marginBottom: 18,
  },
  recoBadge: {
    display: "inline-block",
    background: COLORS.charcoalDark,
    color: COLORS.white,
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 14,
  },
  recoSize: {
    fontSize: 34,
    fontWeight: 800,
    color: COLORS.charcoalDark,
    marginBottom: 12,
  },
  recoBody: {
    color: COLORS.charcoalDark,
  },
  recoSubTitle: {
    fontWeight: 800,
    marginBottom: 8,
  },
  capacityList: {
    marginTop: 0,
    marginBottom: 14,
    paddingLeft: 20,
    lineHeight: 1.8,
    color: COLORS.gray,
  },
  recoText: {
    margin: "0 0 14px 0",
    fontSize: 16,
    lineHeight: 1.6,
    color: COLORS.charcoalDark,
  },
  recoCallout: {
    background: COLORS.white,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    padding: 14,
    color: COLORS.gray,
    lineHeight: 1.5,
    fontSize: 14,
    marginBottom: 12,
  },
  socialProof: {
    fontSize: 14,
    fontWeight: 700,
    color: COLORS.charcoalDark,
  },
  altSizeWrap: {
    background: COLORS.grayLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 18,
    padding: 16,
  },
  altSizeTitle: {
    fontWeight: 800,
    marginBottom: 6,
  },
  altSizeText: {
    fontSize: 14,
    color: COLORS.gray,
    marginBottom: 14,
    lineHeight: 1.5,
  },
  secondaryLink: {
    background: "none",
    border: "none",
    color: COLORS.charcoalDark,
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    padding: 0,
  },
  primaryButton: {
    display: "block",
    width: "100%",
    marginTop: 18,
    padding: 16,
    background: COLORS.charcoal,
    color: COLORS.white,
    border: "none",
    borderRadius: 16,
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
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
  },
  input: {
    display: "block",
    width: "100%",
    padding: 14,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    background: COLORS.grayLight,
    fontSize: 15,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    minHeight: 100,
    marginTop: 8,
    padding: 14,
    borderRadius: 14,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.grayLight,
    fontSize: 15,
    boxSizing: "border-box",
    resize: "vertical",
  },
  summaryBox: {
    marginBottom: 18,
    background: COLORS.grayLight,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 18,
    padding: 18,
  },
  summaryTitle: {
    fontWeight: 800,
    fontSize: 16,
    marginBottom: 12,
    color: COLORS.charcoalDark,
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    padding: "8px 0",
    borderBottom: "1px solid #ececec",
    color: COLORS.gray,
    fontSize: 14,
  },
  priceText: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: 800,
    color: COLORS.charcoalDark,
  },
  noticeBox: {
    marginTop: 16,
    background: COLORS.warningBg,
    border: `1px solid ${COLORS.warningBorder}`,
    borderRadius: 16,
    padding: 16,
  },
  noticeTitle: {
    fontWeight: 800,
    color: COLORS.charcoalDark,
    marginBottom: 8,
  },
  noticeText: {
    margin: 0,
    color: COLORS.charcoal,
    lineHeight: 1.6,
  },
  noticeButton: {
    marginTop: 14,
    padding: "12px 16px",
    background: COLORS.charcoal,
    color: COLORS.white,
    border: "none",
    borderRadius: 12,
    cursor: "pointer",
    fontWeight: 700,
  },
  errorText: {
    marginTop: 10,
    color: "#b3261e",
    fontSize: 14,
    lineHeight: 1.5,
  },
};
