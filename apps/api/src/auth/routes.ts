import type { Hono } from "hono";
import type { Ports } from "../ports";
import { loginRequest, nameRequest } from "../schema";
import { hashSecret, normalizeKey } from "./keys";
import { allowAttempt, clearAttempts, clientKey } from "./ratelimit";
import { endSession, startSession } from "./session";

type Vars = { Variables: { userId: string } };

/** Public auth endpoints plus `/api/me`. Session-protected routes read the id from the middleware. */
export function registerAuthRoutes(app: Hono<Vars>, ports: Ports) {
  app.post("/api/auth/login", async (c) => {
    if (!ports.pepper) return c.json({ error: "auth not configured" }, 503);

    const d1 = clientKey(c.req.raw.headers);
    if (!allowAttempt(d1, ports.clock())) {
      return c.json({ error: "too many attempts, try again later" }, 429);
    }

    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    const parsed = loginRequest.safeParse(json);
    if (!parsed.success) return c.json({ error: "invalid request" }, 400);

    const keyHash = await hashSecret(ports.pepper, normalizeKey(parsed.data.key));
    const user = await ports.users.byKeyHash(keyHash);
    if (!user || user.disabled) return c.json({ error: "invalid key" }, 401);

    await startSession(ports, c, user.id);
    await ports.users.touch(user.id, ports.clock());
    await ports.sessions.purgeExpired(ports.clock());
    clearAttempts(d1);
    return c.json({ id: user.id, name: user.name });
  });

  app.post("/api/auth/logout", async (c) => {
    await endSession(ports, c);
    return c.json({ ok: true });
  });

  app.get("/api/me", async (c) => {
    const user = await ports.users.byId(c.get("userId"));
    if (!user) return c.json({ error: "unauthorized" }, 401);
    return c.json({ id: user.id, name: user.name });
  });

  app.patch("/api/me", async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    const parsed = nameRequest.safeParse(json);
    if (!parsed.success) return c.json({ error: "invalid request" }, 400);
    await ports.users.setName(c.get("userId"), parsed.data.name.trim());
    return c.json({ id: c.get("userId"), name: parsed.data.name.trim() });
  });
}
