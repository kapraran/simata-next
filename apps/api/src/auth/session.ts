import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Ports } from "../ports";
import { hashSecret, newSessionToken } from "./keys";

export const COOKIE = "simata_session";
/** Sessions last 90 days and slide forward as long as the app is used. */
export const SESSION_TTL_MS = 90 * 86_400_000;
/** A session is only rewritten when it has not been seen for a day, to keep sync reads write-free. */
const TOUCH_AFTER_MS = 86_400_000;

function secureRequest(c: Context): boolean {
  // Cloudflare terminates TLS in front of the Worker, so trust the URL the app actually served.
  try {
    return new URL(c.req.url).protocol === "https:";
  } catch {
    return false;
  }
}

/** Issue a fresh session for `userId` and set the cookie. The raw token never leaves this file. */
export async function startSession(ports: Ports, c: Context, userId: string): Promise<void> {
  const token = newSessionToken();
  const tokenHash = await hashSecret(ports.pepper, token);
  const now = ports.clock();
  await ports.sessions.insert({
    tokenHash,
    userId,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
    lastSeenAt: now,
  });
  setCookie(c, COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: secureRequest(c),
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

/**
 * Resolve the caller's user id from the session cookie, or null when there is no valid session.
 * Expired sessions are removed; nearly-expired ones slide forward.
 */
export async function currentUserId(ports: Ports, c: Context): Promise<string | null> {
  if (!ports.pepper) return null;
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const tokenHash = await hashSecret(ports.pepper, token);
  const session = await ports.sessions.get(tokenHash);
  if (!session) return null;

  const now = ports.clock();
  if (session.expiresAt <= now) {
    await ports.sessions.removeByToken(tokenHash);
    return null;
  }

  const user = await ports.users.byId(session.userId);
  if (!user || user.disabled) {
    await ports.sessions.removeByToken(tokenHash);
    return null;
  }

  if (now - session.lastSeenAt >= TOUCH_AFTER_MS) {
    await ports.sessions.touch(tokenHash, now, now + SESSION_TTL_MS);
    await ports.users.touch(user.id, now);
  }
  return user.id;
}

/** Clear the session cookie and drop the session row. */
export async function endSession(ports: Ports, c: Context): Promise<void> {
  const token = getCookie(c, COOKIE);
  if (token && ports.pepper) {
    await ports.sessions.removeByToken(await hashSecret(ports.pepper, token));
  }
  deleteCookie(c, COOKIE, { path: "/", secure: secureRequest(c), sameSite: "Lax" });
}
