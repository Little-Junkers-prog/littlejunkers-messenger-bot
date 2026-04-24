import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

const C = {
  pageBg: "#edeae4",
  cardBg: "#ffffff",
  cardBorder: "#e5e0d8",
  surfaceBg: "#faf8f5",
  surfaceBorder: "#e8e3db",
  ink: "#1a1a1a",
  inkMid: "#555555",
  inkMuted: "#777777",
  inkFaint: "#b8b0a6",
  pinkText: "#c2587a",
  warningBg: "#fff8eb",
  warningBorder: "#f2cf7a",
  white: "#ffffff",
};

const F = "system-ui, -apple-system, sans-serif";

function asText(value, fallback = "") {
  if (value === null || value === undefined) return fallback;
  const s = String(value).trim();
  return s || fallback;
}

function parseMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(value) {
  return `$${parseMoney(value).toFixed(0)}`;
}

function getRentalDisplayLabel(key) {
  const map = {
    "Base Rental": "2-Day Basic",
    "Early Bird": "2-Day Budget",
    "Weekend Warrior": "4-Day",
    "Full Reset": "7-Day",
  };
  return map[key] || key || "-";
}

function sizeCodeToLabel(sizeCode) {
  const map = { "11YD": "11 Yard", "16YD": "16 Yard", "21YD": "21 Yard" };
  return map[String(sizeCode || "").toUpperCase()] || asText(sizeCode);
}

function formatDateLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function buildSummaryFromQuery(query) {
  const basePrice = parseMoney(query.basePrice);
  const deliveryFee = parseMoney(query.deliveryFee);
  return {
    holdId: asText(query.holdId),
    size: asText(query.size),
    rentalOption: asText(query.rentalOption),
    basePrice,
    deliveryFee,
    total: basePrice + deliveryFee,
    zone: asText(query.zone),
    areaLabel: asText(query.areaLabel),
    zip: asText(query.zip),
    startLabel: asText(query.startLabel),
    endLabel: asText(query.endLabel),
    startIso: asText(query.startIso),
    endIso: asText(query.endIso),
    deliveryDate: asText(query.deliveryDate),
  };
}

function buildSummaryFromHold(hold) {
  const metadata = hold?.metadata || {};
  const selectedWindow = metadata.selectedWindow || {};
  const basePrice = parseMoney(metadata.basePrice || metadata.priceBreakdown?.basePrice);
  const deliveryFee = parseMoney(metadata.deliveryFee || metadata.priceBreakdown?.deliveryFee);
  const startIso = asText(hold?.requested_start_at || selectedWindow.startIso);
  const endIso = asText(hold?.requested_end_at || selectedWindow.endIso);

  return {
    holdId: asText(hold?.id),
    size: sizeCodeToLabel(hold?.size_code),
    rentalOption: asText(hold?.rental_option || metadata.rentalOption),
    basePrice,
    deliveryFee,
    total: basePrice + deliveryFee,
    zone: asText(metadata.zone),
    areaLabel: asText(metadata.areaLabel),
    zip: asText(metadata.zip),
    startLabel: asText(selectedWindow.start, formatDateLabel(startIso)),
    endLabel: asText(selectedWindow.end, formatDateLabel(endIso)),
    startIso,
    endIso,
    deliveryDate: asText(hold?.delivery_date || metadata.deliveryDate),
  };
}

