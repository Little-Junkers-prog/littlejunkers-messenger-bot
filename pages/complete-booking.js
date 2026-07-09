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

const basePricing = {
  "11 Yard": { "Early Bird": 225, "Weekend Warrior": 335, "Base Rental": 275, "Full Reset": 345 },
  "16 Yard": { "Early Bird": 275, "Weekend Warrior": 385, "Base Rental": 325, "Full Reset": 445 },
  "21 Yard": { "Early Bird": 385, "Weekend Warrior": 445, "Base Rental": 385, "Full Reset": 495 },
};

const zoneFees = { A: 0, B: 49, C: 89 };

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
    "2day_standard": "2-Day Basic",
    "2day_montue": "2-Day Budget",
    "4day": "4-Day",
    "7day": "7-Day",
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

function normalizeZone(zone) {
  return String(zone || "").trim().toUpperCase();
}

function getBasePrice(size, rentalOption, fallback = 0) {
  const canonical = parseMoney(basePricing[size]?.[rentalOption]);
  if (canonical > 0) return canonical;
  return parseMoney(fallback);
}

function getDeliveryFee(zone, fallback = 0) {
  const fromFallback = parseMoney(fallback);
  if (fromFallback > 0) return fromFallback;
  return parseMoney(zoneFees[normalizeZone(zone)]);
}

