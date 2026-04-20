// api/test-supabase.js
import { createClient } from "@supabase/supabase-js";

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

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new Error("Missing SUPABASE_URL");
  }

  if (!secretKey) {
    throw new Error("Missing SUPABASE_SECRET_KEY");
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
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
    const supabase = getSupabaseAdmin();

    const { data, error, count } = await supabase
      .from("dumpster_units")
      .select(
        "id, unit_code, size_code, lifecycle_status, readiness_status, created_at",
        { count: "exact" }
      )
      .order("unit_code", { ascending: true });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message: "Supabase connection successful.",
      table: "dumpster_units",
      rowCount: count ?? data?.length ?? 0,
      rows: data ?? [],
      environment: {
        hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
        hasSupabaseSecretKey: Boolean(process.env.SUPABASE_SECRET_KEY),
      },
    });
  } catch (error) {
    console.error("[test-supabase] FAILED", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Supabase test query failed",
    });
  }
}
