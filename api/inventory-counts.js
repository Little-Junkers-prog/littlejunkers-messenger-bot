// api/inventory-counts.js
// Sprint 2A: queries public.units for live inventory counts
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
    totalUnits: rows.length,
    bySize: {
      "11YD": { total: 0, available: 0, deployed: 0, maintenance: 0, ready: 0 },
      "16YD": { total: 0, available: 0, deployed: 0, maintenance: 0, ready: 0 },
      "21YD": { total: 0, available: 0, deployed: 0, maintenance: 0, ready: 0 },
    },
  };

  for (const row of rows) {
    const sizeKey = `${row.size_yards}YD`;
    const bucket = counts.bySize[sizeKey];
    if (!bucket) continue;

    bucket.total += 1;

    if (row.status === "available") {
      bucket.available += 1;
      bucket.ready += 1; // available = ready for CSR display
    } else if (row.status === "deployed") {
      bucket.deployed += 1;
    } else if (row.status === "maintenance") {
      bucket.maintenance += 1;
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
      .from("units")
      .select("id, name, size_yards, status, return_date, notes")
      .order("size_yards", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;

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
