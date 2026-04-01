import { useState } from "react";

export default function Funnel() {
  const [step, setStep] = useState(1);
  const [project, setProject] = useState("");
  const [size, setSize] = useState("");

  const recommendSize = (type) => {
    if (type === "garage") return "16 Yard";
    if (type === "moving") return "11 Yard";
    return "16 Yard";
  };

  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Rent a Dumpster</h1>

      {step === 1 && (
        <div>
          <h3>What are you working on?</h3>

          <button onClick={() => {
            setProject("garage");
            setSize(recommendSize("garage"));
            setStep(2);
          }}>
            Garage Cleanout
          </button>

          <button onClick={() => {
            setProject("moving");
            setSize(recommendSize("moving"));
            setStep(2);
          }}>
            Moving / Decluttering
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3>Recommended Size: {size}</h3>

          <button onClick={() => setStep(3)}>
            Continue
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3>Contact Info</h3>

          <input placeholder="Name" /><br /><br />
          <input placeholder="Phone" /><br /><br />
          <input placeholder="Email" /><br /><br />

          <button onClick={() => alert("Lead captured (next step: Odoo)")}>
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
