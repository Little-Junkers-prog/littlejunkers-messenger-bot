// pages/book.js
// Handles /book?status=success&session_id=... and /book?status=cancelled

import { useEffect, useState } from "react";

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

export default function BookPage() {
  const [status, setStatus]       = useState(null); // "success" | "cancelled" | null
  const [sessionId, setSessionId] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [dumpsterSize, setDumpsterSize] = useState("");
  const [rentalOption, setRentalOption] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s   = params.get("status");
    const sid = params.get("session_id");
    setStatus(s || "success");
    setSessionId(sid || null);

    if (s === "success" && sid) {
      // Fetch session metadata to personalize the confirmation
      fetch(`/api/checkout-session?session_id=${sid}`)
        .then(r => r.json())
        .then(data => {
          if (data?.customer_name) setCustomerName(data.customer_name);
          if (data?.dumpster_size) setDumpsterSize(data.dumpster_size);
          if (data?.rental_option) setRentalOption(data.rental_option);
          if (data?.delivery_date) setDeliveryDate(data.delivery_date);
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
              { step:"3", label:"Delivery day", detail:"Your driver will arrive during the agreed window. Make sure the drop spot is clear." },
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
