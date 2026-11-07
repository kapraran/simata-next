import { healthStatus } from "@simata/core";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { registerAdminRoutes } from "./auth/admin";
import { registerAuthRoutes } from "./auth/routes";
import { currentUserId } from "./auth/session";
import type { Ports } from "./ports";
import { syncRequest } from "./schema";

export type { Ports } from "./ports";

const PAGE = 500;
const DAY = 86_400_000;
/** Raw bytes as a response (Hono's c.body overloads don't take Uint8Array). */
function bytes(body: Uint8Array, headers: Record<string, string>) {
  return new Response(body as BodyInit, { status: 200, headers });
}

const IMMUTABLE = "public, max-age=31536000, immutable";

/** Public routes: no session, no admin token. Everything else under /api needs one or the other. */
function isPublic(path: string): boolean {
  return path === "/api/health" || path.startsWith("/api/auth/") || path.startsWith("/api/admin/");
}

// The app only knows ports. Each entrypoint (node.ts, worker.ts) wires concrete adapters.
export function createApp(ports: Ports) {
  const app = new Hono<{ Variables: { userId: string } }>();

  app.get("/api/health", (c) => c.json(healthStatus("api", ports.clock())));

  // Session gate for the data routes. Public auth and the token-guarded admin API are exempt.
  app.use("/api/*", async (c, next) => {
    if (isPublic(c.req.path)) return next();
    const userId = await currentUserId(ports, c);
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    c.set("userId", userId);
    await next();
  });

  registerAuthRoutes(app, ports);
  registerAdminRoutes(app, ports);

  /** Current bank. Cheap to poll: answers 304 when the client already has this version. */
  app.get("/api/bank", async (c) => {
    const pointer = await ports.blobs.get("bank.json");
    if (!pointer) return c.json({ error: "no bank seeded" }, 404);
    const { current, version } = JSON.parse(new TextDecoder().decode(pointer.body)) as {
      current: string;
      version: string;
    };
    const etag = `"${version}"`;
    if (c.req.header("if-none-match") === etag) {
      return c.body(null, 304, { ETag: etag, "Cache-Control": "no-cache" });
    }
    const bank = await ports.blobs.get(current);
    if (!bank) return c.json({ error: "bank file missing" }, 404);
    return bytes(bank.body, {
      "Content-Type": "application/json",
      ETag: etag,
      "Cache-Control": "no-cache",
    });
  });

  app.get("/api/bank/:version", async (c) => {
    const version = c.req.param("version");
    if (!/^[0-9a-f]{12}$/.test(version)) return c.json({ error: "bad version" }, 400);
    const bank = await ports.blobs.get(`bank.${version}.json`);
    if (!bank) return c.json({ error: "not found" }, 404);
    return bytes(bank.body, {
      "Content-Type": "application/json",
      "Cache-Control": IMMUTABLE,
    });
  });

  app.get("/api/media/:name", async (c) => {
    const name = c.req.param("name");
    if (!/^[0-9a-f]{64}\.jpg$/.test(name)) return c.json({ error: "bad name" }, 400);
    const img = await ports.blobs.get(`media/${name}`);
    if (!img) return c.json({ error: "not found" }, 404);
    return bytes(img.body, {
      "Content-Type": img.contentType,
      "Cache-Control": IMMUTABLE,
    });
  });

  /**
   * One round trip: push what this device has, pull what it hasn't seen.
   * Idempotent: replaying the same request changes nothing.
   */
  app.post("/api/sync", bodyLimit({ maxSize: 2 * 1024 * 1024 }), async (c) => {
    let json: unknown;
    try {
      json = await c.req.json();
    } catch {
      return c.json({ error: "invalid json" }, 400);
    }
    const parsed = syncRequest.safeParse(json);
    if (!parsed.success) {
      return c.json({ error: "invalid request", issues: parsed.error.issues.slice(0, 5) }, 400);
    }
    const { cursor, kvRev, events, kv } = parsed.data;
    const now = ports.clock();
    if (events.some((e) => e.at > now + DAY) || kv.some((e) => e.updatedAt > now + DAY)) {
      return c.json({ error: "timestamp in the future" }, 400);
    }

    const userId = c.get("userId");
    const accepted = await ports.events.append(userId, events);
    await ports.kv.put(userId, kv);

    const page = await ports.events.since(userId, cursor, PAGE + 1);
    const hasMore = page.length > PAGE;
    const out = hasMore ? page.slice(0, PAGE) : page;
    const kvOut = await ports.kv.since(userId, kvRev);

    return c.json({
      accepted,
      cursor: out.length ? (out[out.length - 1]?.seq ?? cursor) : cursor,
      hasMore,
      events: out,
      kvRev: kvOut.length ? Math.max(...kvOut.map((e) => e.rev)) : kvRev,
      kv: kvOut,
    });
  });

  return app;
}
