// api/admin-customer-search.js — CSR ops: search customers by phone or name
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "GET only" });
  assertServerOnly();

  const q = String(req.query.q || "").trim();
  if (!q || q.length < 2) return res.status(400).json({ success: false, error: "Query too short" });

  const supabase = getSupabaseAdmin();
  const isPhone = /^\d{7,}/.test(q.replace(/\D/g, ""));

  let query = supabase.from("customers").select("id, name, phone, email, notes, created_at").limit(10);

  if (isPhone) {
    const digits = q.replace(/\D/g, "");
    query = query.ilike("phone", `%${digits}%`);
  } else {
    query = query.ilike("name", `%${q}%`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) return res.status(500).json({ success: false, error: error.message });

  // Add rental count per customer
  const customers = await Promise.all((data || []).map(async (c) => {
    const { count } = await supabase.from("rentals").select("id", { count: "exact", head: true }).eq("customer_id", c.id);
    return { ...c, rentals_count: count || 0 };
  }));

  return res.status(200).json({ success: true, customers });
}
