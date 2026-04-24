// api/get-booking-hold.js
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

function asString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed. Use GET." });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ success: false, error: "Forbidden origin" });
  }

  try {
    assertServerOnly();

    const holdId = asString(req.query.holdId || req.query.id);

    if (!holdId) {
      return res.status(400).json({ success: false, error: "Missing holdId." });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("booking_holds")
      .select("id, size_code, requested_start_at, requested_end_at, delivery_date, rental_option, status, expires_at, customer_name, customer_email, metadata, created_at")
      .eq("id", holdId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ success: false, error: "Booking hold not found." });
    }

    return res.status(200).json({ success: true, hold: data });
  } catch (error) {
    console.error("[get-booking-hold] FAILED", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to load booking hold" });
  }
}
