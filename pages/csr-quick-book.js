import { useEffect, useMemo, useState } from "react";

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
  pinkBg: "#fff5fb",
  pinkBorder: "#ffd6eb",
  pinkText: "#c2587a",
  warningBg: "#fff8eb",
  warningBorder: "#f2cf7a",
  warningText: "#6b5b20",
  successBg: "#eff9f1",
  successBorder: "#bde3c4",
  successText: "#1d6a34",
  white: "#ffffff",
};

const F = "system-ui, -apple-system, sans-serif";

const zones = {
  A: { fee: 0, label: "Local Area" },
  B: { fee: 49, label: "Extended Area" },
  C: { fee: 89, label: "Outer Area" },
};

const zipToZone = {
  "30213": "A", "30214": "A", "30215": "A", "30263": "A", "30265": "A",
  "30268": "A", "30269": "A", "30276": "A", "30291": "A",
  "30106": "B", "30126": "B", "30134": "B", "30135": "B", "30168": "B",
  "30223": "B", "30224": "B", "30228": "B", "30236": "B", "30238": "B",
  "30260": "B", "30274": "B", "30296": "B", "30297": "B", "30310": "B",
  "30311": "B", "30314": "B", "30315": "B", "30331": "B", "30336": "B",
  "30337": "B", "30344": "B", "30349": "B", "30354": "B",
  "30002": "C", "30004": "C", "30005": "C", "30009": "C", "30017": "C",
  "30019": "C", "30021": "C", "30022": "C", "30028": "C", "30030": "C",
  "30032": "C", "30033": "C", "30034": "C", "30035": "C", "30038": "C",
  "30039": "C", "30040": "C", "30041": "C", "30043": "C", "30044": "C",
  "30045": "C", "30046": "C", "30047": "C", "30052": "C", "30058": "C",
  "30071": "C", "30072": "C", "30075": "C", "30076": "C", "30078": "C",
  "30092": "C", "30093": "C", "30094": "C", "30096": "C", "30097": "C",
  "30101": "C", "30102": "C", "30107": "C", "30114": "C", "30115": "C",
  "30116": "C", "30117": "C", "30120": "C", "30121": "C", "30127": "C",
  "30132": "C", "30137": "C", "30141": "C", "30142": "C", "30143": "C",
  "30144": "C", "30152": "C", "30157": "C", "30517": "C", "30518": "C",
  "30519": "C", "30303": "C", "30305": "C", "30308": "C", "30309": "C",
  "30312": "C", "30313": "C", "30316": "C", "30317": "C", "30318": "C",
  "30319": "C", "30324": "C", "30327": "C", "30328": "C", "30338": "C",
  "30339": "C", "30340": "C", "30341": "C", "30342": "C", "30346": "C",
  "30350": "C", "30360": "C", "30363": "C",
};

const zipToArea = {
  "30269": "Peachtree City area", "30265": "Newnan area", "30263": "Newnan area",
  "30214": "Fayetteville area", "30215": "Fayetteville area", "30213": "Fairburn area",
  "30268": "Palmetto area", "30276": "Senoia area", "30291": "Union City area",
  "30236": "Jonesboro area", "30238": "Jonesboro area", "30260": "Morrow area",
  "30274": "Riverdale area", "30296": "College Park area", "30297": "Hapeville / Forest Park area",
  "30349": "South Fulton / Atlanta area", "30344": "East Point area", "30337": "College Park area", "30331": "Atlanta area",
};

const basePricing = {
  "11 Yard": { "Early Bird": 225, "Weekend Warrior": 285, "Base Rental": 275, "Full Reset": 345 },
  "16 Yard": { "Early Bird": 275, "Weekend Warrior": 385, "Base Rental": 325, "Full Reset": 445 },
  "21 Yard": { "Early Bird": 385, "Weekend Warrior": 445, "Base Rental": 385, "Full Reset": 495 },
};

