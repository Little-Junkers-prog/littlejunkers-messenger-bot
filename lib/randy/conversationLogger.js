import crypto from "crypto";
import { getSupabaseAdmin } from "../supabaseAdmin";

const COOKIE_NAME = "rc_sid";

function parseCookies(header = "") {
  return String(header)
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator < 0) return cookies;
      cookies[part.slice(0, separator)] = decodeURIComponent(part.slice(separator + 1));
      return cookies;
    }, {});
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

export function getRandyConversationId(req, res) {
  const existing = parseCookies(req.headers.cookie || "")[COOKIE_NAME];
  if (isUuid(existing)) return existing;

  const conversationId = crypto.randomUUID();
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=${conversationId}; HttpOnly; Secure; SameSite=None; Path=/`);
  return conversationId;
}

export function logRandyMessage({ conversationId, role, content, intent = null }) {
  if (!conversationId || !content || !["user", "assistant"].includes(role)) return;

  try {
    const supabase = getSupabaseAdmin();
    Promise.resolve(
      supabase.from("randy_conversation_messages").insert({
        conversation_id: conversationId,
        role,
        content: String(content),
        intent: intent || null,
      }),
    )
      .then(({ error }) => {
        if (error) console.warn("[randy] conversation log failed (non-blocking):", error.message);
      })
      .catch((err) => {
        console.warn("[randy] conversation log failed (non-blocking):", err.message);
      });
  } catch (err) {
    console.warn("[randy] conversation log failed (non-blocking):", err.message);
  }
}
