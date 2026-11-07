/**
 * A tiny fixed-window limiter for the login route. In Workers this is per-isolate, so it is a speed
 * bump rather than a guarantee — Cloudflare's edge rate limiting is the real ceiling. In the Docker
 * (Node) build it is a normal in-process limiter.
 */

const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 20;
const MAX_KEYS = 10_000;

const hits = new Map<string, { count: number; resetAt: number }>();

/** True when another login attempt from `key` is allowed right now. */
export function allowAttempt(key: string, now = Date.now()): boolean {
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    if (hits.size >= MAX_KEYS) hits.clear();
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

/** Forget the attempts for a key, e.g. after a successful login. */
export function clearAttempts(key: string) {
  hits.delete(key);
}

/** Best-effort caller key: the Cloudflare client IP, else the first forwarded hop, else a constant. */
export function clientKey(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}
