import { getPublicComparison } from "../lib/comparisonService";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function allowed(req) {
  return !req.headers.origin || ALLOWED_ORIGINS.has(req.headers.origin);
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return allowed(req) ? res.status(200).end() : res.status(403).json({ success: false, error: "Forbidden origin" });
  if (req.method !== "GET") return res.status(405).json({ success: false, error: "Method not allowed" });
  if (!allowed(req)) return res.status(403).json({ success: false, error: "Forbidden origin" });

  const zip = String(req.query.zip || "").trim();
  const sizeClass = String(req.query.size || req.query.sizeClass || "").trim();
  const tierKey = String(req.query.tierKey || "3day").trim();
  if (!/^\d{5}$/.test(zip)) return res.status(400).json({ success: false, error: "A 5-digit ZIP is required" });
  if (!["11", "16", "21"].includes(sizeClass)) return res.status(400).json({ success: false, error: "size must be 11, 16, or 21" });

  try {
    const comparison = await getPublicComparison({ zip, sizeClass, tierKey });
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    return res.status(200).json({ success: true, ...comparison });
  } catch (error) {
    console.error("[compare-dumpsters] FAILED", error);
    return res.status(500).json({ success: false, error: "Failed to load comparison data" });
  }
}
