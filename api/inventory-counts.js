// api/inventory-counts.js
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

function buildCounts(rows) {
  const counts = {
    totalUnits: 0,
    bySize: {
      "11YD": { total: 0, active: 0, ready: 0, needs_emptying: 0, in_repair: 0, retired: 0 },
      "16YD": { total: 0, active: 0, ready: 0, needs_emptying: 0, in_repair: 0, retired: 0 },
      "21YD": { total: 0, active: 0, ready: 0, needs_emptying: 0, in_repair: 0, retired: 0 },
    },
  };

  for (const row of rows) {
    const size = row.size_code;
    const bucket = counts.bySize[size];

    if (!bucket) {
      continue;
    }

    counts.totalUnits += 1;
    bucket.total += 1;

    if (row.lifecycle_status === "active") {
      bucket.active += 1;
    }

    if (row.readiness_status === "ready") {
      bucket.ready += 1;
    }

    if (row.readiness_status === "needs_emptying") {
      bucket.needs_emptying += 1;
    }

    if (row.lifecycle_status === "in_repair") {
      bucket.in_repair += 1;
    }

    if (row.lifecycle_status === "retired") {
      bucket.retired += 1;
    }
  }

  return counts;
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ error: "Forbidden origin" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ error: "Forbidden origin" });
  }

  try {
    assertServerOnly();

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("dumpster_units")
      .select("id, unit_code, size_code, lifecycle_status, readiness_status")
      .order("unit_code", { ascending: true });

    if (error) {
      throw error;
    }

    const rows = data ?? [];
    const counts = buildCounts(rows);

    return res.status(200).json({
      success: true,
      message: "Inventory counts fetched successfully.",
      counts,
      units: rows,
    });
  } catch (error) {
    console.error("[inventory-counts] FAILED", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch inventory counts",
    });
  }
}
