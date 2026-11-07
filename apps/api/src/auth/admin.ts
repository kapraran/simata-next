import type { Hono } from "hono";
import type { Ports } from "../ports";
import { createUserRequest } from "../schema";
import { hashSecret, newLoginKey, normalizeKey, timingSafeEqual } from "./keys";

type Vars = { Variables: { userId: string } };

/**
 * Admin endpoints, guarded by `Authorization: Bearer <ADMIN_TOKEN>`. There is no admin UI: the CLI
 * in `tools/admin` is the client. The admin token is compared in constant time and the whole admin
 * surface is disabled (503) when no token is configured.
 */
export function registerAdminRoutes(app: Hono<Vars>, ports: Ports) {
  app.use("/api/admin/*", async (c, next) => {
    if (!ports.pepper) return c.json({ error: "auth not configured" }, 503);
    if (!ports.adminToken) return c.json({ error: "admin disabled" }, 503);
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token || !timingSafeEqual(token, ports.adminToken)) {
      return c.json({ error: "forbidden" }, 401);
    }
    await next();
  });

  app.get("/api/admin/users", async (c) => c.json({ users: await ports.users.list() }));

  app.post("/api/admin/users", async (c) => {
    let json: unknown = {};
    try {
      json = await c.req.json();
    } catch {
      // An empty body means "no name".
    }
    const parsed = createUserRequest.safeParse(json ?? {});
    if (!parsed.success) return c.json({ error: "invalid request" }, 400);

    const key = newLoginKey();
    const id = crypto.randomUUID();
    const now = ports.clock();
    await ports.users.insert({
      id,
      keyHash: await hashSecret(ports.pepper, normalizeKey(key)),
      name: parsed.data.name.trim(),
      createdAt: now,
    });
    // The key is returned exactly once; only its hash is stored.
    return c.json({ id, key, name: parsed.data.name.trim(), createdAt: now }, 201);
  });

  app.post("/api/admin/users/:id/rotate", async (c) => {
    const id = c.req.param("id");
    const user = await ports.users.byId(id);
    if (!user) return c.json({ error: "not found" }, 404);
    const key = newLoginKey();
    await ports.users.setKeyHash(id, await hashSecret(ports.pepper, normalizeKey(key)));
    await ports.sessions.removeByUser(id); // every existing session is now invalid
    return c.json({ id, key });
  });

  app.post("/api/admin/users/:id/disable", async (c) => {
    const id = c.req.param("id");
    if (!(await ports.users.byId(id))) return c.json({ error: "not found" }, 404);
    await ports.users.setDisabled(id, true);
    await ports.sessions.removeByUser(id);
    return c.json({ id, disabled: true });
  });

  app.post("/api/admin/users/:id/enable", async (c) => {
    const id = c.req.param("id");
    if (!(await ports.users.byId(id))) return c.json({ error: "not found" }, 404);
    await ports.users.setDisabled(id, false);
    return c.json({ id, disabled: false });
  });

  app.delete("/api/admin/users/:id", async (c) => {
    const id = c.req.param("id");
    if (!(await ports.users.byId(id))) return c.json({ error: "not found" }, 404);
    await ports.users.remove(id);
    return c.json({ id, deleted: true });
  });
}
