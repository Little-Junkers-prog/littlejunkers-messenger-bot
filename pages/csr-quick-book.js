import { useEffect, useMemo, useState } from "react";

const C = {
  pageBg: "#edeae4",
  cardBg: "#ffffff",
  cardBorder: "#e5e0d8",
  surfaceBg: "#faf8f5",
  surfaceBorder: "#e8e3db",
  ink: "#1a1a1a",
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
  errorBg: "#fff1f1",
  errorBorder: "#fca5a5",
  errorText: "#b91c1c",
  white: "#ffffff",
  darkBtn: "#121212",
};

const F = "system-ui, -apple-system, sans-serif";
const zones = {
  A: { fee: 0, label: "Local Area" },
  B: { fee: 49, label: "Extended Area" },
  C: { fee: 89, label: "Outer Area" },
};
const zipToZone = {"30213":"A","30214":"A","30215":"A","30263":"A","30265":"A","30268":"A","30269":"A","30276":"A","30291":"A","30106":"B","30126":"B","30134":"B","30135":"B","30168":"B","30223":"B","30224":"B","30228":"B","30236":"B","30238":"B","30248":"B","30252":"B","30253":"B","30260":"B","30273":"B","30274":"B","30281":"B","30296":"B","30297":"B","30310":"B","30311":"B","30314":"B","30315":"B","30331":"B","30336":"B","30337":"B","30344":"B","30349":"B","30354":"B","30002":"C","30004":"C","30005":"C","30009":"C","30017":"C","30019":"C","30021":"C","30022":"C","30028":"C","30030":"C","30032":"C","30033":"C","30034":"C","30035":"C","30038":"C","30039":"C","30040":"C","30041":"C","30043":"C","30044":"C","30045":"C","30046":"C","30047":"C","30052":"C","30058":"C","30071":"C","30072":"C","30075":"C","30076":"C","30078":"C","30092":"C","30093":"C","30094":"C","30096":"C","30097":"C","30101":"C","30102":"C","30107":"C","30114":"C","30115":"C","30116":"C","30117":"C","30120":"C","30121":"C","30127":"C","30132":"C","30137":"C","30141":"C","30142":"C","30143":"C","30144":"C","30152":"C","30157":"C","30517":"C","30518":"C","30519":"C","30303":"C","30305":"C","30308":"C","30309":"C","30312":"C","30313":"C","30316":"C","30317":"C","30318":"C","30319":"C","30324":"C","30327":"C","30328":"C","30338":"C","30339":"C","30340":"C","30341":"C","30342":"C","30346":"C","30350":"C","30360":"C","30363":"C"};
const zipToArea = {"30269":"Peachtree City area","30265":"Newnan area","30263":"Newnan area","30214":"Fayetteville area","30215":"Fayetteville area","30213":"Fairburn area","30268":"Palmetto area","30276":"Senoia area","30291":"Union City area","30236":"Jonesboro area","30238":"Jonesboro area","30260":"Morrow area","30274":"Riverdale area","30296":"College Park area","30297":"Hapeville / Forest Park area","30349":"South Fulton / Atlanta area","30344":"East Point area","30337":"College Park area","30331":"Atlanta area","30253":"McDonough area","30252":"McDonough area","30281":"Stockbridge area","30248":"Locust Grove area","30273":"Rex area","30228":"Hampton area"};
const basePricing = {
  "11 Yard": { "Early Bird": 225, "Weekend Warrior": 335, "Base Rental": 275, "Full Reset": 345 },
  "16 Yard": { "Early Bird": 275, "Weekend Warrior": 385, "Base Rental": 325, "Full Reset": 445 },
  "21 Yard": { "Early Bird": 385, "Weekend Warrior": 445, "Base Rental": 385, "Full Reset": 495 },
};
const rentalOptions = [
  { key: "Base Rental", label: "2-Day Basic" },
  { key: "Early Bird", label: "2-Day Budget" },
  { key: "Weekend Warrior", label: "4-Day" },
  { key: "Full Reset", label: "7-Day" },
];
const allSizes = ["11 Yard", "16 Yard", "21 Yard"];
const SIZE_YARDS_MAP = { "11 Yard": 11, "16 Yard": 16, "21 Yard": 21 };
const SIZE_CODE_MAP = { "11 Yard": "11YD", "16 Yard": "16YD", "21 Yard": "21YD" };

const getAreaLabel = (zip) => (!zip ? "Your area" : zipToArea[zip] || `ZIP ${zip} area`);
const formatMoney = (value) => `$${Number(value || 0).toFixed(0)}`;
const getRentalDisplayLabel = (key) => ({ "Base Rental": "2-Day Basic", "Early Bird": "2-Day Budget", "Weekend Warrior": "4-Day", "Full Reset": "7-Day" }[key] || key || "");
const todayDateStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

function encodeLinkState(params) {
  const next = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") next.set(key, String(value));
  });
  return next.toString();
}

// ─── Ops Panel Components ─────────────────────────────────────────────────────

