// api/admin-customer-update.js — CSR ops: update customer record
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST only" });
  assertServerOnly();

  const { customerId, name, phone, email, notes } = req.body || {};
  if (!customerId) return res.status(400).json({ success: false, error: "customerId required" });

  const supabase = getSupabaseAdmin();
  const patch = {};
  if (name !== undefined) patch.name = name;
  if (phone !== undefined) patch.phone = phone;
  if (email !== undefined) patch.email = email;
  if (notes !== undefined) patch.notes = notes;

  const { data, error } = await supabase.from("customers").update(patch).eq("id", customerId).select("id, name, phone, email").single();
  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.status(200).json({ success: true, customer: data });
}
