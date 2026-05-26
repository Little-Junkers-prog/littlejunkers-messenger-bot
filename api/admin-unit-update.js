// api/admin-unit-update.js — CSR ops: toggle unit status
// Fixes:
//   - Wrong table name: "units" → "dumpster_units"
//   - Legacy status "available" → canonical "ready"
//   - .single() on a UUID-matched update is safe; kept intentionally
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

// Canonical dumpster_units readiness_status values
const VALID_STATUSES = ["ready", "deployed", "maintenance", "retired", "out_of_service"];

// Accept legacy "available" from the CSR UI and normalize to canonical "ready"
function normalizeStatus(raw) {
  const s = String(raw || "").toLowerCase().trim();
  if (s === "available") return "ready";
  return VALID_STATUSES.includes(s) ? s : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "POST only" });
  }
  assertServerOnly();

  const { unitId, status: rawStatus } = req.body || {};

  if (!unitId) {
    return res.status(400).json({ success: false, error: "unitId (UUID) is required" });
  }

  const status = normalizeStatus(rawStatus);
  if (!status) {
    return res.status(400).json({
      success: false,
      error: `Invalid status "${rawStatus}". Valid values: ${VALID_STATUSES.join(", ")} (or legacy "available")`,
    });
  }

  const supabase = getSupabaseAdmin();

  // Fetch the unit first to confirm it exists and get its current state for the audit log.
  // maybeSingle() avoids the "Cannot coerce to single JSON object" error if the UUID
  // somehow matches zero rows.
  const { data: existing, error: fetchError } = await supabase
    .from("dumpster_units")
    .select("id, unit_code, size_code, readiness_status, lifecycle_status")
    .eq("id", unitId)
    .maybeSingle();

  if (fetchError) {
    return res.status(500).json({ success: false, error: fetchError.message });
  }
  if (!existing) {
    return res.status(404).json({ success: false, error: `No unit found with id: ${unitId}` });
  }

  // Update readiness_status on the canonical table.
  // We do NOT touch lifecycle_status here — that is a separate admin concern.
  const { data: updated, error: updateError } = await supabase
    .from("dumpster_units")
    .update({ readiness_status: status })
    .eq("id", unitId)
    .select("id, unit_code, size_code, readiness_status, lifecycle_status")
    .maybeSingle();

  if (updateError) {
    return res.status(500).json({ success: false, error: updateError.message });
  }

  // Log admin override event
  await supabase.from("events").insert({
    event_type: "admin_override",
    source: "admin",
    payload: {
      unitId,
      unitCode: existing.unit_code,
      sizeCode: existing.size_code,
      previousStatus: existing.readiness_status,
      newStatus: status,
      triggeredBy: "csr_unit_panel",
    },
  });

  return res.status(200).json({
    success: true,
    unit: updated,
    normalized: rawStatus !== status ? { from: rawStatus, to: status } : undefined,
  });
}