const rentalOptions = [
  { key: "Base Rental", label: "2-Day Rental", sub: "Next available delivery" },
  { key: "Early Bird", label: "2-Day Rental", sub: "Mon or Tue delivery" },
  { key: "Weekend Warrior", label: "4-Day Rental", sub: "Best overall value" },
  { key: "Full Reset", label: "7-Day Rental", sub: "Any weekday delivery" },
];

const allSizes = ["11 Yard", "16 Yard", "21 Yard"];

function getAreaLabel(zip) {
  if (!zip) return "Your area";
  return zipToArea[zip] || `ZIP ${zip} area`;
}

function formatMoney(value) {
  const n = Number(value || 0);
  return `$${n.toFixed(0)}`;
}

function encodeLinkState(params) {
  const next = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      next.set(key, String(value));
    }
  });
  return next.toString();
}

function getSoonestCandidate(available = {}) {
  const ranked = [];
  for (const opt of rentalOptions) {
    const windows = available[opt.key] || [];
    if (windows[0]) {
      ranked.push({ rentalOption: opt.key, window: windows[0] });
    }
  }
  ranked.sort((a, b) => new Date(a.window.startIso || a.window.start).getTime() - new Date(b.window.startIso || b.window.start).getTime());
  return ranked[0] || null;
}

