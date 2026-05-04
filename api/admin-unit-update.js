// api/admin-unit-update.js — CSR ops: toggle unit status
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "POST only" });
  assertServerOnly();

  const { unitId, status } = req.body || {};
  if (!unitId || !["available", "deployed", "maintenance"].includes(status)) {
    return res.status(400).json({ success: false, error: "unitId and valid status required" });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("units")
    .update({ status })
    .eq("id", unitId)
    .select("id, name, size_yards, status")
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });

  // Log admin override event
  await supabase.from("events").insert({
    event_type: "admin_override",
    source: "admin",
    payload: { unitId, newStatus: status, unitName: data.name },
  });

  return res.status(200).json({ success: true, unit: data });
}
