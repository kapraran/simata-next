import type { Identity } from "../ports";

/** Local/Docker: one fixed user, no login. Never expose this beyond your own machine or LAN. */
export function localIdentity(userId = "local"): Identity {
  return { resolve: async () => userId };
}

// The Cloudflare Access identity (verifying the Cf-Access-Jwt-Assertion JWT) arrives with the deploy in M8.