export default function CompleteBookingPage() {
  const router = useRouter();
  const query = router.query || {};
  const [holdSummary, setHoldSummary] = useState(null);
  const [loadingHold, setLoadingHold] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    street1: "",
    street2: "",
    city: "",
    state: "GA",
    zip: "",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const querySummary = useMemo(() => buildSummaryFromQuery(query), [query]);
  const summary = holdSummary || querySummary;

  useEffect(() => {
    if (!router.isReady) return;

    const holdId = asText(query.holdId);
    if (!holdId) return;

    let active = true;
    (async () => {
      try {
        setLoadingHold(true);
        const response = await fetch(`/api/get-booking-hold?holdId=${encodeURIComponent(holdId)}`);
        const json = await response.json();
        if (!active) return;
        if (response.ok && json.success && json.hold) {
          const nextSummary = buildSummaryFromHold(json.hold);
          setHoldSummary(nextSummary);
          setForm((prev) => ({ ...prev, zip: prev.zip || nextSummary.zip || "" }));
        }
      } catch (err) {
        if (active) setError("We could not load all booking details. You can still continue if the summary looks correct.");
      } finally {
        if (active) setLoadingHold(false);
      }
    })();

    return () => { active = false; };
  }, [router.isReady, query.holdId]);

  useEffect(() => {
    if (summary.zip) setForm((prev) => ({ ...prev, zip: prev.zip || summary.zip }));
  }, [summary.zip]);

  async function handleCheckout() {
    if (!summary.holdId) {
      setError("This link is missing its booking hold. Please ask the office to generate a new one.");
      return;
    }

    if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.street1.trim() || !form.city.trim() || !form.zip.trim()) {
      setError("Please complete your contact information and delivery address.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const deliveryAddress = {
        street1: form.street1.trim(),
        street2: form.street2.trim(),
        city: form.city.trim(),
        state: form.state.trim() || "GA",
        zip: form.zip.trim(),
      };

      const updateResponse = await fetch("/api/update-booking-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdId: summary.holdId,
          areaLabel: summary.areaLabel,
          zone: summary.zone,
          zip: deliveryAddress.zip,
          contact: {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
          },
          deliveryAddress,
          notes: form.notes.trim(),
          funnelSource: "csr_quick_book",
        }),
      });

      const updateJson = await updateResponse.json();
      if (!updateResponse.ok || !updateJson.success) throw new Error(updateJson.error || "Unable to save your booking details.");

      const checkoutResponse = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingHoldId: summary.holdId,
          customerEmail: form.email.trim(),
          customerName: form.name.trim(),
          customerPhone: form.phone.trim(),
          dumpsterSize: summary.size,
          rentalOption: summary.rentalOption,
          basePrice: summary.basePrice,
          deliveryFee: summary.deliveryFee,
          zone: summary.zone,
          zip: deliveryAddress.zip,
          areaLabel: summary.areaLabel,
          deliveryDate: summary.deliveryDate,
          selectedWindow: {
            startIso: summary.startIso,
            endIso: summary.endIso,
          },
        }),
      });

      const checkoutJson = await checkoutResponse.json();
      if (!checkoutResponse.ok || !checkoutJson.url) throw new Error(checkoutJson.error || "Unable to start checkout.");

      window.location.href = checkoutJson.url;
    } catch (err) {
      setError(err.message || "Something went wrong while preparing checkout.");
      setSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, padding: "24px 14px", fontFamily: F }}>
      <style jsx>{`
        .booking-grid{display:grid;gap:18px;grid-template-columns:1.1fr .9fr;align-items:start}
        .city-grid{display:grid;grid-template-columns:1fr 110px 120px;gap:12px}
        @media (max-width:760px){
          .booking-grid{grid-template-columns:1fr}
          .city-grid{grid-template-columns:1fr 90px 1fr}
          .page-title{font-size:30px!important}
          .mobile-card{padding:18px!important}
        }
        @media (max-width:430px){
          .city-grid{grid-template-columns:1fr}
        }
      `}</style>
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.pinkText, textTransform: "uppercase", letterSpacing: "1.2px" }}>Little Junkers</div>
          <h1 className="page-title" style={{ margin: "8px 0 10px", fontSize: 38, lineHeight: 1.05, color: C.ink }}>Complete your dumpster booking</h1>
          <p style={{ margin: 0, color: C.inkMid, fontSize: 15, lineHeight: 1.6 }}>Finish your contact details and service address, then continue to secure checkout.</p>
        </div>

        <div className="booking-grid">
          <div className="mobile-card" style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 20, padding: 22 }}>
            <SectionLabel>Your details</SectionLabel>
            <div style={{ display: "grid", gap: 12 }}>
              <Field label="Full name *"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle()} /></Field>
              <Field label="Email *"><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle()} /></Field>
              <Field label="Phone *"><input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle()} /></Field>
              <Field label="Street address *"><input value={form.street1} onChange={(e) => setForm({ ...form, street1: e.target.value })} style={inputStyle()} /></Field>
              <Field label="Address line 2"><input value={form.street2} onChange={(e) => setForm({ ...form, street2: e.target.value })} style={inputStyle()} /></Field>
              <div className="city-grid">
                <Field label="City *"><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle()} /></Field>
                <Field label="State *"><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} style={inputStyle()} /></Field>
                <Field label="ZIP *"><input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} style={inputStyle()} /></Field>
              </div>
              <Field label="Delivery notes"><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={inputStyle({ minHeight: 96, resize: "vertical" })} /></Field>
            </div>
          </div>

          <div className="mobile-card" style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 20, padding: 22, alignSelf: "start" }}>
            <SectionLabel>Booking summary</SectionLabel>
            <div style={summaryCardStyle}>
              <SummaryRow label="Dumpster" value={summary.size || "-"} strong />
              <SummaryRow label="Rental" value={getRentalDisplayLabel(summary.rentalOption)} />
              <SummaryRow label="Service area" value={summary.areaLabel || summary.zip || "-"} />
              <SummaryRow label="Delivery window" value={summary.startLabel ? `${summary.startLabel} to ${summary.endLabel}` : loadingHold ? "Loading..." : "To be confirmed"} />
              <SummaryRow label="Base rental" value={formatMoney(summary.basePrice)} />
              <SummaryRow label="Delivery fee" value={summary.deliveryFee > 0 ? formatMoney(summary.deliveryFee) : "Included"} />
              <div style={{ height: 1, background: C.surfaceBorder, margin: "10px 0" }} />
              <SummaryRow label="Estimated total" value={formatMoney(summary.total)} strong />
            </div>

            {error ? <div style={{ marginTop: 14, background: C.warningBg, border: `1px solid ${C.warningBorder}`, borderRadius: 12, padding: "12px 14px", fontSize: 13, color: C.ink }}>{error}</div> : null}

            <button onClick={handleCheckout} disabled={submitting || loadingHold} style={{ width: "100%", marginTop: 16, padding: "15px 16px", borderRadius: 12, border: "none", background: C.ink, color: C.white, fontSize: 15, fontWeight: 800, cursor: submitting || loadingHold ? "wait" : "pointer" }}>
              {submitting ? "Preparing checkout..." : loadingHold ? "Loading booking..." : "Continue to secure checkout"}
            </button>

            <p style={{ margin: "12px 0 0", color: C.inkMuted, fontSize: 12, lineHeight: 1.55 }}>Your delivery timing stays tied to the office-selected hold so we can keep your booking in the same reservation flow.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 800, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 14 }}>{children}</div>;
}

function Field({ label, children }) {
  return <label style={{ display: "block" }}><div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: C.ink }}>{label}</div>{children}</label>;
}

function SummaryRow({ label, value, strong = false }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", padding: "7px 0" }}><div style={{ color: C.inkMuted, fontSize: 13 }}>{label}</div><div style={{ color: C.ink, fontSize: 14, fontWeight: strong ? 800 : 600, textAlign: "right", maxWidth: "58%" }}>{value}</div></div>;
}

const summaryCardStyle = { background: C.surfaceBg, border: `1px solid ${C.surfaceBorder}`, borderRadius: 14, padding: "14px 16px" };

function inputStyle(extra = {}) {
  return { display: "block", width: "100%", padding: "13px 14px", borderRadius: 10, border: `1px solid ${C.surfaceBorder}`, background: C.white, fontFamily: F, fontSize: 16, boxSizing: "border-box", ...extra };
}
