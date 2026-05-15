// api/randy-health.js
// Safe runtime diagnostics for Randy. Does not expose secret values.

import { getSupabaseAdmin } from "../lib/supabaseAdmin";

function hasEnv(name) {
  return Boolean(process.env[name]);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const checks = {
    openai: {
      configured: hasEnv("OPENAI_API_KEY"),
      model: process.env.RANDY_OPENAI_MODEL || "gpt-4o-mini",
    },
    supabase: {
      urlConfigured: hasEnv("SUPABASE_URL"),
      serviceKeyConfigured: hasEnv("SUPABASE_SERVICE_ROLE_KEY") || hasEnv("SUPABASE_SECRET_KEY"),
      connection: "not_checked",
    },
    randyToken: {
      configured: hasEnv("RANDY_SITE_TOKEN") || hasEnv("CHAT_SITE_TOKEN"),
    },
    twilio: {
      configured: hasEnv("TWILIO_ACCOUNT_SID") && hasEnv("TWILIO_AUTH_TOKEN") && hasEnv("TWILIO_FROM_NUMBER"),
    },
    bookingUrl: {
      configured: hasEnv("NEXT_PUBLIC_BOOKING_URL") || hasEnv("BOOKING_URL"),
      value: process.env.NEXT_PUBLIC_BOOKING_URL || process.env.BOOKING_URL || null,
    },
  };

  try {
    if (checks.supabase.urlConfigured && checks.supabase.serviceKeyConfigured) {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase.from("pricing").select("*").limit(1);
      checks.supabase.connection = error ? `failed: ${error.message}` : "ok";
    }
  } catch (err) {
    checks.supabase.connection = `failed: ${err.message}`;
  }

  const ok =
    checks.openai.configured &&
    checks.supabase.urlConfigured &&
    checks.supabase.serviceKeyConfigured &&
    checks.supabase.connection === "ok";

  return res.status(ok ? 200 : 500).json({
    ok,
    checks,
    note: "This endpoint only reports whether required settings exist and whether Supabase pricing can be queried. It does not expose secrets.",
  });
}
