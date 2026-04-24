import { NextResponse } from "next/server";

const RATE_LIMITS = {
  "/api/submit-lead": { limit: 8, windowMs: 60 * 60 * 1000 },
  "/api/create-checkout": { limit: 12, windowMs: 60 * 60 * 1000 },
  "/api/checkout-session": { limit: 30, windowMs: 15 * 60 * 1000 },
  "/api/availability": { limit: 60, windowMs: 15 * 60 * 1000 },
  "/api/availability-v2": { limit: 60, windowMs: 15 * 60 * 1000 },
};

const buckets = globalThis.__ljRateLimitBuckets || new Map();
globalThis.__ljRateLimitBuckets = buckets;

function getClientIp(req) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.ip || "unknown";
}

function getBucketKey(req) {
  return `${req.nextUrl.pathname}:${getClientIp(req)}`;
}

function pruneExpired(now) {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) buckets.delete(key);
  }
}

function applyRateLimit(req) {
  const pathname = req.nextUrl.pathname;
  const rule = RATE_LIMITS[pathname];
  if (!rule) return null;

  const now = Date.now();
  pruneExpired(now);

  const key = getBucketKey(req);
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + rule.windowMs };
    buckets.set(key, next);
    return {
      allowed: true,
      remaining: Math.max(rule.limit - next.count, 0),
      resetAt: next.resetAt,
      limit: rule.limit,
    };
  }

  current.count += 1;
  buckets.set(key, current);

  return {
    allowed: current.count <= rule.limit,
    remaining: Math.max(rule.limit - current.count, 0),
    resetAt: current.resetAt,
    limit: rule.limit,
  };
}

export function middleware(req) {
  const pathname = req.nextUrl.pathname;

  if (pathname === "/") {
    const url = req.nextUrl.clone();
    url.pathname = "/rent-a-dumpster";
    return NextResponse.redirect(url, 307);
  }

  if (pathname === "/csr-quick-book") {
    const url = req.nextUrl.clone();
    url.pathname = "/csr-quick-book-compact-v2";
    return NextResponse.redirect(url, 307);
  }

  if (req.method === "OPTIONS") {
    return NextResponse.next();
  }

  if (req.method === "POST" || req.method === "GET") {
    const result = applyRateLimit(req);
    if (result && !result.allowed) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((result.resetAt - Date.now()) / 1000)
      );

      return new NextResponse(
        JSON.stringify({
          error: "Too many requests. Please try again shortly.",
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfterSeconds),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const response = NextResponse.next();
    if (result) {
      response.headers.set("X-RateLimit-Limit", String(result.limit));
      response.headers.set(
        "X-RateLimit-Remaining",
        String(result.remaining)
      );
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/csr-quick-book",
    "/api/submit-lead",
    "/api/create-checkout",
    "/api/checkout-session",
    "/api/availability",
    "/api/availability-v2",
  ],
};