export default function CsrQuickBookPage() {
  const [zip, setZip] = useState("");
  const [zoneKey, setZoneKey] = useState("");
  const [zipError, setZipError] = useState("");
  const [selectedSize, setSelectedSize] = useState("16 Yard");
  const [inventoryCounts, setInventoryCounts] = useState(null);
  const [countsLoading, setCountsLoading] = useState(true);
  const [availabilityBySize, setAvailabilityBySize] = useState({});
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedRentalOption, setSelectedRentalOption] = useState("");
  const [selectedWindow, setSelectedWindow] = useState(null);
  const [customerLink, setCustomerLink] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [generating, setGenerating] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualResult, setManualResult] = useState(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    street1: "",
    street2: "",
    city: "",
    state: "GA",
    zip: "",
    paymentMethod: "cash",
    manualPaymentReference: "",
    notes: "",
  });

  useEffect(() => {
    let active = true;
    async function loadCounts() {
      try {
        setCountsLoading(true);
        const response = await fetch("/api/inventory-counts");
        const json = await response.json();
        if (!active) return;
        if (response.ok && json.success) {
          setInventoryCounts(json.counts);
        }
      } catch (error) {
        if (active) setInventoryCounts(null);
      } finally {
        if (active) setCountsLoading(false);
      }
    }
    loadCounts();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setForm((prev) => ({ ...prev, zip }));
  }, [zip]);

  useEffect(() => {
    if (!zoneKey) {
      setAvailabilityBySize({});
      setSelectedRentalOption("");
      setSelectedWindow(null);
      return;
    }

    let active = true;
    async function loadAvailability() {
      try {
        setAvailabilityLoading(true);
        setAvailabilityError("");
        const entries = await Promise.all(
          allSizes.map(async (size) => {
            const response = await fetch("/api/availability-v2", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ size }),
            });
            const json = await response.json();
            return [size, json.available || {}];
          })
        );

        if (!active) return;
        const next = Object.fromEntries(entries);
        setAvailabilityBySize(next);
        const selectedSoonest = getSoonestCandidate(next[selectedSize]);
        if (selectedSoonest) {
          setSelectedRentalOption(selectedSoonest.rentalOption);
          setSelectedWindow(selectedSoonest.window);
        } else {
          setSelectedRentalOption("");
          setSelectedWindow(null);
        }
      } catch (error) {
        if (!active) return;
        setAvailabilityError("Unable to pull live availability right now.");
      } finally {
        if (active) setAvailabilityLoading(false);
      }
    }

    loadAvailability();
    return () => { active = false; };
  }, [zoneKey, selectedSize]);

  const areaLabel = useMemo(() => getAreaLabel(zip), [zip]);
  const zone = zones[zoneKey] || null;
  const selectedAvailability = availabilityBySize[selectedSize] || {};
  const selectedPriceMap = useMemo(() => {
    const prices = {};
    for (const opt of rentalOptions) {
      const base = basePricing[selectedSize]?.[opt.key] || 0;
      prices[opt.key] = base + (zone?.fee || 0);
    }
    return prices;
  }, [selectedSize, zone]);

  const summaryBySize = useMemo(() => {
    const next = {};
    for (const size of allSizes) next[size] = getSoonestCandidate(availabilityBySize[size]);
    return next;
  }, [availabilityBySize]);

  const overallSoonest = useMemo(() => {
    const options = allSizes
      .map((size) => ({ size, candidate: summaryBySize[size] }))
      .filter((entry) => entry.candidate);
    options.sort((a, b) => new Date(a.candidate.window.startIso).getTime() - new Date(b.candidate.window.startIso).getTime());
    return options[0] || null;
  }, [summaryBySize]);

  const selectedSoonest = summaryBySize[selectedSize];
  const customerTotal = (basePricing[selectedSize]?.[selectedRentalOption] || 0) + (zone?.fee || 0);

  function resetMessages() {
    setActionError("");
    setActionSuccess("");
    setManualResult(null);
  }

  function handleZipLookup() {
    const clean = String(zip || "").replace(/\D/g, "").slice(0, 5);
    setCustomerLink("");
    resetMessages();
    setZip(clean);

    if (clean.length !== 5) {
      setZipError("Please enter a valid 5-digit ZIP code.");
      setZoneKey("");
      return;
    }

    const foundZone = zipToZone[clean];
    if (!foundZone) {
      setZipError("That ZIP is outside the current delivery map.");
      setZoneKey("");
      return;
    }

    setZipError("");
    setZoneKey(foundZone);
  }

  function handleSelectSize(size) {
    setSelectedSize(size);
    setCustomerLink("");
    resetMessages();
    const candidate = getSoonestCandidate(availabilityBySize[size]);
    if (candidate) {
      setSelectedRentalOption(candidate.rentalOption);
      setSelectedWindow(candidate.window);
    }
  }

  function handleSelectWindow(optionKey, window) {
    setSelectedRentalOption(optionKey);
    setSelectedWindow(window);
    setCustomerLink("");
    resetMessages();
  }

  function updateForm(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function validateManualDetails() {
    if (!zoneKey) return "Enter a service ZIP first.";
    if (!selectedRentalOption || !selectedWindow) return "Choose a live delivery window first.";
    if (!form.name.trim() || !form.phone.trim() || !form.street1.trim() || !form.city.trim() || !form.zip.trim()) {
      return "For manual paid bookings, name, phone, street, city, and ZIP are required.";
    }
    return "";
  }

  async function createHold() {
    const response = await fetch("/api/create-booking-hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedSize,
        rentalOption: selectedRentalOption,
        selectedWindow: {
          startIso: selectedWindow.startIso,
          endIso: selectedWindow.endIso,
          start: selectedWindow.start,
          end: selectedWindow.end,
        },
        zone: zoneKey,
        areaLabel,
        zip,
        holdMinutes: 60,
        funnelSource: "csr_quick_book",
      }),
    });

    const json = await response.json();
    if (!response.ok || !json.success || !json.hold?.id) {
      throw new Error(json.error || "Unable to create the booking hold.");
    }
    return json.hold.id;
  }

  async function handleGenerateLink() {
    if (!zoneKey) {
      setActionError("Enter a service ZIP first.");
      return;
    }
    if (!selectedRentalOption || !selectedWindow) {
      setActionError("Choose a live delivery window before generating the customer link.");
      return;
    }

    setGenerating(true);
    resetMessages();
    setCustomerLink("");

    try {
      const holdId = await createHold();
      const qs = encodeLinkState({
        holdId,
        size: selectedSize,
        rentalOption: selectedRentalOption,
        basePrice: basePricing[selectedSize]?.[selectedRentalOption] || 0,
        deliveryFee: zone?.fee || 0,
        zone: zoneKey,
        areaLabel,
        zip,
        deliveryDate: selectedWindow.start,
        startLabel: selectedWindow.startLabel,
        endLabel: selectedWindow.endLabel,
        startIso: selectedWindow.startIso,
        endIso: selectedWindow.endIso,
      });
      setCustomerLink(`${window.location.origin}/complete-booking?${qs}`);
      setActionSuccess("Customer completion link generated.");
    } catch (error) {
      setActionError(error.message || "Unable to generate the customer link.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleManualPaidBooking() {
    const validationError = validateManualDetails();
    if (validationError) {
      setActionError(validationError);
      return;
    }

    setManualSubmitting(true);
    resetMessages();
    setCustomerLink("");

    try {
      const holdId = await createHold();
      const response = await fetch("/api/complete-manual-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdId,
          paymentMethod: form.paymentMethod,
          manualPaymentReference: form.manualPaymentReference,
          areaLabel,
          zone: zoneKey,
          zip: form.zip.trim(),
          notes: form.notes,
          contact: {
            name: form.name,
            email: form.email,
            phone: form.phone,
          },
          deliveryAddress: {
            street1: form.street1,
            street2: form.street2,
            city: form.city,
            state: form.state,
            zip: form.zip,
          },
        }),
      });

      const json = await response.json();
      if (!response.ok || !json.success || !json.booking?.id) {
        throw new Error(json.error || "Unable to create the manual paid booking.");
      }

      setManualResult(json.booking);
      setActionSuccess(`Manual ${form.paymentMethod} booking created and marked reserved.`);
    } catch (error) {
      setActionError(error.message || "Unable to create the manual paid booking.");
    } finally {
      setManualSubmitting(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, padding: "28px 16px 40px", fontFamily: F }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.pinkText, textTransform: "uppercase", letterSpacing: "1.2px" }}>Little Junkers office</div>
          <h1 style={{ margin: "8px 0 10px", fontSize: 36, lineHeight: 1.04, color: C.ink }}>CSR Quick Book</h1>
          <p style={{ margin: 0, maxWidth: 820, color: C.inkMid, fontSize: 15, lineHeight: 1.65 }}>
            Build a hold-backed booking inside the existing reservation engine. Use Stripe-link mode for normal online checkout, or finalize cash and Zelle payments directly from the office while still creating the same backend reservation record.
          </p>
        </div>

        <SectionCard title="Available now" subtitle="Fast phone-answering snapshot by ready units in the yard.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
            {allSizes.map((size) => {
              const sizeCode = size.replace(" Yard", "YD");
              const bucket = inventoryCounts?.bySize?.[sizeCode];
              return (
                <div key={size} style={statCardStyle}>
                  <div style={{ fontSize: 12, color: C.inkMuted, marginBottom: 6 }}>{size}</div>
                  <div style={{ fontSize: 30, fontWeight: 900, color: C.ink }}>{countsLoading ? "…" : bucket?.ready ?? "—"}</div>
                  <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>ready now</div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <div style={{ display: "grid", gridTemplateColumns: "1.12fr 0.88fr", gap: 18, marginTop: 18 }}>
          <div style={{ display: "grid", gap: 18 }}>
            <SectionCard title="Service ZIP" subtitle="Validate the delivery zone before building pricing or availability.">
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="30269" style={inputStyle({ maxWidth: 180 })} />
                <button onClick={handleZipLookup} style={primaryButtonStyle(false)}>Check ZIP</button>
              </div>
              {zipError ? <Banner tone="warning">{zipError}</Banner> : null}
              {zone ? <Banner tone="success">{zone.label} · delivery fee {zone.fee > 0 ? formatMoney(zone.fee) : "included"} · {areaLabel}</Banner> : null}
            </SectionCard>

            <SectionCard title="Sizes and pricing" subtitle="Switch freely between sizes. Pricing updates with the selected zone.">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
                {allSizes.map((size) => {
                  const soonest = summaryBySize[size];
                  const active = size === selectedSize;
                  const startingPrice = (basePricing[size]?.["Base Rental"] || 0) + (zone?.fee || 0);
                  return (
                    <button key={size} onClick={() => handleSelectSize(size)} style={{ ...sizeCardStyle, border: active ? `1.5px solid ${C.ink}` : `1px solid ${C.surfaceBorder}`, background: active ? C.white : C.surfaceBg }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: C.ink }}>{size}</div>
                          <div style={{ marginTop: 4, color: C.inkMuted, fontSize: 13 }}>2-day price {formatMoney(startingPrice)}</div>
                        </div>
                        <div style={pillStyle(active ? "dark" : "light")}>{active ? "Selected" : "Switch"}</div>
                      </div>
                      <div style={{ marginTop: 14, fontSize: 12, color: C.inkMuted, lineHeight: 1.55 }}>
                        {soonest ? `Soonest: ${soonest.window.startLabel} · ${soonest.rentalOption}` : "No live windows found in current lookahead."}
                      </div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Live availability" subtitle="Pick the exact window you want to send or finalize.">
              {availabilityLoading ? <div style={{ color: C.inkMuted, fontSize: 14 }}>Pulling live availability across all sizes...</div> : null}
              {availabilityError ? <Banner tone="warning">{availabilityError}</Banner> : null}

              {!availabilityLoading && !availabilityError && zone ? (
                <div style={{ display: "grid", gap: 12 }}>
                  {selectedSoonest && overallSoonest && overallSoonest.size !== selectedSize ? (
                    <Banner tone="warning">
                      Selected {selectedSize} is not the fastest option. {overallSoonest.size} opens sooner on {overallSoonest.candidate.window.startLabel} via {overallSoonest.candidate.rentalOption}.
                    </Banner>
                  ) : null}

                  {rentalOptions.map((option) => {
                    const windows = selectedAvailability[option.key] || [];
                    return (
                      <div key={option.key} style={{ border: `1px solid ${C.surfaceBorder}`, borderRadius: 14, overflow: "hidden", background: C.surfaceBg }}>
                        <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.surfaceBorder}`, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: C.ink }}>{option.label}</div>
                            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 3 }}>{option.sub}</div>
                          </div>
                          <div style={{ fontSize: 22, fontWeight: 900, color: C.ink }}>{formatMoney(selectedPriceMap[option.key])}</div>
                        </div>
                        <div style={{ padding: 12, display: "grid", gap: 10 }}>
                          {windows.length ? windows.map((windowOption) => {
                            const isSelected = selectedRentalOption === option.key && selectedWindow?.startIso === windowOption.startIso;
                            return (
                              <button key={`${option.key}-${windowOption.startIso}`} onClick={() => handleSelectWindow(option.key, windowOption)} style={{ ...windowButtonStyle, border: isSelected ? `1.5px solid ${C.pinkText}` : `1px solid ${C.surfaceBorder}`, background: isSelected ? C.pinkBg : C.white }}>
                                <div>
                                  <div style={{ fontSize: 12, color: isSelected ? C.pinkText : C.inkMuted, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.6px" }}>{option.key}</div>
                                  <div style={{ marginTop: 5, fontSize: 15, fontWeight: 800, color: C.ink }}>{windowOption.startLabel}</div>
                                  <div style={{ marginTop: 3, fontSize: 12, color: C.inkMuted }}>Through {windowOption.endLabel}</div>
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 900, color: isSelected ? C.pinkText : C.ink }}>{formatMoney(selectedPriceMap[option.key])}</div>
                              </button>
                            );
                          }) : <div style={{ fontSize: 13, color: C.inkMuted }}>No current windows surfaced for this option.</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </SectionCard>
          </div>

          <div style={{ display: "grid", gap: 18 }}>
            <SectionCard title="Customer details" subtitle="Used for both completion-link bookings and office-collected cash/Zelle bookings.">
              <div style={{ display: "grid", gap: 12 }}>
                <Field label="Customer name *"><input value={form.name} onChange={(e) => updateForm("name", e.target.value)} style={inputStyle()} /></Field>
                <Field label="Email"><input value={form.email} onChange={(e) => updateForm("email", e.target.value)} style={inputStyle()} /></Field>
                <Field label="Phone *"><input value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} style={inputStyle()} /></Field>
                <Field label="Street address *"><input value={form.street1} onChange={(e) => updateForm("street1", e.target.value)} style={inputStyle()} /></Field>
                <Field label="Address line 2"><input value={form.street2} onChange={(e) => updateForm("street2", e.target.value)} style={inputStyle()} /></Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 120px", gap: 12 }}>
                  <Field label="City *"><input value={form.city} onChange={(e) => updateForm("city", e.target.value)} style={inputStyle()} /></Field>
                  <Field label="State"><input value={form.state} onChange={(e) => updateForm("state", e.target.value)} style={inputStyle()} /></Field>
                  <Field label="ZIP *"><input value={form.zip} onChange={(e) => updateForm("zip", e.target.value)} style={inputStyle()} /></Field>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Book and collect payment" subtitle="Use the Stripe link for standard checkout, or finalize a paid cash/Zelle booking from the office.">
              <div style={summaryCardStyle}>
                <SummaryRow label="ZIP / Area" value={zone ? `${zip} · ${areaLabel}` : "Not set"} />
                <SummaryRow label="Size" value={selectedSize} />
                <SummaryRow label="Rental option" value={selectedRentalOption || "Not selected"} />
                <SummaryRow label="Window" value={selectedWindow ? `${selectedWindow.startLabel} → ${selectedWindow.endLabel}` : "Not selected"} />
                <SummaryRow label="Base rental" value={formatMoney(basePricing[selectedSize]?.[selectedRentalOption] || 0)} />
                <SummaryRow label="Delivery fee" value={zone ? (zone.fee > 0 ? formatMoney(zone.fee) : "Included") : "-"} />
                <div style={{ height: 1, background: C.surfaceBorder, margin: "10px 0" }} />
                <SummaryRow label="Customer total" value={formatMoney(customerTotal)} strong />
              </div>

              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Manual payment type">
                    <select value={form.paymentMethod} onChange={(e) => updateForm("paymentMethod", e.target.value)} style={inputStyle()}>
                      <option value="cash">Cash</option>
                      <option value="zelle">Zelle</option>
                    </select>
                  </Field>
                  <Field label="Reference / confirmation">
                    <input value={form.manualPaymentReference} onChange={(e) => updateForm("manualPaymentReference", e.target.value)} placeholder="Optional" style={inputStyle()} />
                  </Field>
                </div>
                <Field label="Office notes">
                  <textarea value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} style={inputStyle({ minHeight: 92, resize: "vertical" })} />
                </Field>
              </div>

              <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                <button onClick={handleGenerateLink} disabled={generating || !zoneKey || !selectedWindow || !selectedRentalOption} style={primaryButtonStyle(generating || !zoneKey || !selectedWindow || !selectedRentalOption)}>
                  {generating ? "Generating link..." : "Create customer completion link"}
                </button>

                <button onClick={handleManualPaidBooking} disabled={manualSubmitting || !zoneKey || !selectedWindow || !selectedRentalOption} style={manualButtonStyle(manualSubmitting || !zoneKey || !selectedWindow || !selectedRentalOption)}>
                  {manualSubmitting ? `Finalizing ${form.paymentMethod} booking...` : `Mark ${form.paymentMethod === "zelle" ? "Zelle" : "Cash"} paid and create booking`}
                </button>
              </div>

              {actionError ? <Banner tone="warning">{actionError}</Banner> : null}
              {actionSuccess ? <Banner tone="success">{actionSuccess}</Banner> : null}

              {customerLink ? (
                <div style={{ marginTop: 14 }}>
                  <Banner tone="success">Link generated. The customer will complete contact info, address, and Stripe checkout from this URL.</Banner>
                  <textarea readOnly value={customerLink} style={inputStyle({ minHeight: 120, marginTop: 10, resize: "vertical" })} />
                  <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    <button onClick={() => navigator.clipboard.writeText(customerLink)} style={secondaryButtonStyle}>Copy link</button>
                    <a href={customerLink} target="_blank" rel="noreferrer" style={{ ...secondaryButtonStyle, textDecoration: "none", textAlign: "center" }}>Open link</a>
                  </div>
                </div>
              ) : null}

              {manualResult ? (
                <div style={{ marginTop: 14 }}>
                  <Banner tone="success">Manual booking created. Hold was converted and reservation was created without Stripe.</Banner>
                  <div style={summaryCardStyle}>
                    <SummaryRow label="Booking ID" value={manualResult.id || "—"} />
                    <SummaryRow label="Status" value={manualResult.status || "reserved"} />
                    <SummaryRow label="Payment path" value={form.paymentMethod === "zelle" ? "Zelle" : "Cash"} />
                  </div>
                </div>
              ) : null}
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 20, padding: 20 }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: C.ink, lineHeight: 1.1 }}>{title}</div>
        {subtitle ? <div style={{ marginTop: 6, fontSize: 14, color: C.inkMid, lineHeight: 1.55 }}>{subtitle}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: C.ink }}>{label}</div>
      {children}
    </label>
  );
}

function Banner({ tone, children }) {
  const tones = {
    warning: { bg: C.warningBg, border: C.warningBorder, text: C.warningText },
    success: { bg: C.successBg, border: C.successBorder, text: C.successText },
  };
  const current = tones[tone] || tones.warning;
  return (
    <div style={{ marginTop: 12, background: current.bg, border: `1px solid ${current.border}`, borderRadius: 12, padding: "12px 14px", color: current.text, fontSize: 13, lineHeight: 1.55 }}>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, strong = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", padding: "7px 0" }}>
      <div style={{ color: C.inkMuted, fontSize: 13 }}>{label}</div>
      <div style={{ color: C.ink, fontSize: 14, fontWeight: strong ? 800 : 600, textAlign: "right" }}>{value}</div>
    </div>
  );
}

const summaryCardStyle = {
  background: C.surfaceBg,
  border: `1px solid ${C.surfaceBorder}`,
  borderRadius: 14,
  padding: "14px 16px",
};

const statCardStyle = {
  background: C.surfaceBg,
  border: `1px solid ${C.surfaceBorder}`,
  borderRadius: 16,
  padding: 16,
};

const sizeCardStyle = {
  width: "100%",
  textAlign: "left",
  borderRadius: 16,
  padding: 16,
  cursor: "pointer",
};

const windowButtonStyle = {
  width: "100%",
  textAlign: "left",
  borderRadius: 12,
  padding: "13px 14px",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  cursor: "pointer",
};

function inputStyle(extra = {}) {
  return {
    display: "block",
    width: "100%",
    padding: "13px 14px",
    borderRadius: 10,
    border: `1px solid ${C.surfaceBorder}`,
    background: C.white,
    fontFamily: F,
    fontSize: 14,
    boxSizing: "border-box",
    ...extra,
  };
}

function primaryButtonStyle(disabled) {
  return {
    padding: "14px 16px",
    borderRadius: 12,
    border: "none",
    background: disabled ? C.inkFaint : C.ink,
    color: C.white,
    fontFamily: F,
    fontWeight: 800,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

function manualButtonStyle(disabled) {
  return {
    padding: "14px 16px",
    borderRadius: 12,
    border: `1px solid ${C.pinkBorder}`,
    background: disabled ? C.surfaceBorder : C.pinkBg,
    color: disabled ? C.inkMuted : C.pinkText,
    fontFamily: F,
    fontWeight: 800,
    fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
  };
}

const secondaryButtonStyle = {
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${C.surfaceBorder}`,
  background: C.white,
  color: C.ink,
  fontFamily: F,
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
};

function pillStyle(mode) {
  return {
    background: mode === "dark" ? C.ink : C.pinkBg,
    color: mode === "dark" ? C.white : C.pinkText,
    border: mode === "dark" ? "none" : `1px solid ${C.pinkBorder}`,
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  };
}
