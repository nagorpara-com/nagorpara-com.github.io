/**
 * Small HTTP helpers shared by the public subscriber functions
 * (SERVER-SIDE ONLY): JSON responses, CORS for the public site,
 * and a best-effort per-IP rate limit.
 *
 * The per-IP limit is deliberately simple (in-memory, per
 * function instance): it blunts casual abuse. The durable
 * protections are the per-address throttles stored in the
 * database (migration 0014) and the mail provider's daily cap.
 */

export function corsHeaders(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const origin = env.PUBLIC_SITE_URL ? new URL(env.PUBLIC_SITE_URL).origin : "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    Vary: "Origin",
  };
}

export function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export async function readJsonBody(
  req: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await req.json();
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Sliding-window limiter: at most `max` requests per `windowMs`
// per key (IP). Entries are pruned on each call; the map is
// bounded by clearing it if it ever grows absurdly large.
const hits = new Map<string, number[]>();

export function ipRateLimited(
  req: Request,
  scope: string,
  max = 10,
  windowMs = 10 * 60 * 1000,
  now: number = Date.now(),
): boolean {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `${scope}:${ip}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10000) hits.clear();
  return recent.length > max;
}