function parseCustomerDate(value) {
  const raw = asText(value);
  if (!raw) return null;

  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    return new Date(Number(isoDateOnly[1]), Number(isoDateOnly[2]) - 1, Number(isoDateOnly[3]));
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDateLabel(value) {
  const date = parseCustomerDate(value);
  if (!date) return asText(value);
  return date.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit" });
}

function emptyAddress() {
  return {
    street1: "",
    street2: "",
    city: "",
    state: "GA",
    zip: "",
  };
}

function parseFullStreetAddress(value) {
  const raw = asText(value).replace(/\s+/g, " ");
  if (!raw) return null;

  const commaMatch = raw.match(/^(.+?),\s*([^,]+),\s*(GA|Georgia),?\s*(\d{5}(?:-\d{4})?)$/i);
  if (!commaMatch) return null;

  const street1 = asText(commaMatch[1]);
  if (!/\d/.test(street1) || !/[A-Za-z]/.test(street1)) return null;

  return {
    street1,
    city: asText(commaMatch[2]),
    state: "GA",
    zip: asText(commaMatch[4]),
  };
}

function parseCityStateZip(value) {
  const raw = asText(value).replace(/\s+/g, " ");
  if (!raw) return null;

  const commaMatch = raw.match(/^([^,]+),\s*(GA|Georgia),?\s*(\d{5}(?:-\d{4})?)$/i);
  if (commaMatch) {
    return {
      city: asText(commaMatch[1]),
      state: "GA",
      zip: asText(commaMatch[3]),
    };
  }

  const looseMatch = raw.match(/^([A-Za-z][A-Za-z .'-]+)\s+(GA|Georgia)\s+(\d{5}(?:-\d{4})?)$/i);
  if (looseMatch) {
    return {
      city: asText(looseMatch[1]),
      state: "GA",
      zip: asText(looseMatch[3]),
    };
  }

  return null;
}

function looksLikeStreetAddress(value) {
  const raw = asText(value);
  if (!raw) return false;
  if (parseFullStreetAddress(raw)) return true;
  if (parseCityStateZip(raw)) return false;
  if (raw.split(",").length >= 3) return false;
  return /\d/.test(raw) && /[A-Za-z]/.test(raw);
}

function parseAddressPrefill(value) {
  if (!value) return emptyAddress();

  if (typeof value === "string") {
    const parsedFullAddress = parseFullStreetAddress(value);
    if (parsedFullAddress) {
      return {
        ...emptyAddress(),
        ...parsedFullAddress,
      };
    }

    const parsedLocation = parseCityStateZip(value);
    if (parsedLocation) {
      return {
        ...emptyAddress(),
        ...parsedLocation,
      };
    }

    return {
      ...emptyAddress(),
      street1: looksLikeStreetAddress(value) ? asText(value) : "",
    };
  }

  const candidateStreet = asText(value.street1 || value.street || value.address || value.full);
  const parsedFullAddress = parseFullStreetAddress(candidateStreet);
  const parsedLocation = parseCityStateZip(candidateStreet);

  if (parsedFullAddress) {
    return {
      ...emptyAddress(),
      ...parsedFullAddress,
      street2: asText(value.street2),
      city: asText(value.city || parsedFullAddress.city),
      state: asText(value.state || parsedFullAddress.state, "GA"),
      zip: asText(value.zip || parsedFullAddress.zip),
    };
  }

  const city = asText(value.city || parsedLocation?.city);
  const state = asText(value.state || parsedLocation?.state, "GA");
  const zip = asText(value.zip || parsedLocation?.zip);

  return {
    street1: looksLikeStreetAddress(candidateStreet) ? candidateStreet : "",
    street2: asText(value.street2),
    city,
    state,
    zip,
  };
}

function buildFormPrefillFromQuery(query) {
  const address = parseAddressPrefill(query.street1 || query.address);

  return {
    name: asText(query.name),
    email: asText(query.email),
    phone: asText(query.phone),
    street1: asText(address.street1),
    street2: asText(query.street2 || address.street2),
    city: asText(query.city || address.city),
    state: asText(query.state || address.state, "GA"),
    zip: asText(query.zip || address.zip),
    notes: asText(query.notes),
  };
}

function buildFormPrefillFromHold(hold) {
  const metadata = hold?.metadata || {};
  const address = parseAddressPrefill(metadata.deliveryAddress || metadata.delivery_address);

  return {
    name: asText(hold?.customer_name || metadata.customerName),
    email: asText(hold?.customer_email || metadata.customerEmail),
    phone: asText(hold?.customer_phone || metadata.customerPhone),
    street1: asText(address.street1),
    street2: asText(address.street2),
    city: asText(address.city),
    state: asText(address.state, "GA"),
    zip: asText(hold?.zip || metadata.zip || address.zip),
    notes: asText(metadata.notes || metadata.deliveryNotes),
  };
}

function mergeFormPrefill(prev, prefill) {
  const next = { ...prev };
  Object.entries(prefill || {}).forEach(([key, value]) => {
    if (!asText(next[key]) && asText(value)) next[key] = value;
  });
  return next;
}

function buildSummaryFromQuery(query) {
  const size = asText(query.size);
  const rentalOption = asText(query.rentalOption);
  const zone = asText(query.zone);
  const basePrice = getBasePrice(size, rentalOption, query.basePrice);
  const deliveryFee = getDeliveryFee(zone, query.deliveryFee);
  const startIso = asText(query.startIso);
  const endIso = asText(query.endIso);
  return {
    holdId: asText(query.holdId),
    size,
    rentalOption,
    basePrice,
    deliveryFee,
    total: basePrice + deliveryFee,
    zone,
    areaLabel: asText(query.areaLabel),
    zip: asText(query.zip),
    startLabel: formatShortDateLabel(asText(query.startLabel, startIso)),
    endLabel: formatShortDateLabel(asText(query.endLabel, endIso)),
    startIso,
    endIso,
    deliveryDate: asText(query.deliveryDate),
  };
}

function buildSummaryFromHold(hold) {
  const metadata = hold?.metadata || {};
  const selectedWindow = metadata.selectedWindow || {};
  const size = sizeCodeToLabel(hold?.size_code);
  const rentalOption = asText(hold?.rental_option || metadata.rentalOption);
  const zone = asText(metadata.zone);
  const basePrice = getBasePrice(size, rentalOption, metadata.basePrice || metadata.priceBreakdown?.basePrice);
  const deliveryFee = getDeliveryFee(zone, metadata.deliveryFee || metadata.priceBreakdown?.deliveryFee);
  const startIso = asText(hold?.requested_start_at || selectedWindow.startIso);
  const endIso = asText(hold?.requested_end_at || selectedWindow.endIso);

  return {
    holdId: asText(hold?.id),
    size,
    rentalOption,
    basePrice,
    deliveryFee,
    total: basePrice + deliveryFee,
    zone,
    areaLabel: asText(metadata.areaLabel),
    zip: asText(metadata.zip),
    startLabel: formatShortDateLabel(asText(selectedWindow.start, startIso)),
    endLabel: formatShortDateLabel(asText(selectedWindow.end, endIso)),
    startIso,
    endIso,
    deliveryDate: asText(hold?.delivery_date || metadata.deliveryDate),
  };
}

export default function CompleteBookingPage() {
  const router = useRouter();
  const query = router.query || {};
  const queryPrefill = useMemo(() => buildFormPrefillFromQuery(query), [query]);
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
    setForm((prev) => mergeFormPrefill(prev, queryPrefill));
  }, [queryPrefill]);

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
          setForm((prev) =>
            mergeFormPrefill(
              { ...prev, zip: prev.zip || nextSummary.zip || "" },
              buildFormPrefillFromHold(json.hold),
            ),
          );
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

    if (!summary.basePrice || summary.total <= 0) {
      setError("This booking link is missing pricing details. Please ask the office to generate a new link.");
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
