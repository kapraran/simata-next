import type { Identity } from "../ports";

/** Local/Docker: one fixed user, no login. Never expose this beyond your own machine or LAN. */
export function localIdentity(userId = "local"): Identity {
  return { resolve: async () => userId };
}

/**
 * Cloudflare deploy with auth turned off: one shared user for everyone who can reach the
 * hostname. Keep the deployment unlisted, and switch to `accessIdentity` (IDENTITY=access)
 * before making the URL public.
 */
export function openIdentity(userId = "me"): Identity {
  return { resolve: async () => userId };
}

export type AccessEnv = {
  TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  IDENTITY?: string;
};

/**
 * Cloudflare Access identity: the Access proxy authenticates the visitor and forwards a signed
 * `Cf-Access-Jwt-Assertion`. We verify it here so a direct hit that bypasses Access is rejected.
 * Implemented and ready; enable with IDENTITY=access + TEAM_DOMAIN/ACCESS_AUD.
 */
export function accessIdentity(env: AccessEnv): Identity {
  return {
    async resolve(req) {
      const jwt = req.headers.get("cf-access-jwt-assertion");
      if (!jwt || !env.TEAM_DOMAIN || !env.ACCESS_AUD) return null;
      const claims = await verifyAccessJwt(jwt, env.TEAM_DOMAIN, env.ACCESS_AUD);
      if (!claims?.email) return null;
      return userIdFromEmail(claims.email);
    },
  };
}

/** Pick the identity implementation from config. Defaults to the no-auth one. */
export function identityFromEnv(env: AccessEnv): Identity {
  return env.IDENTITY === "access" ? accessIdentity(env) : openIdentity();
}

type AccessClaims = {
  email?: string;
  sub?: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
};

const text = new TextEncoder();

/** base64url -> bytes (atob ignores padding, so this works for both padded and unpadded). */
function b64url(input: string): Uint8Array<ArrayBuffer> {
  const binary = atob(input.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type Jwk = JsonWebKey & { kid?: string };
type JwksCache = { url: string; at: number; keys: Map<string, CryptoKey> };
let jwksCache: JwksCache | null = null;
const JWKS_TTL = 60 * 60 * 1000;

async function signingKey(teamDomain: string, kid: string | undefined): Promise<CryptoKey | null> {
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  if (!jwksCache || jwksCache.url !== url || Date.now() - jwksCache.at > JWKS_TTL) {
    const res = await fetch(url);
    if (!res.ok) return null;
    const { keys } = (await res.json()) as { keys: Jwk[] };
    const imported = new Map<string, CryptoKey>();
    for (const jwk of keys) {
      if (!jwk.kid) continue;
      const key = await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["verify"],
      );
      imported.set(jwk.kid, key);
    }
    jwksCache = { url, at: Date.now(), keys: imported };
  }
  // A token without a kid can only use the sole key.
  if (!kid && jwksCache.keys.size === 1) return [...jwksCache.keys.values()][0] ?? null;
  return kid ? (jwksCache.keys.get(kid) ?? null) : null;
}

async function verifyAccessJwt(
  jwt: string,
  teamDomain: string,
  aud: string,
): Promise<AccessClaims | null> {
  const [headerPart, payloadPart, signaturePart] = jwt.split(".");
  if (!headerPart || !payloadPart || !signaturePart) return null;

  let header: { kid?: string; alg?: string };
  let claims: AccessClaims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64url(headerPart))) as typeof header;
    claims = JSON.parse(new TextDecoder().decode(b64url(payloadPart))) as AccessClaims;
  } catch {
    return null;
  }

  if (header.alg !== "RS256") return null;
  if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
  if (claims.iss && claims.iss !== `https://${teamDomain}`) return null;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(aud)) return null;

  const key = await signingKey(teamDomain, header.kid);
  if (!key) return null;

  const ok = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    b64url(signaturePart),
    text.encode(`${headerPart}.${payloadPart}`),
  );
  return ok ? claims : null;
}

/** Stable per-person id so the same email gets the same data on every device. */
async function userIdFromEmail(email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", text.encode(email.trim().toLowerCase()));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