function UnitStatusPanel({ units, onRefresh }) {
  const [updating, setUpdating] = useState(null);
  const [result, setResult] = useState(null);

  const statusOptions = ["available", "deployed", "maintenance"];
  const statusColors = {
    available: { bg: C.successBg, border: C.successBorder, text: C.successText },
    deployed:  { bg: C.warningBg, border: C.warningBorder, text: C.warningText },
    maintenance: { bg: C.errorBg, border: C.errorBorder, text: C.errorText },
  };

  async function handleStatusChange(unit, newStatus) {
    if (unit.status === newStatus) return;
    setUpdating(unit.id);
    setResult(null);
    try {
      const res = await fetch("/api/admin-unit-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: unit.id, status: newStatus }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Update failed");
      setResult({ type: "success", message: `${unit.name} → ${newStatus}` });
      onRefresh();
    } catch (err) {
      setResult({ type: "error", message: err.message });
    } finally {
      setUpdating(null);
    }
  }

  const grouped = { 11: [], 16: [], 21: [] };
  for (const u of units) {
    if (grouped[u.size_yards]) grouped[u.size_yards].push(u);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {result && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: result.type === "success" ? C.successBg : C.errorBg,
          border: `1px solid ${result.type === "success" ? C.successBorder : C.errorBorder}`,
          color: result.type === "success" ? C.successText : C.errorText }}>
          {result.message}
        </div>
      )}
      {[11, 16, 21].map(size => (
        <div key={size}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>{size} Yard</div>
          <div style={{ display: "grid", gap: 8 }}>
            {grouped[size].map(unit => {
              const colors = statusColors[unit.status] || statusColors.available;
              return (
                <div key={unit.id} style={{ background: C.surfaceBg, border: `1px solid ${C.surfaceBorder}`, borderRadius: 12, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{unit.name}</div>
                    <div style={{ marginTop: 4, display: "inline-block", padding: "2px 10px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}>
                      {unit.status}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {statusOptions.filter(s => s !== unit.status).map(s => (
                      <button key={s} disabled={!!updating} onClick={() => handleStatusChange(unit, s)}
                        style={{ padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: updating ? "not-allowed" : "pointer", fontFamily: F,
                          border: `1px solid ${C.surfaceBorder}`, background: updating === unit.id ? C.surfaceBg : C.white, color: C.inkMuted,
                          opacity: updating && updating !== unit.id ? 0.5 : 1 }}>
                        {updating === unit.id ? "..." : `→ ${s}`}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function NewRentalPanel() {
  const emptyForm = { name: "", phone: "", email: "", street: "", city: "", state: "GA", zip: "", size: "16 Yard", dropoffDate: "", returnDate: "", rentalDays: "", zone: "local", paymentStatus: "unpaid", paymentMethod: "cash", amount: "", notes: "" };
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));

  // Auto-derive zone from zip when zip changes
  useEffect(() => {
    if (form.zip.length === 5) {
      const z = zipToZone[form.zip];
      if (z === "A") update("zone", "local");
      else if (z === "B") update("zone", "zone2");
      else if (z === "C") update("zone", "zone3");
    }
  }, [form.zip]);

  // Auto-derive rental days when dates change
  useEffect(() => {
    if (form.dropoffDate && form.returnDate) {
      const diff = Math.round((new Date(form.returnDate) - new Date(form.dropoffDate)) / (1000 * 60 * 60 * 24));
      if (diff > 0) update("rentalDays", String(diff));
    }
  }, [form.dropoffDate, form.returnDate]);

  async function handleSubmit() {
    if (!form.name || !form.phone || !form.street || !form.dropoffDate || !form.returnDate) {
      setResult({ type: "error", message: "Name, phone, street address, dropoff date, and return date are required." });
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin-manual-rental", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to create rental");
      setResult({ type: "success", message: `Rental created — ID: ${json.rentalId}` });
      setForm(emptyForm);
    } catch (err) {
      setResult({ type: "error", message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {result && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: result.type === "success" ? C.successBg : C.errorBg,
          border: `1px solid ${result.type === "success" ? C.successBorder : C.errorBorder}`,
          color: result.type === "success" ? C.successText : C.errorText }}>
          {result.message}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 800, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "1px" }}>Customer</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Name *"><input value={form.name} onChange={e => update("name", e.target.value)} style={inputStyle()} /></Field>
        <Field label="Phone *"><input value={form.phone} onChange={e => update("phone", e.target.value)} placeholder="4705551234" style={inputStyle()} /></Field>
      </div>
      <Field label="Email"><input value={form.email} onChange={e => update("email", e.target.value)} style={inputStyle()} /></Field>
      <Field label="Street address *"><input value={form.street} onChange={e => update("street", e.target.value)} style={inputStyle()} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px", gap: 10 }}>
        <Field label="City"><input value={form.city} onChange={e => update("city", e.target.value)} style={inputStyle()} /></Field>
        <Field label="State"><input value={form.state} onChange={e => update("state", e.target.value)} style={inputStyle()} /></Field>
        <Field label="ZIP"><input value={form.zip} onChange={e => update("zip", e.target.value)} maxLength={5} style={inputStyle()} /></Field>
      </div>

      <div style={{ height: 1, background: C.surfaceBorder }} />
      <div style={{ fontSize: 11, fontWeight: 800, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "1px" }}>Rental details</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Size">
          <select value={form.size} onChange={e => update("size", e.target.value)} style={inputStyle()}>
            {allSizes.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Zone">
          <select value={form.zone} onChange={e => update("zone", e.target.value)} style={inputStyle()}>
            <option value="local">Local (Zone A)</option>
            <option value="zone2">Zone B (+$49)</option>
            <option value="zone3">Zone C (+$89)</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 10 }}>
        <Field label="Dropoff date *"><input type="date" value={form.dropoffDate} min={todayDateStr()} onChange={e => update("dropoffDate", e.target.value)} style={inputStyle()} /></Field>
        <Field label="Return date *"><input type="date" value={form.returnDate} min={form.dropoffDate || todayDateStr()} onChange={e => update("returnDate", e.target.value)} style={inputStyle()} /></Field>
        <Field label="Days"><input value={form.rentalDays} readOnly style={inputStyle({ background: C.surfaceBg, color: C.inkMuted })} /></Field>
      </div>

      <div style={{ height: 1, background: C.surfaceBorder }} />
      <div style={{ fontSize: 11, fontWeight: 800, color: C.inkMuted, textTransform: "uppercase", letterSpacing: "1px" }}>Payment</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field label="Status">
          <select value={form.paymentStatus} onChange={e => update("paymentStatus", e.target.value)} style={inputStyle()}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </Field>
        <Field label="Method">
          <select value={form.paymentMethod} onChange={e => update("paymentMethod", e.target.value)} style={inputStyle()}>
            <option value="cash">Cash</option>
            <option value="zelle">Zelle</option>
            <option value="broker">Broker</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Amount ($)"><input type="number" value={form.amount} onChange={e => update("amount", e.target.value)} placeholder="0" style={inputStyle()} /></Field>
      </div>

      <Field label="Office notes"><textarea value={form.notes} onChange={e => update("notes", e.target.value)} style={inputStyle({ minHeight: 72, resize: "vertical" })} /></Field>

      <button onClick={handleSubmit} disabled={submitting} style={primaryButtonStyle(submitting)}>
        {submitting ? "Creating rental..." : "Create rental record"}
      </button>
    </div>
  );
}

function FindCustomerPanel() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState(null);
  const [selected, setSelected] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setCustomers(null);
    setSelected(null);
    setResult(null);
    try {
      const res = await fetch(`/api/admin-customer-search?q=${encodeURIComponent(query.trim())}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Search failed");
      setCustomers(json.customers || []);
    } catch (err) {
      setResult({ type: "error", message: err.message });
    } finally {
      setSearching(false);
    }
  }

  function handleSelect(customer) {
    setSelected(customer);
    setEditForm({ name: customer.name || "", phone: customer.phone || "", email: customer.email || "", notes: customer.notes || "" });
    setResult(null);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin-customer-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: selected.id, ...editForm }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Save failed");
      setResult({ type: "success", message: "Customer updated." });
      setSelected(null);
      setCustomers(null);
      setQuery("");
    } catch (err) {
      setResult({ type: "error", message: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {result && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: result.type === "success" ? C.successBg : C.errorBg,
          border: `1px solid ${result.type === "success" ? C.successBorder : C.errorBorder}`,
          color: result.type === "success" ? C.successText : C.errorText }}>
          {result.message}
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder="Search by phone or name..." style={{ ...inputStyle(), flex: 1 }} />
        <button onClick={handleSearch} disabled={searching || !query.trim()} style={{ ...primaryButtonStyle(searching || !query.trim()), width: "auto", padding: "12px 20px", whiteSpace: "nowrap" }}>
          {searching ? "..." : "Search"}
        </button>
      </div>

      {customers !== null && customers.length === 0 && (
        <div style={{ color: C.inkMuted, fontSize: 13 }}>No customers found for "{query}".</div>
      )}

      {customers && customers.length > 0 && !selected && (
        <div style={{ display: "grid", gap: 8 }}>
          {customers.map(c => (
            <button key={c.id} onClick={() => handleSelect(c)}
              style={{ textAlign: "left", padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.surfaceBorder}`, background: C.surfaceBg, cursor: "pointer", fontFamily: F }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: C.ink }}>{c.name}</div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{c.phone}{c.email ? ` · ${c.email}` : ""}</div>
              {c.rentals_count > 0 && <div style={{ fontSize: 11, color: C.pinkText, marginTop: 2 }}>{c.rentals_count} rental{c.rentals_count !== 1 ? "s" : ""} on file</div>}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.inkMuted }}>Editing: {selected.name}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Name"><input value={editForm.name} onChange={e => setEditForm(p => ({...p, name: e.target.value}))} style={inputStyle()} /></Field>
            <Field label="Phone"><input value={editForm.phone} onChange={e => setEditForm(p => ({...p, phone: e.target.value}))} style={inputStyle()} /></Field>
          </div>
          <Field label="Email"><input value={editForm.email} onChange={e => setEditForm(p => ({...p, email: e.target.value}))} style={inputStyle()} /></Field>
          <Field label="Notes"><textarea value={editForm.notes} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))} style={inputStyle({ minHeight: 72, resize: "vertical" })} /></Field>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={handleSave} disabled={saving} style={primaryButtonStyle(saving)}>{saving ? "Saving..." : "Save changes"}</button>
            <button onClick={() => { setSelected(null); setResult(null); }} style={{ ...secondaryButtonStyle, flex: "0 0 auto" }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rental Board Panel ───────────────────────────────────────────────────────

const STATUS_META = {
  pending:       { label: "Pending",     bg: "#fff8eb", border: "#f2cf7a", text: "#6b5b20" },
  awaiting_date: { label: "Needs Date",  bg: "#fff8eb", border: "#f2cf7a", text: "#6b5b20" },
  confirmed:     { label: "Ready",       bg: "#eff9f1", border: "#bde3c4", text: "#1d6a34" },
  active:        { label: "Out",         bg: "#fff0fa", border: "#ffd6eb", text: "#c2587a" },
  returned:      { label: "Returned",    bg: "#f3f3f3", border: "#d0d0d0", text: "#666666" },
  cancelled:     { label: "Cancelled",   bg: "#fff1f1", border: "#fca5a5", text: "#b91c1c" },
};

function fmt(dateStr) {
  if (!dateStr) return "—";
  const [y, m, d] = dateStr.split("-");
  return `${m}/${d}`;
}

function RentalCard({ rental, onAction, acting }) {
  const customer = rental.customers || {};
  const statusMeta = STATUS_META[rental.status] || STATUS_META.pending;
  const isPaid = rental.amount_paid > 0;
  const phone = customer.phone || "";

  return (
    <div style={{
      background: C.white, border: `1px solid ${C.cardBorder}`,
      borderRadius: 16, padding: "14px 16px", display: "grid", gap: 10,
    }}>
      {/* Top row: name + status badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, color: C.ink }}>{customer.name || "Unknown customer"}</div>
          {phone ? (
            <a href={`tel:${phone}`} style={{ fontSize: 13, color: C.pinkText, fontWeight: 700, textDecoration: "none", display: "block", marginTop: 2 }}>
              {phone}
            </a>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 99,
            background: statusMeta.bg, border: `1px solid ${statusMeta.border}`, color: statusMeta.text }}>
            {statusMeta.label}
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: isPaid ? C.successText : C.warningText,
            background: isPaid ? C.successBg : C.warningBg, border: `1px solid ${isPaid ? C.successBorder : C.warningBorder}`,
            padding: "2px 8px", borderRadius: 99 }}>
            {isPaid ? `Paid $${rental.amount_paid}` : "Unpaid"}
          </span>
        </div>
      </div>

      {/* Details row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <div style={{ fontSize: 12, color: C.inkMuted }}>
          <span style={{ fontWeight: 700, color: C.ink }}>{rental.size_yards} Yard</span>
        </div>
        <div style={{ fontSize: 12, color: C.inkMuted, textAlign: "right" }}>
          {fmt(rental.dropoff_date)} → {fmt(rental.scheduled_return)}
        </div>
        <div style={{ fontSize: 12, color: C.inkMuted, gridColumn: "1 / -1", lineHeight: 1.4 }}>
          {rental.delivery_address || "No address"}
        </div>
        {rental.notes ? (
          <div style={{ fontSize: 12, color: C.inkMuted, gridColumn: "1 / -1", fontStyle: "italic" }}>
            {rental.notes}
          </div>
        ) : null}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(rental.status === "pending" || rental.status === "awaiting_date") && (
          <button disabled={acting} onClick={() => onAction(rental.id, "confirm")}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.successBorder}`,
              background: C.successBg, color: C.successText, fontWeight: 800, fontSize: 13, cursor: acting ? "not-allowed" : "pointer", fontFamily: F }}>
            {acting ? "..." : "✓ Confirm"}
          </button>
        )}
        {rental.status === "confirmed" && (
          <button disabled={acting} onClick={() => onAction(rental.id, "deliver")}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
              background: C.darkBtn, color: C.white, fontWeight: 800, fontSize: 13, cursor: acting ? "not-allowed" : "pointer", fontFamily: F }}>
            {acting ? "..." : "🚛 Mark Delivered"}
          </button>
        )}
        {rental.status === "active" && (
          <button disabled={acting} onClick={() => onAction(rental.id, "return")}
            style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: `1px solid ${C.pinkBorder}`,
              background: C.pinkBg, color: C.pinkText, fontWeight: 800, fontSize: 13, cursor: acting ? "not-allowed" : "pointer", fontFamily: F }}>
            {acting ? "..." : "✓ Mark Returned"}
          </button>
        )}
        {!["returned", "cancelled"].includes(rental.status) && (
          <button disabled={acting} onClick={() => {
            if (window.confirm("Cancel this rental?")) onAction(rental.id, "cancel");
          }}
            style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.errorBorder}`,
              background: C.errorBg, color: C.errorText, fontWeight: 700, fontSize: 12, cursor: acting ? "not-allowed" : "pointer", fontFamily: F }}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function RentalBoardPanel() {
  const [lanes, setLanes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [acting, setActing] = useState(null); // rentalId being acted on
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState("active"); // "active" | "pending" | "completed"

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-rental-board");
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Failed to load");
      setLanes(json.lanes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAction(rentalId, action) {
    setActing(rentalId);
    try {
      const res = await fetch("/api/admin-rental-board", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rentalId, action }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Action failed");
      const labels = { confirm: "Confirmed", deliver: "Marked delivered", return: "Marked returned", cancel: "Cancelled" };
      setToast({ type: "success", message: labels[action] || "Updated" });
      await load();
      // Switch to relevant tab after action
      if (action === "deliver") setActiveTab("active");
      if (action === "return" || action === "cancel") setActiveTab("completed");
      if (action === "confirm") setActiveTab("active");
    } catch (err) {
      setToast({ type: "error", message: err.message });
    } finally {
      setActing(null);
      setTimeout(() => setToast(null), 3000);
    }
  }

  const tabs = [
    { key: "active",    label: "Active",    count: (lanes?.confirmed?.length || 0) + (lanes?.active?.length || 0) },
    { key: "pending",   label: "Pending",   count: lanes?.pending?.length || 0 },
    { key: "completed", label: "Done",      count: lanes?.completed?.length || 0 },
  ];

  const activeRentals = [...(lanes?.confirmed || []), ...(lanes?.active || [])];
  // Sort: active (out) first, then confirmed (ready), by dropoff date
  activeRentals.sort((a, b) => {
    if (a.status === "active" && b.status !== "active") return -1;
    if (b.status === "active" && a.status !== "active") return 1;
    return (a.dropoff_date || "").localeCompare(b.dropoff_date || "");
  });

  const visibleRentals =
    activeTab === "active"    ? activeRentals :
    activeTab === "pending"   ? (lanes?.pending || []) :
    (lanes?.completed || []).slice(0, 20);

  if (loading) return <div style={{ color: C.inkMuted, fontSize: 14, padding: "20px 0" }}>Loading rentals...</div>;
  if (error) return (
    <div>
      <div style={{ color: C.errorText, fontSize: 13, marginBottom: 12 }}>{error}</div>
      <button onClick={load} style={{ padding: "10px 18px", borderRadius: 10, border: `1px solid ${C.cardBorder}`, background: C.surfaceBg, fontFamily: F, cursor: "pointer", fontWeight: 700 }}>Retry</button>
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Toast */}
      {toast && (
        <div style={{ padding: "10px 14px", borderRadius: 10, fontSize: 13, fontWeight: 700,
          background: toast.type === "success" ? C.successBg : C.errorBg,
          border: `1px solid ${toast.type === "success" ? C.successBorder : C.errorBorder}`,
          color: toast.type === "success" ? C.successText : C.errorText }}>
          {toast.message}
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 6 }}>
        {tabs.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ flex: 1, padding: "10px 8px", borderRadius: 10, fontFamily: F, fontWeight: 800, fontSize: 13, cursor: "pointer",
              border: activeTab === tab.key ? `2px solid ${C.pinkText}` : `1px solid ${C.cardBorder}`,
              background: activeTab === tab.key ? C.pinkBg : C.surfaceBg,
              color: activeTab === tab.key ? C.pinkText : C.inkMuted }}>
            {tab.label}
            {tab.count > 0 && (
              <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 900,
                background: activeTab === tab.key ? C.pinkText : C.inkFaint,
                color: C.white, borderRadius: 99, padding: "1px 7px" }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
        <button onClick={load} style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${C.cardBorder}`,
          background: C.surfaceBg, cursor: "pointer", fontSize: 16, lineHeight: 1 }} title="Refresh">
          ↻
        </button>
      </div>

      {/* Rental cards */}
      {visibleRentals.length === 0 ? (
        <div style={{ color: C.inkMuted, fontSize: 14, textAlign: "center", padding: "24px 0" }}>
          {activeTab === "active" ? "No active or confirmed rentals." :
           activeTab === "pending" ? "No pending rentals." : "No completed rentals in the last 30 days."}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {visibleRentals.map(rental => (
            <RentalCard
              key={rental.id}
              rental={rental}
              onAction={handleAction}
              acting={acting === rental.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CsrQuickBookPage() {
  const [zip, setZip] = useState("");
  const [zoneKey, setZoneKey] = useState("");
  const [zipError, setZipError] = useState("");
  const [selectedSize, setSelectedSize] = useState("16 Yard");
  const [inventoryCounts, setInventoryCounts] = useState(null);
  const [units, setUnits] = useState([]);
  const [countsLoading, setCountsLoading] = useState(true);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedRentalOption, setSelectedRentalOption] = useState("");
  const [selectedWindow, setSelectedWindow] = useState(null);
  const [customerLink, setCustomerLink] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSuccess, setActionSuccess] = useState("");
  const [generating, setGenerating] = useState(false);
  const [textingLink, setTextingLink] = useState(false);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualResult, setManualResult] = useState(null);
  const [mode, setMode] = useState("link");
  const [form, setForm] = useState({ phone: "", name: "", email: "", street1: "", street2: "", city: "", state: "GA", zip: "", paymentMethod: "cash", manualPaymentReference: "", notes: "" });

  // Ops panel state
  const [activeOpsPanel, setActiveOpsPanel] = useState(null); // "units" | "rental" | "customer" | null

  function loadInventory() {
    let active = true;
    (async () => {
      try {
        setCountsLoading(true);
        const response = await fetch("/api/inventory-counts");
        const json = await response.json();
        if (active && response.ok && json.success) {
          setInventoryCounts(json.counts);
          setUnits(json.units || []);
        }
      } catch {
        if (active) setInventoryCounts(null);
      } finally {
        if (active) setCountsLoading(false);
      }
    })();
    return () => { active = false; };
  }

  useEffect(() => {
    const cancel = loadInventory();
    return cancel;
  }, []);

  useEffect(() => {
    setForm((prev) => ({ ...prev, zip }));
  }, [zip]);

  const [blockedDates, setBlockedDates] = useState([]);
  const [isAvailabilityDegraded, setIsAvailabilityDegraded] = useState(false);

  useEffect(() => {
    if (!zoneKey) {
      setBlockedDates([]);
      setIsAvailabilityDegraded(false);
      setSelectedRentalOption("");
      setSelectedWindow(null);
      return;
    }

    let active = true;
    (async () => {
      try {
        setAvailabilityLoading(true);
        setAvailabilityError("");

        // Build a 90-day window to get all blocked dates for the calendar
        const start = new Date();
        start.setDate(start.getDate() + 1);
        const end = new Date(start);
        end.setDate(end.getDate() + 90);

        const sizeCode = SIZE_CODE_MAP[selectedSize];
        const response = await fetch(
          `/api/availability-supabase?sizeCode=${sizeCode}&requestedStartAt=${start.toISOString()}&requestedEndAt=${end.toISOString()}`
        );
        const json = await response.json();
        if (!active) return;

        if (response.ok && json.success) {
          // Build blocked dates from availability — if 0 units available on a day, mark blocked
          // For CSR calendar we show degraded if no units at all, otherwise open
          const isAvailable = json.availability?.isAvailable !== false;
          setIsAvailabilityDegraded(!isAvailable);
          setBlockedDates([]); // Per-date blocking handled by real-time hold check in create-booking-hold
        } else {
          setBlockedDates([]);
          setIsAvailabilityDegraded(true);
        }
      } catch {
        if (active) {
          setAvailabilityError("Unable to pull live availability right now.");
          setIsAvailabilityDegraded(true);
        }
      } finally {
        if (active) setAvailabilityLoading(false);
      }
    })();
    return () => { active = false; };
  }, [zoneKey, selectedSize]);

  const areaLabel = useMemo(() => getAreaLabel(zip), [zip]);
  const zone = zones[zoneKey] || null;
  const selectedPriceMap = useMemo(() => {
    const prices = {};
    for (const option of rentalOptions) prices[option.key] = (basePricing[selectedSize]?.[option.key] || 0) + (zone?.fee || 0);
    return prices;
  }, [selectedSize, zone]);
  const customerTotal = (basePricing[selectedSize]?.[selectedRentalOption] || 0) + (zone?.fee || 0);

  const resetMessages = () => {
    setActionError("");
    setActionSuccess("");
    setManualResult(null);
  };
  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

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
    setSelectedRentalOption("");
    setSelectedWindow(null);
    setCustomerLink("");
    resetMessages();
  }

  function validateManualDetails() {
    if (!zoneKey) return "Enter a service ZIP first.";
    if (!form.phone.trim()) return "Customer phone is required.";
    if (!selectedRentalOption || !selectedWindow) return "Choose a live delivery window first.";
    if (!form.name.trim() || !form.street1.trim() || !form.city.trim() || !form.zip.trim()) return "For manual paid bookings, name, street, city, and ZIP are required.";
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
    if (!response.ok || !json.success || !json.hold?.id) throw new Error(json.error || "Unable to create the booking hold.");
    return json.hold.id;
  }

  async function handleGenerateLink() {
    if (!zoneKey) return setActionError("Enter a service ZIP first.");
    if (!form.phone.trim()) return setActionError("Customer phone is required so you can text the link.");
    if (!selectedRentalOption || !selectedWindow) return setActionError("Choose a live delivery window before generating the customer link.");

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

  async function handleTextCustomerLink() {
    if (!customerLink) return setActionError("Generate the customer completion link first.");
    if (!form.phone.trim()) return setActionError("Customer phone is required before texting the link.");

    setTextingLink(true);
    setActionError("");
    setActionSuccess("");

    try {
      const response = await fetch("/api/send-booking-link-sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: form.phone,
          customerLink,
          size: selectedSize,
          rentalOption: selectedRentalOption,
          startLabel: selectedWindow?.startLabel,
          endLabel: selectedWindow?.endLabel,
          total: customerTotal,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Unable to text the customer link.");
      setActionSuccess("Customer completion link texted successfully.");
    } catch (error) {
      setActionError(error.message || "Unable to text the customer link.");
    } finally {
      setTextingLink(false);
    }
  }

  async function handleManualPaidBooking() {
    const validationError = validateManualDetails();
    if (validationError) return setActionError(validationError);

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
          contact: { name: form.name, email: form.email, phone: form.phone },
          deliveryAddress: { street1: form.street1, street2: form.street2, city: form.city, state: form.state, zip: form.zip },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json.success || !json.booking?.id) throw new Error(json.error || "Unable to create the manual paid booking.");
      setManualResult(json.booking);
      setActionSuccess(`Manual ${form.paymentMethod} booking created and marked reserved.`);
    } catch (error) {
      setActionError(error.message || "Unable to create the manual paid booking.");
    } finally {
      setManualSubmitting(false);
    }
  }

  const opsPanels = [
    { key: "board",    label: "Rental Board",      icon: "📦", desc: "View, deliver, and close active rentals" },
    { key: "rental",   label: "New Rental",        icon: "📋", desc: "Log a phone, cash, or broker booking" },
    { key: "units",    label: "Update Unit",        icon: "🚛", desc: "Toggle available / deployed / maintenance" },
    { key: "customer", label: "Find Customer",     icon: "🔍", desc: "Search, view, and edit customer records" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: C.pageBg, padding: "18px 12px 28px", fontFamily: F }}>
      <style jsx>{`
        .top-grid,.bottom-grid{display:grid;grid-template-columns:1fr;gap:14px}
        .stats-grid,.sizes-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        .intake-grid,.manual-grid,.city-grid{display:grid;grid-template-columns:1fr;gap:10px}
        @media (min-width:900px){.top-grid{grid-template-columns:.85fr 1.15fr}.bottom-grid{grid-template-columns:1.05fr .95fr}.intake-grid{grid-template-columns:140px 1fr auto;align-items:end}.manual-grid{grid-template-columns:1fr 1fr}.city-grid{grid-template-columns:1fr 92px 110px}}
        @media (max-width:640px){.stats-grid,.sizes-grid{grid-template-columns:1fr}.link-actions{display:grid!important;grid-template-columns:1fr!important}}
      `}</style>
      <div style={{ maxWidth: 1140, margin: "0 auto" }}>
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.pinkText, textTransform: "uppercase", letterSpacing: "1.2px" }}>Little Junkers office</div>
          <h1 style={{ margin: "6px 0 0", fontSize: 28, lineHeight: 1.05, color: C.ink }}>CSR Quick Book</h1>
        </div>

        <div className="top-grid">
          <SectionCard title="Available now">
            <div className="stats-grid">
              {allSizes.map((size) => {
                const sizeCode = SIZE_CODE_MAP[size];
                const bucket = inventoryCounts?.bySize?.[sizeCode];
                return (
                  <div key={size} style={statCardStyle}>
                    <div style={{ fontSize: 12, color: C.inkMuted }}>{size}</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: C.ink, marginTop: 6 }}>{countsLoading ? "..." : bucket?.ready ?? "-"}</div>
                    <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>ready now</div>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Quick intake">
            <div className="intake-grid">
              <Field label="ZIP"><input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="30269" style={inputStyle()} /></Field>
              <Field label="Customer phone"><input value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} placeholder="(470) 555-1234" style={inputStyle()} /></Field>
              <button onClick={handleZipLookup} style={{ ...primaryButtonStyle(false), width: "100%" }}>Check ZIP</button>
            </div>
            {zipError ? <Banner tone="warning">{zipError}</Banner> : null}
            {zone ? <Banner tone="success">{zone.label} - {areaLabel} - delivery fee {zone.fee > 0 ? formatMoney(zone.fee) : "included"}</Banner> : null}
          </SectionCard>
        </div>

        <div className="bottom-grid" style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gap: 14 }}>
            <SectionCard title="Sizes and pricing">
              <div className="sizes-grid">
                {allSizes.map((size) => {
                  const active = size === selectedSize;
                  return (
                    <button key={size} onClick={() => handleSelectSize(size)} style={{ ...sizeCardStyle, border: active ? `1.5px solid ${C.ink}` : `1px solid ${C.surfaceBorder}`, background: active ? C.white : C.surfaceBg }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: 18, fontWeight: 900, color: C.ink }}>{size}</div>
                        <div style={pillStyle(active ? "dark" : "light")}>{active ? "Selected" : "Select"}</div>
                      </div>
                      <div style={{ marginTop: 8, fontSize: 14, color: C.ink }}>{formatMoney((basePricing[size]?.["Base Rental"] || 0) + (zone?.fee || 0))}</div>
                    </button>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard title="Select rental type and date">
              {availabilityLoading ? <div style={{ color: C.inkMuted, fontSize: 14 }}>Pulling live availability...</div> : null}
              {availabilityError ? <Banner tone="warning">{availabilityError}</Banner> : null}
              {!availabilityLoading && zone ? (
                <CsrCalendarPicker
                  selectedSize={selectedSize}
                  calculatedPrices={selectedPriceMap}
                  blockedDates={blockedDates}
                  isAvailabilityDegraded={isAvailabilityDegraded}
                  selectedRentalOption={selectedRentalOption}
                  selectedWindow={selectedWindow}
                  onSelect={(tierKey, windowObj) => {
                    setSelectedRentalOption(tierKey);
                    setSelectedWindow(windowObj);
                    setCustomerLink("");
                    resetMessages();
                  }}
                />
              ) : null}
            </SectionCard>
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <SectionCard title="Book and collect payment">
              <div style={summaryCardStyle}>
                <SummaryRow label="ZIP / Area" value={zone ? `${zip} - ${areaLabel}` : "Not set"} />
                <SummaryRow label="Phone" value={form.phone || "Not set"} />
                <SummaryRow label="Size" value={selectedSize} />
                <SummaryRow label="Rental option" value={selectedRentalOption ? getRentalDisplayLabel(selectedRentalOption) : "Not selected"} />
                <SummaryRow label="Window" value={selectedWindow ? `${selectedWindow.startLabel} -> ${selectedWindow.endLabel}` : "Not selected"} />
                <SummaryRow label="Base rental" value={formatMoney(basePricing[selectedSize]?.[selectedRentalOption] || 0)} />
                <SummaryRow label="Delivery fee" value={zone ? (zone.fee > 0 ? formatMoney(zone.fee) : "Included") : "-"} />
                <div style={{ height: 1, background: C.surfaceBorder, margin: "10px 0" }} />
                <SummaryRow label="Customer total" value={formatMoney(customerTotal)} strong />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button onClick={() => setMode("link")} style={modeToggleStyle(mode === "link")}>Text link mode</button>
                <button onClick={() => setMode("manual")} style={modeToggleStyle(mode === "manual")}>Cash / Zelle mode</button>
              </div>

              {mode === "manual" ? (
                <div style={{ display: "grid", gap: 10 }}>
                  <div className="manual-grid">
                    <Field label="Customer name *"><input value={form.name} onChange={(e) => updateForm("name", e.target.value)} style={inputStyle()} /></Field>
                    <Field label="Email"><input value={form.email} onChange={(e) => updateForm("email", e.target.value)} style={inputStyle()} /></Field>
                  </div>
                  <Field label="Street address *"><input value={form.street1} onChange={(e) => updateForm("street1", e.target.value)} style={inputStyle()} /></Field>
                  <Field label="Address line 2"><input value={form.street2} onChange={(e) => updateForm("street2", e.target.value)} style={inputStyle()} /></Field>
                  <div className="city-grid">
                    <Field label="City *"><input value={form.city} onChange={(e) => updateForm("city", e.target.value)} style={inputStyle()} /></Field>
                    <Field label="State"><input value={form.state} onChange={(e) => updateForm("state", e.target.value)} style={inputStyle()} /></Field>
                    <Field label="ZIP *"><input value={form.zip} onChange={(e) => updateForm("zip", e.target.value)} style={inputStyle()} /></Field>
                  </div>
                  <div className="manual-grid">
                    <Field label="Payment type"><select value={form.paymentMethod} onChange={(e) => updateForm("paymentMethod", e.target.value)} style={inputStyle()}><option value="cash">Cash</option><option value="zelle">Zelle</option></select></Field>
                    <Field label="Reference / confirmation"><input value={form.manualPaymentReference} onChange={(e) => updateForm("manualPaymentReference", e.target.value)} style={inputStyle()} /></Field>
                  </div>
                  <Field label="Office notes"><textarea value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} style={inputStyle({ minHeight: 88, resize: "vertical" })} /></Field>
                </div>
              ) : null}

              {mode === "link" ? (
                <button onClick={handleGenerateLink} disabled={generating || !zoneKey || !selectedWindow || !selectedRentalOption} style={primaryButtonStyle(generating || !zoneKey || !selectedWindow || !selectedRentalOption)}>
                  {generating ? "Generating link..." : "Create customer completion link"}
                </button>
              ) : (
                <button onClick={handleManualPaidBooking} disabled={manualSubmitting || !zoneKey || !selectedWindow || !selectedRentalOption} style={manualButtonStyle(manualSubmitting || !zoneKey || !selectedWindow || !selectedRentalOption)}>
                  {manualSubmitting ? `Finalizing ${form.paymentMethod} booking...` : `Mark ${form.paymentMethod === "zelle" ? "Zelle" : "Cash"} paid and create booking`}
                </button>
              )}

              {actionError ? <Banner tone="warning">{actionError}</Banner> : null}
              {actionSuccess ? <Banner tone="success">{actionSuccess}</Banner> : null}

              {customerLink ? (
                <div>
                  <textarea readOnly value={customerLink} style={inputStyle({ minHeight: 100, resize: "vertical" })} />
                  <div className="link-actions" style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                    <button onClick={handleTextCustomerLink} disabled={textingLink} style={secondaryButtonStyle}>{textingLink ? "Texting..." : "Text link"}</button>
                    <button onClick={() => navigator.clipboard.writeText(customerLink)} style={secondaryButtonStyle}>Copy link</button>
                    <a href={customerLink} target="_blank" rel="noreferrer" style={{ ...secondaryButtonStyle, textDecoration: "none", textAlign: "center" }}>Open link</a>
                  </div>
                </div>
              ) : null}

              {manualResult ? (
                <div style={summaryCardStyle}>
                  <SummaryRow label="Booking ID" value={manualResult.id || "-"} />
                  <SummaryRow label="Status" value={manualResult.status || "reserved"} />
                  <SummaryRow label="Payment path" value={form.paymentMethod === "zelle" ? "Zelle" : "Cash"} />
                </div>
              ) : null}
            </SectionCard>
          </div>
        </div>

        {/* ── Ops Panel ── */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, height: 1, background: C.cardBorder }} />
            <div style={{ fontSize: 11, fontWeight: 800, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "1.2px", whiteSpace: "nowrap" }}>Operations</div>
            <div style={{ flex: 1, height: 1, background: C.cardBorder }} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 14 }}>
            {opsPanels.map(panel => {
              const isActive = activeOpsPanel === panel.key;
              return (
                <button key={panel.key} onClick={() => setActiveOpsPanel(isActive ? null : panel.key)}
                  style={{ padding: "14px 12px", borderRadius: 14, border: isActive ? `2px solid ${C.pinkText}` : `1px solid ${C.cardBorder}`,
                    background: isActive ? C.pinkBg : C.cardBg, cursor: "pointer", fontFamily: F, textAlign: "left",
                    boxShadow: isActive ? `0 0 0 3px ${C.pinkBorder}` : "none", transition: "all 150ms" }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{panel.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 900, color: isActive ? C.pinkText : C.ink }}>{panel.label}</div>
                  <div style={{ fontSize: 11, color: isActive ? C.pinkText : C.inkMuted, marginTop: 3, lineHeight: 1.4 }}>{panel.desc}</div>
                </button>
              );
            })}
          </div>

          {activeOpsPanel && (
            <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 22, padding: 16 }}>
              <div style={{ marginBottom: 14, fontSize: 16, fontWeight: 900, color: C.ink }}>
                {opsPanels.find(p => p.key === activeOpsPanel)?.label}
              </div>
              {activeOpsPanel === "board"    && <RentalBoardPanel />}
              {activeOpsPanel === "units"    && <UnitStatusPanel units={units} onRefresh={loadInventory} />}
              {activeOpsPanel === "rental"   && <NewRentalPanel />}
              {activeOpsPanel === "customer" && <FindCustomerPanel />}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// ─── CSR Calendar Picker ──────────────────────────────────────────────────────

function CsrCalendarPicker({ selectedSize, calculatedPrices, blockedDates, isAvailabilityDegraded, selectedRentalOption, selectedWindow, onSelect }) {
  const TIERS = [
    { key: "Early Bird",      label: "Discounted 2-Day", sublabel: "Mon or Tue delivery only", tag: null,             validDays: [1, 2],          duration: 2 },
    { key: "Base Rental",     label: "Standard 2-Day",   sublabel: "Any day except Mon/Tue",   tag: null,             validDays: [0, 3, 4, 5, 6], duration: 2 },
    { key: "Weekend Warrior", label: "4-Day",             sublabel: "Any start date",            tag: "Most Flexible", validDays: null,             duration: 4 },
    { key: "Full Reset",      label: "7-Day",             sublabel: "Any start date",            tag: null,             validDays: null,             duration: 7 },
  ];

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const tomorrow = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 1); return d; }, [today]);
  const windowEnd = useMemo(() => { const d = new Date(today); d.setDate(d.getDate() + 90); return d; }, [today]);

  const [selectedTierKey, setSelectedTierKey] = useState(selectedRentalOption || null);
  const [calendarMonth, setCalendarMonth] = useState(() => ({ year: tomorrow.getFullYear(), month: tomorrow.getMonth() }));

  const blocked = useMemo(() => {
    if (!blockedDates || !Array.isArray(blockedDates)) return new Set();
    return new Set(blockedDates);
  }, [blockedDates]);

  const toDateStr = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const addDays   = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const formatDisplay = (d) => d.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" });
  const formatShort   = (d) => d.toLocaleDateString("en-US", { month:"short", day:"numeric" });

  const isDateAvailable = (d) => {
    if (d <= today || d > windowEnd) return false;
    if (isAvailabilityDegraded) return true;
    return !blocked.has(toDateStr(d));
  };

  const isDateSelectableForTier = (d, tier) => {
    if (!isDateAvailable(d)) return false;
    if (tier.validDays && !tier.validDays.includes(d.getDay())) return false;
    if (!isAvailabilityDegraded) {
      for (let i = 0; i < tier.duration; i++) {
        if (blocked.has(toDateStr(addDays(d, i)))) return false;
      }
    }
    return true;
  };

  const handleDateSelect = (d, tier) => {
    if (!isDateSelectableForTier(d, tier)) return;
    const endDate = addDays(d, tier.duration);
    const windowObj = {
      start:      toDateStr(d),
      end:        toDateStr(endDate),
      startLabel: formatDisplay(d),
      endLabel:   formatDisplay(endDate),
      startIso:   d.toISOString(),
      endIso:     endDate.toISOString(),
    };
    onSelect(tier.key, windowObj);
  };

  const CalendarWidget = ({ tier }) => {
    const { year, month } = calendarMonth;
    const firstDay   = new Date(year, month, 1);
    const lastDay    = new Date(year, month + 1, 0);
    const startPad   = firstDay.getDay();
    const monthLabel = firstDay.toLocaleDateString("en-US", { month:"long", year:"numeric" });
    const dayHeaders = ["Su","Mo","Tu","We","Th","Fr","Sa"];

    const prevMonth = () => setCalendarMonth(prev => { let m = prev.month-1, y=prev.year; if(m<0){m=11;y--;} return {year:y,month:m}; });
    const nextMonth = () => setCalendarMonth(prev => { let m = prev.month+1, y=prev.year; if(m>11){m=0;y++;} return {year:y,month:m}; });

    const cells = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));

    const selectedStart = selectedWindow?.start;
    const isThisTierSelected = selectedRentalOption === tier.key;

    return (
      <div style={{ background: C.white }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 16px", borderBottom:`1px solid ${C.surfaceBorder}` }}>
          <button onClick={prevMonth} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.ink, padding:"0 8px", lineHeight:1 }}>‹</button>
          <span style={{ fontSize:14, fontWeight:800, color:C.ink, fontFamily:F }}>{monthLabel}</span>
          <button onClick={nextMonth} style={{ background:"none", border:"none", cursor:"pointer", fontSize:20, color:C.ink, padding:"0 8px", lineHeight:1 }}>›</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"8px 8px 2px" }}>
          {dayHeaders.map(h => <div key={h} style={{ textAlign:"center", fontSize:10, fontWeight:700, color:C.inkFaint, fontFamily:F, paddingBottom:2 }}>{h}</div>)}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", padding:"0 8px 10px", gap:2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={`pad-${i}`} />;
            const dateStr    = toDateStr(d);
            if (d <= today) return <div key={dateStr} />;
            const selectable = isDateSelectableForTier(d, tier);
            const isOutside  = d > windowEnd;
            const isWrongDay = tier.validDays && !tier.validDays.includes(d.getDay());
            const isFull     = !isOutside && !isWrongDay && !isDateAvailable(d);
            const isSelected = isThisTierSelected && dateStr === selectedStart;

            let bg = "transparent", color = C.ink, opacity = 1, cursor = "pointer", textDeco = "none";
            if (isSelected)      { bg = C.pinkText; color = C.white; }
            else if (isOutside)  { color = C.inkFaint; opacity = 0.3; cursor = "default"; }
            else if (isWrongDay) { color = C.inkFaint; opacity = 0.25; cursor = "default"; }
            else if (isFull)     { color = C.inkFaint; opacity = 0.4; cursor = "not-allowed"; textDeco = "line-through"; }

            return (
              <button key={dateStr} onClick={() => selectable && handleDateSelect(d, tier)} style={{ padding:"7px 0", borderRadius:8, fontSize:13, fontWeight: isSelected ? 800 : 500, textAlign:"center", fontFamily:F, background:bg, color, opacity, cursor, border:"none", textDecoration:textDeco, transition:"background 100ms" }}>
                {d.getDate()}
              </button>
            );
          })}
        </div>
        {isThisTierSelected && selectedWindow?.start && (
          <div style={{ padding:"10px 16px 14px", borderTop:`1px solid ${C.surfaceBorder}`, textAlign:"center" }}>
            <span style={{ fontSize:13, fontWeight:700, color:C.pinkText, fontFamily:F }}>
              Drop off {formatShort(new Date(selectedWindow.start + "T12:00:00"))} · Pick up {formatShort(new Date(selectedWindow.end + "T12:00:00"))}
            </span>
          </div>
        )}
        {isAvailabilityDegraded && (
          <div style={{ padding:"8px 16px", background:"#fffbe6", borderTop:`1px solid #ffe58f`, textAlign:"center" }}>
            <span style={{ fontSize:11, color:"#8a6300", fontFamily:F }}>Live availability temporarily unavailable — all dates shown as open</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
      {TIERS.map(tier => {
        const price    = calculatedPrices[tier.key];
        const isActive = selectedTierKey === tier.key;
        return (
          <div key={tier.key}>
            <button
              onClick={() => setSelectedTierKey(isActive ? null : tier.key)}
              style={{
                width:"100%", textAlign:"left", padding:"14px 16px",
                borderRadius: isActive ? "12px 12px 0 0" : 12,
                cursor:"pointer", fontFamily:F,
                display:"flex", justifyContent:"space-between", alignItems:"center",
                border: isActive ? `2px solid ${C.pinkText}` : `1px solid ${C.surfaceBorder}`,
                borderBottom: isActive ? "none" : undefined,
                background: isActive ? C.pinkBg : C.white,
                boxShadow: isActive ? `0 0 0 3px ${C.pinkBorder}` : "0 1px 3px rgba(0,0,0,0.04)",
                transition:"border-color 150ms, background 150ms",
              }}
            >
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:14, fontWeight:900, color: isActive ? C.pinkText : C.ink, fontFamily:F }}>{tier.label}</span>
                  {tier.tag && <span style={{ fontSize:10, fontWeight:800, color:C.pinkText, background: isActive ? C.white : C.pinkBg, border:`1px solid ${C.pinkBorder}`, borderRadius:99, padding:"2px 8px", fontFamily:F }}>{tier.tag}</span>}
                </div>
                <div style={{ fontSize:11, color: isActive ? C.pinkText : C.inkMuted, fontFamily:F }}>{tier.sublabel}</div>
              </div>
              <div style={{ textAlign:"right", flexShrink:0, marginLeft:12 }}>
                <div style={{ fontSize:20, fontWeight:900, color: isActive ? C.pinkText : C.ink, letterSpacing:"-0.5px", fontFamily:F }}>
                  {typeof price === "number" ? `$${price}` : "—"}
                </div>
                <div style={{ fontSize:11, color: isActive ? C.pinkText : C.inkFaint, fontFamily:F, marginTop:2 }}>
                  {isActive ? "select a date ↓" : "tap to select"}
                </div>
              </div>
            </button>
            {isActive && (
              <div style={{ border:`2px solid ${C.pinkText}`, borderTop:"none", borderRadius:"0 0 12px 12px", overflow:"hidden", boxShadow:`0 0 0 3px ${C.pinkBorder}`, marginBottom:2 }}>
                <CalendarWidget tier={tier} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function SectionCard({ title, children }) {
  return <div style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 22, padding: 16 }}><div style={{ marginBottom: 12, fontSize: 18, fontWeight: 900, color: C.ink, lineHeight: 1.1 }}>{title}</div>{children}</div>;
}
function Field({ label, children }) {
  return <label style={{ display: "block" }}><div style={{ marginBottom: 6, fontSize: 12, fontWeight: 700, color: C.ink }}>{label}</div>{children}</label>;
}
function Banner({ tone, children }) {
  const tones = { warning: { bg: C.warningBg, border: C.warningBorder, text: C.warningText }, success: { bg: C.successBg, border: C.successBorder, text: C.successText } };
  const current = tones[tone] || tones.warning;
  return <div style={{ marginTop: 10, background: current.bg, border: `1px solid ${current.border}`, borderRadius: 12, padding: "10px 12px", color: current.text, fontSize: 13, lineHeight: 1.45 }}>{children}</div>;
}
function SummaryRow({ label, value, strong = false }) {
  return <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", padding: "6px 0" }}><div style={{ color: C.inkMuted, fontSize: 13 }}>{label}</div><div style={{ color: C.ink, fontSize: 14, fontWeight: strong ? 800 : 600, textAlign: "right" }}>{value}</div></div>;
}
const summaryCardStyle = { background: C.surfaceBg, border: `1px solid ${C.surfaceBorder}`, borderRadius: 14, padding: "12px 14px" };
const statCardStyle = { background: C.surfaceBg, border: `1px solid ${C.surfaceBorder}`, borderRadius: 16, padding: 14, minHeight: 96 };
const sizeCardStyle = { width: "100%", textAlign: "left", borderRadius: 16, padding: 14, cursor: "pointer" };
function inputStyle(extra = {}) { return { display: "block", width: "100%", padding: "12px 13px", borderRadius: 10, border: `1px solid ${C.surfaceBorder}`, background: C.white, fontFamily: F, fontSize: 14, boxSizing: "border-box", ...extra }; }
function primaryButtonStyle(disabled) { return { padding: "14px 16px", borderRadius: 12, border: "none", background: disabled ? C.inkFaint : C.darkBtn, color: C.white, fontFamily: F, fontWeight: 800, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", width: "100%" }; }
function manualButtonStyle(disabled) { return { padding: "14px 16px", borderRadius: 12, border: `1px solid ${C.pinkBorder}`, background: disabled ? C.surfaceBorder : C.pinkBg, color: disabled ? C.inkMuted : C.pinkText, fontFamily: F, fontWeight: 800, fontSize: 14, cursor: disabled ? "not-allowed" : "pointer", width: "100%" }; }
function modeToggleStyle(active) { return { padding: "12px 12px", borderRadius: 12, border: active ? `1.5px solid ${C.ink}` : `1px solid ${C.surfaceBorder}`, background: active ? C.white : C.surfaceBg, color: C.ink, fontFamily: F, fontWeight: 800, fontSize: 13, cursor: "pointer" }; }
const secondaryButtonStyle = { padding: "12px 14px", borderRadius: 10, border: `1px solid ${C.surfaceBorder}`, background: C.white, color: C.ink, fontFamily: F, fontWeight: 700, fontSize: 14, cursor: "pointer" };
function pillStyle(mode) { return { background: mode === "dark" ? C.ink : C.pinkBg, color: mode === "dark" ? C.white : C.pinkText, border: mode === "dark" ? "none" : `1px solid ${C.pinkBorder}`, borderRadius: 999, padding: "4px 10px", fontSize: 11, fontWeight: 800, whiteSpace: "nowrap" }; }
