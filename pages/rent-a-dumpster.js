import { useState } from "react";

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
    source: ""
  });

  const darkGray = "#545454";
  const pink = "#ffcee4";

  const recommendSize = (type) => {
    if (type === "Cleaning the garage / basement") return "16 Yard";
    if (type === "Moving / decluttering") return "11 Yard";
    if (type === "Renovation / demo") return "16 Yard";
    if (type === "Roofing") return "21 Yard";
    return "16 Yard";
  };

  const handleSubmit = () => {
    if (!form.name || !form.email) {
      alert("Please enter name and email");
      return;
    }

    console.log({
      customerType,
      project,
      size,
      duration,
      form
    });

    alert("Lead captured (next step: Odoo)");
  };

  return (
    <div style={{ fontFamily: "sans-serif", padding: 30, maxWidth: 600, margin: "auto" }}>
      <h1>Rent a Dumpster</h1>

      {/* STEP 1 — CUSTOMER TYPE */}
      {step === 1 && (
        <>
          <h3>Who is this for?</h3>

          {["New Customer", "Returning", "Contractor"].map((type) => (
            <button
              key={type}
              onClick={() => {
                setCustomerType(type);
                setStep(2);
              }}
              style={btn}
            >
              {type}
            </button>
          ))}
        </>
      )}

      {/* STEP 2 — PROJECT TYPE */}
      {step === 2 && (
        <>
          <h3>What are you working on?</h3>

          {[
            "Cleaning the garage / basement",
            "Moving / decluttering",
            "Renovation / demo",
            "Roofing",
            "Other"
          ].map((type) => (
            <button
              key={type}
              onClick={() => {
                setProject(type);
                setSize(recommendSize(type));
                setStep(3);
              }}
              style={btn}
            >
              {type}
            </button>
          ))}
        </>
      )}

      {/* STEP 3 — RECOMMENDATION */}
      {step === 3 && (
        <>
          <h3>Recommended Size: {size}</h3>
          <p>Based on your project, this is the best fit.</p>

          <button onClick={() => setStep(4)} style={btnPrimary}>
            Continue
          </button>
        </>
      )}

      {/* STEP 4 — DELIVERY OPTIONS */}
      {step === 4 && (
        <>
          <h3>Select Your Rental Option</h3>

          {[
            "Monday / Tuesday Delivery — Best Price",
            "Friday / Weekend Warrior — Most Popular",
            "Two-Day Rental",
            "Weekly Rental — Best for bigger cleanouts"
          ].map((option) => (
            <button
              key={option}
              onClick={() => {
                setDuration(option);
                setStep(5);
              }}
              style={btn}
            >
              {option}
            </button>
          ))}
        </>
      )}

      {/* STEP 5 — LEAD FORM */}
      {step === 5 && (
        <>
          <h3>Get Your Dumpster Reserved</h3>

          <input
            placeholder="Name (required)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={input}
          />

          <input
            placeholder="Email (required)"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={input}
          />

          <input
            placeholder="Phone (for faster scheduling — optional)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            style={input}
          />

          <select
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            style={input}
          >
            <option value="">How did you hear about us?</option>
            <option>Google</option>
            <option>Facebook</option>
            <option>Referral</option>
            <option>Repeat Customer</option>
          </select>

          <button onClick={handleSubmit} style={btnPrimary}>
            Submit
          </button>
        </>
      )}
    </div>
  );
}

/* STYLES */
const btn = {
  display: "block",
  width: "100%",
  marginBottom: 10,
  padding: 12,
  background: "#f5f5f5",
  border: "1px solid #ddd",
  cursor: "pointer"
};

const btnPrimary = {
  display: "block",
  width: "100%",
  marginTop: 20,
  padding: 14,
  background: "#545454",
  color: "white",
  border: "none",
  cursor: "pointer"
};

const input = {
  display: "block",
  width: "100%",
  marginBottom: 10,
  padding: 12,
  border: "1px solid #ccc"
};
