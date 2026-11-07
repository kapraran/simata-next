/**
 * Credential primitives, shared by Cloudflare Workers and Node.
 *
 * WebCrypto is used throughout (no `node:crypto`), so the same code runs in both runtimes.
 * Login keys and session tokens are never stored: only their HMAC-SHA256 digest under a server
 * pepper. That way a database leak does not expose anyone's key, and the pepper acts as a second
 * factor at rest.
 */

const encoder = new TextEncoder();

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 16 random bytes formatted as a UUID v4 (122 bits of entropy). */
export function newLoginKey(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  return formatUuid(b);
}

/** 32 random bytes as base64url, for the login cookie value. */
export function newSessionToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

function formatUuid(b: Uint8Array): string {
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Keys are case- and separator-insensitive: only their 32 hex digits matter. */
export function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^0-9a-f]/g, "");
}

const hmacKeys = new Map<string, Promise<CryptoKey>>();

function hmacKey(pepper: string): Promise<CryptoKey> {
  let key = hmacKeys.get(pepper);
  if (!key) {
    key = crypto.subtle.importKey(
      "raw",
      encoder.encode(pepper),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    hmacKeys.set(pepper, key);
  }
  return key;
}

/** HMAC-SHA256(pepper, value) as hex. The one-way step for both login keys and session tokens. */
export async function hashSecret(pepper: string, value: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(pepper), encoder.encode(value));
  return toHex(new Uint8Array(sig));
}

/** Length-safe, constant-time string compare, for the admin bearer token. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
