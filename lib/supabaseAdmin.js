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

export function getSupabaseAdmin() {
  if (cachedClient) {
    return cachedClient;
  }

  const supabaseUrl = getRequiredEnv("SUPABASE_URL");
  const supabaseSecretKey = getRequiredEnv("SUPABASE_SECRET_KEY");

  cachedClient = createClient(supabaseUrl, supabaseSecretKey, {
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
