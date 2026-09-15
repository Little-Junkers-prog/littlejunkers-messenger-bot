import { getSupabaseAdmin } from "../lib/supabaseAdmin";
import { recordComparisonEvent, updateComparisonSession } from "../lib/comparisonFunnelService";

function text(value, max = 160) { return String(value || "").trim().slice(0, max); }
function phone(value) { return text(value, 40).replace(/[^0-9+]/g, ""); }

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
  const body = req.body || {};
  const sessionId = text(body.sessionId, 40);
  const firstName = text(body.firstName, 80);
  const mobile = phone(body.mobile);
  const email = text(body.email, 160).toLowerCase();
  const marketingSmsOptIn = body.marketingSmsOptIn === true;

  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return res.status(400).json({ success: false, error: "Valid sessionId required" });
  if (!firstName) return res.status(400).json({ success: false, error: "First name is required" });
  if (mobile.replace(/\D/g, "").length < 10) return res.status(400).json({ success: false, error: "A valid mobile number is required" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ success: false, error: "Email is invalid" });

  try {
    const supabase = getSupabaseAdmin();
    const { data: session, error: sessionError } = await supabase.from("comparison_sessions").select("id,market_city,market_zip,selected_size_yards,lead_id,unlocked_at").eq("id", sessionId).single();
    if (sessionError || !session) return res.status(404).json({ success: false, error: "Comparison session not found" });
    if (!session.market_zip || !session.selected_size_yards) return res.status(409).json({ success: false, error: "Choose a location and dumpster size first" });

    const leadData = {
      name: firstName,
      phone: mobile,
      email: email || null,
      city: session.market_city || null,
      zip: session.market_zip,
      size_yards: session.selected_size_yards,
      lead_source: "Comparison Tool",
      funnel_source: "comparison_tool",
      funnel_status: "active",
      sms_opt_in: marketingSmsOptIn,
      sms_opt_in_date: marketingSmsOptIn ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    let leadId = session.lead_id;
    if (leadId) {
      const { error } = await supabase.from("leads").update(leadData).eq("id", leadId);
      if (error) throw new Error(`Comparison lead update failed: ${error.message}`);
    } else {
      const { data, error } = await supabase.from("leads").insert(leadData).select("id").single();
      if (error) throw new Error(`Comparison lead create failed: ${error.message}`);
      leadId = data.id;
    }

    await updateComparisonSession(sessionId, { leadId, unlocked: !session.unlocked_at });
    if (!session.unlocked_at) await recordComparisonEvent({ sessionId, eventName: "comparison_unlocked", context: { marketingSmsOptIn } });

    return res.status(200).json({ success: true, sessionId, leadId });
  } catch (error) {
    console.error("[comparison-unlock] FAILED", error);
    return res.status(500).json({ success: false, error: "Unable to unlock comparison" });
  }
}
