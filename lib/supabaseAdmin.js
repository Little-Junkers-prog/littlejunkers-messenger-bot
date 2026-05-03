// lib/supabaseAdmin.js
import { createClient } from "@supabase/supabase-js";

let cachedClient = null;

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function getSupabaseServiceRoleKey() {
  const value =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY;

  if (!value) {
    throw new Error(
      "Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return value;
}

export function getSupabaseAdmin() {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseServiceRoleKey = getSupabaseServiceRoleKey();

  cachedClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "little-junkers-booking-admin",
      },
    },
  });

  return cachedClient;
}

export function assertServerOnly() {
  if (typeof window !== "undefined") {
    throw new Error("supabaseAdmin.js must only be used on the server.");
  }
}
