// api/inventory-counts.js
// CSR inventory counts derived from units plus active rental commitments.
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

const BLOCKING_STATUSES = ["pending", "awaiting_date", "confirmed", "active"];

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

function resolveRentalStatus(rental) {
  if (
    rental.status === "pending" &&
    (Number(rental.amount_paid || 0) > 0 || rental.payment_source === "funnel")
  ) {
    return "confirmed";
  }
  return rental.status;
}

function emptyCounts() {
  return {
    totalUnits: 0,
    bySize: {
      "11YD": { total: 0, available: 0, deployed: 0, maintenance: 0, reserved: 0, ready: 0 },
      "16YD": { total: 0, available: 0, deployed: 0, maintenance: 0, reserved: 0, ready: 0 },
      "21YD": { total: 0, available: 0, deployed: 0, maintenance: 0, reserved: 0, ready: 0 },
    },
  };
}

function buildCounts(units = [], rentals = []) {
  const counts = emptyCounts();
  counts.totalUnits = units.length;

  for (const row of units) {
    const sizeKey = `${row.size_yards}YD`;
    const bucket = counts.bySize[sizeKey];
    if (!bucket) continue;

    bucket.total += 1;

    if (row.status === "available") {
      bucket.available += 1;
    } else if (row.status === "deployed") {
      bucket.deployed += 1;
    } else if (row.status === "maintenance") {
      bucket.maintenance += 1;
    }
  }

  for (const rental of rentals) {
    const status = resolveRentalStatus(rental);
    if (!BLOCKING_STATUSES.includes(status)) continue;

    const sizeKey = `${rental.size_yards}YD`;
    const bucket = counts.bySize[sizeKey];
    if (!bucket) continue;

    bucket.reserved += 1;
  }

  for (const bucket of Object.values(counts.bySize)) {
    const rentableFleet = Math.max(0, bucket.total - bucket.maintenance);
    // Ready-now should reflect fleet capacity minus active/confirmed/pending commitments.
    // This prevents stale unit.status values from making CSR availability drift from the rental board.
    bucket.ready = Math.max(0, rentableFleet - bucket.reserved);
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

    const [unitsRes, rentalsRes] = await Promise.all([
      supabase
        .from("units")
        .select("id, name, size_yards, status, return_date, notes")
        .order("size_yards", { ascending: true })
        .order("name", { ascending: true }),
      supabase
        .from("rentals")
        .select("id, status, size_yards, amount_paid, payment_source, dropoff_date, scheduled_return")
        .in("status", BLOCKING_STATUSES),
    ]);

    if (unitsRes.error) throw unitsRes.error;
    if (rentalsRes.error) throw rentalsRes.error;

    const units = unitsRes.data ?? [];
    const rentals = rentalsRes.data ?? [];
    const counts = buildCounts(units, rentals);

    return res.status(200).json({
      success: true,
      message: "Inventory counts fetched successfully.",
      counts,
      units,
      rentalsCounted: rentals.length,
    });
  } catch (error) {
    console.error("[inventory-counts] FAILED", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to fetch inventory counts",
    });
  }
}
