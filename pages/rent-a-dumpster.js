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
};

const TOTAL_STEPS = 5;

export default function Funnel() {
  const [step, setStep] = useState(1);
  const [customerType, setCustomerType] = useState("");
  const [project, setProject] = useState("");
  const [size, setSize] = useState("");
  const [duration, setDuration] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    source: "",
  });

  const recommendation = useMemo(() => {
    return getRecommendation(customerType, project);
  }, [customerType, project]);

  const progressPercent = (step / TOTAL_STEPS) * 100;

  const handleSubmit = () => {
    if (!form.name.trim() || !form.email.trim()) {
      alert("Please enter your name and email.");
      return;
    }

    console.log({
      customerType,
      project,
      size,
      duration,
      form,
    });

    alert("Lead captured (next step: Odoo)");
  };

  const goBack = () => {
    setStep((prev) => Math.max(1, prev - 1));
  };

  const stepLabel = {
    1: "Customer Type",
    2: "Project Type",
    3: "Recommendation",
    4: "Rental Option",
    5: "Contact Info",
  }[step];

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.eyebrow}>Little Junkers</div>
          <h1 style={styles.h1}>Rent a Dumpster</h1>
          <p style={styles.subhead}>
            Tell us about your project and we’ll point you to the right rental
            option.
          </p>

          <div style={styles.progressWrap}>
            <div style={styles.progressMeta}>
              <span style={styles.progressStep}>Step {step} of {TOTAL_STEPS}</span>
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
        </header>

        <main style={styles.card}>
          {step === 1 && (
            <>
              <SectionTitle
                title="Who is this for?"
                text="Choose the path that best matches your situation."
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
                    onClick={() => {
                      setCustomerType(item.label);
                      setStep(2);
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <SectionTitle
                title="What are you working on?"
                text="Pick the project type that’s closest to your job."
              />

              <div style={styles.optionGrid}>
                {[
                  "Cleaning the garage / basement",
                  "Moving / decluttering",
                  "Renovation / demo",
                  "Roofing",
                  "Other",
                ].map((type) => (
                  <OptionCard
                    key={type}
                    title={type}
                    selected={project === type}
                    onClick={() => {
                      setProject(type);
                      setSize(getRecommendation(customerType, type).size);
                      setStep(3);
                    }}
                  />
                ))}
              </div>

              <BackButton onClick={goBack} />
            </>
          )}

          {step === 3 && (
            <>
              <SectionTitle
                title="Here’s what we recommend"
                text="Based on what you told us, this is the best place to start."
              />

              <div style={styles.recoBox}>
                <div style={styles.recoBadge}>Recommended</div>
                <div style={styles.recoSize}>{recommendation.size}</div>
                <p style={styles.recoText}>{recommendation.reason}</p>

                <div style={styles.recoCallout}>
                  {recommendation.note}
                </div>
              </div>

              <button
                onClick={() => setStep(4)}
                style={styles.primaryButton}
              >
                Continue
              </button>

              <BackButton onClick={goBack} />
            </>
          )}

          {step === 4 && (
            <>
              <SectionTitle
                title="Choose your rental option"
                text="We’ll make the weekday value easy to spot while still giving customers the weekend path."
              />

              <div style={styles.optionGrid}>
                {[
                  {
                    label: "Monday / Tuesday Delivery",
                    sub: "Best Price",
                    tag: "Best Value",
                  },
                  {
                    label: "Friday / Weekend Warrior",
                    sub: "Most Popular",
                    tag: "Most Popular",
                  },
                  {
                    label: "Two-Day Rental",
                    sub: "Fast turnaround",
                    tag: "Quick Job",
                  },
                  {
                    label: "Weekly Rental",
                    sub: "Best for bigger cleanouts",
                    tag: "Big Project",
                  },
                ].map((option) => (
                  <OptionCard
                    key={option.label}
                    title={option.label}
                    sub={option.sub}
                    tag={option.tag}
                    selected={duration === option.label}
                    onClick={() => {
                      setDuration(option.label);
                      setStep(5);
                    }}
                  />
                ))}
              </div>

              <BackButton onClick={goBack} />
            </>
          )}

          {step === 5 && (
            <>
              <SectionTitle
                title="Get your dumpster reserved"
                text="Name and email are required. Phone helps us schedule faster."
              />

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

              <div style={styles.summaryBox}>
                <div style={styles.summaryTitle}>Your Selection</div>
                <div style={styles.summaryRow}>
                  <span>Customer Type</span>
                  <strong>{customerType || "-"}</strong>
                </div>
                <div style={styles.summaryRow}>
                  <span>Project</span>
                  <strong>{project || "-"}</strong>
                </div>
                <div style={styles.summaryRow}>
                  <span>Recommended Size</span>
                  <strong>{size || "-"}</strong>
                </div>
                <div style={styles.summaryRow}>
                  <span>Rental Option</span>
                  <strong>{duration || "-"}</strong>
                </div>
              </div>

              <button onClick={handleSubmit} style={styles.primaryButton}>
                Submit
              </button>

              <BackButton onClick={goBack} />
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
        <div style={styles.optionTitle}>{title}</div>
        {tag ? <span style={styles.tag}>{tag}</span> : null}
      </div>
      {sub ? <div style={styles.optionSub}>{sub}</div> : null}
    </button>
  );
}

function BackButton({ onClick }) {
  return (
    <button onClick={onClick} style={styles.backButton}>
      ← Back
    </button>
  );
}

function getRecommendation(customerType, project) {
  if (customerType === "Contractor") {
    if (project === "Roofing") {
      return {
        size: "11 Yard",
        reason:
          "For roofing, we want to keep you in a smaller, more controlled option that works better with heavier material loads.",
        note:
          "Contractor note: for heavier debris, we can later build in logic for multiple 11-yard units or repeat pulls.",
      };
    }

    if (project === "Renovation / demo") {
      return {
        size: "16 Yard",
        reason:
          "For most contractor demo jobs, the 16-yard option is a strong default before stepping up into larger volume planning.",
        note:
          "As we expand this logic, contractor requests can branch into multi-dumpster or swap-package flows.",
      };
    }

    return {
      size: "16 Yard",
      reason:
        "For contractor work, the 16-yard option is the best starting point for speed, flexibility, and easier jobsite planning.",
      note:
        "This path can later become your contractor fast lane with account-based logic.",
    };
  }

  if (customerType === "Returning") {
    if (project === "Moving / decluttering") {
      return {
        size: "11 Yard",
        reason:
          "For lighter household cleanout work, the 11-yard is a good fit when you already know the process and want the lower-cost option.",
        note:
          "Returning customers can eventually skip more of this flow and move into a faster reorder path.",
      };
    }

    return {
      size: "16 Yard",
      reason:
        "Since you’ve rented before, the 16-yard is a strong default for most household projects without pushing you into overbuying capacity.",
      note:
        "This recommendation will get smarter once Randy-style logic and prior rental history are connected.",
      };
  }

  if (project === "Cleaning the garage / basement") {
    return {
      size: "16 Yard",
      reason:
        "Garage and basement projects usually grow once you get started. The 16-yard gives more breathing room and reduces the risk of overflow.",
      note:
        "This supports your upsell strategy away from under-sizing new residential customers.",
    };
  }

  if (project === "Moving / decluttering") {
    return {
      size: "11 Yard",
      reason:
        "For lighter decluttering projects, the 11-yard can work well when the material is mostly household junk and not bulky demo debris.",
      note:
        "Later we can add Randy logic to nudge some of these customers into a 16-yard based on item mix.",
    };
  }

  if (project === "Renovation / demo") {
    return {
      size: "16 Yard",
      reason:
        "Renovation and demo projects usually need more room and create more unpredictable debris, so the 16-yard is the safer recommendation.",
      note:
        "This is where your guided upsell becomes more important than just showing the cheapest option.",
    };
  }

  if (project === "Roofing") {
    return {
      size: "11 Yard",
      reason:
        "Roofing debris trends heavy, so a smaller container is the better starting point for weight control.",
      note:
        "Later, this path should branch into quantity-based and contractor-specific roofing logic.",
    };
  }

  return {
    size: "16 Yard",
    reason:
      "For mixed or unclear projects, the 16-yard is the safest recommendation because it gives flexibility without overshooting too much.",
    note:
      "This 'other' path is a good place to plug in Randy-style conversational logic later.",
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
  header: {
    marginBottom: 20,
  },
  eyebrow: {
    display: "inline-block",
    background: COLORS.pink,
    color: COLORS.charcoalDark,
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: 0.4,
    marginBottom: 14,
  },
  h1: {
    fontSize: "clamp(36px, 5vw, 54px)",
    lineHeight: 1.02,
    margin: "0 0 12px 0",
    color: COLORS.charcoalDark,
  },
  subhead: {
    margin: 0,
    color: COLORS.gray,
    fontSize: 18,
    lineHeight: 1.5,
    maxWidth: 620,
  },
  progressWrap: {
    marginTop: 24,
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
    transition: "all 120ms ease",
  },
  optionCardSelected: {
    background: COLORS.successBg,
    border: `1px solid ${COLORS.pink}`,
    boxShadow: "0 0 0 3px rgba(255,206,228,0.35)",
  },
  optionTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
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
    marginBottom: 10,
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
  backButton: {
    display: "inline-block",
    marginTop: 16,
    background: "transparent",
    color: COLORS.charcoalDark,
    border: "none",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 700,
    padding: 0,
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
  summaryBox: {
    marginTop: 20,
    marginBottom: 8,
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
};
