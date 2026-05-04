// api/admin-manual-rental.js — CSR ops: create a manual rental record
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

function normalizePhone(value) {
  const raw = String(value || "").replace(/\D/g, "");
  if (!raw) return null;
  return raw.length === 10 ? `+1${raw}` : raw.startsWith("1") ? `+${raw}` : raw;
}

const SIZE_YARDS = { "11 Yard": 11, "16 Yard": 16, "21 Yard": 21 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST only" });
  assertServerOnly();

  const { name, phone, email, street, city, state, zip, size, dropoffDate, returnDate, rentalDays, zone, paymentStatus, paymentMethod, amount, notes } = req.body || {};

  if (!name || !phone || !street || !dropoffDate || !returnDate) {
    return res.status(400).json({ success: false, error: "name, phone, street, dropoffDate, and returnDate are required" });
  }

  const supabase = getSupabaseAdmin();

  // Upsert customer by phone
  const normalizedPhone = normalizePhone(phone) || phone;
  let customerId;
  const { data: existing } = await supabase.from("customers").select("id").eq("phone", normalizedPhone).maybeSingle();

  if (existing) {
    customerId = existing.id;
  } else {
    const { data: newC, error: cErr } = await supabase.from("customers").insert({
      name, phone: normalizedPhone, email: email || null,
      address: street, city: city || null, zip: zip || null, zone: zone || "local",
    }).select("id").single();
    if (cErr) return res.status(500).json({ success: false, error: cErr.message });
    customerId = newC.id;
  }

  const sizeYards = SIZE_YARDS[size] || 16;
  const deliveryAddress = [street, city, state, zip].filter(Boolean).join(", ");
  const days = parseInt(rentalDays) || Math.max(1, Math.round((new Date(returnDate) - new Date(dropoffDate)) / 86400000));
  const amountPaid = paymentStatus === "paid" && amount ? parseFloat(amount) : null;

  const { data: rental, error: rErr } = await supabase.from("rentals").insert({
    customer_id: customerId,
    status: paymentStatus === "paid" ? "confirmed" : "awaiting_date",
    size_yards: sizeYards,
    delivery_address: deliveryAddress,
    zone: zone || "local",
    dropoff_date: dropoffDate,
    scheduled_return: returnDate,
    rental_days: days,
    payment_source: paymentMethod === "broker" ? "broker" : "manual_link",
    amount_paid: amountPaid,
    notes: notes || null,
  }).select("id, status").single();

  if (rErr) return res.status(500).json({ success: false, error: rErr.message });

  if (paymentStatus === "paid" && amountPaid) {
    await supabase.from("payments").insert({
      rental_id: rental.id, customer_id: customerId,
      source: ["cash","zelle"].includes(paymentMethod) ? "cash" : "manual",
      amount: amountPaid, currency: "usd", status: "received",
      payload: { method: paymentMethod, enteredBy: "csr" },
    });
  }

  await supabase.from("events").insert({
    event_type: "rental_confirmed",
    source: "manual_entry",
    rental_id: rental.id,
    customer_id: customerId,
    payload: { paymentStatus, paymentMethod, enteredBy: "csr" },
  });

  return res.status(200).json({ success: true, rentalId: rental.id, status: rental.status });
}
