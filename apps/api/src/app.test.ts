import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { hashSecret, newLoginKey, normalizeKey } from "./auth/keys";
import { sqliteStores } from "./contract/harness";
import { ev } from "./contract/stores.contract";
import type { Blob, BlobStore, Ports } from "./ports";

const NOW = 1_800_000_000_000;
const SHA = "a".repeat(64);
const PEPPER = "test-pepper";
const ADMIN = "test-admin-token";

class MemBlobs implements BlobStore {
  map = new Map<string, Blob>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async put(key: string, blob: Blob) {
    this.map.set(key, blob);
  }
}

const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

function setup(opts: { pepper?: string; adminToken?: string } = {}) {
  const blobs = new MemBlobs();
  const { events, kv, users, sessions } = sqliteStores();
  const ports: Ports = {
    clock: () => NOW,
    events,
    kv,
    blobs,
    users,
    sessions,
    pepper: opts.pepper ?? PEPPER,
    adminToken: opts.adminToken ?? ADMIN,
  };
  return { app: createApp(ports), blobs, ports };
}

type App = ReturnType<typeof setup>["app"];

const adminReq = (app: App, method: string, path: string, body?: unknown, token = ADMIN) =>
  app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/** Create a user through the admin API and return its one-time key. */
async function createUser(app: App, name = "") {
  const res = await adminReq(app, "POST", "/api/admin/users", { name });
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; key: string; name: string };
}

function cookieFrom(res: Response): string {
  const raw = res.headers.get("set-cookie") ?? "";
  const pair = raw.split(";")[0] ?? "";
  expect(pair).toContain("simata_session=");
  return pair;
}

async function login(app: App, key: string, ip = `ip-${ipCounter++}`) {
  const res = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify({ key }),
  });
  return res;
}
let ipCounter = 0;

const withCookie = (cookie: string, init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: { ...(init.headers ?? {}), cookie },
});

const post = (app: App, cookie: string, body: unknown) =>
  app.request(
    "/api/sync",
    withCookie(cookie, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("health and access control", () => {
  it("health is open", async () => {
    const res = await setup().app.request("/api/health");
    expect(await res.json()).toEqual({ ok: true, service: "api", time: NOW });
  });

  it("data routes need a session", async () => {
    const { app } = setup();
    for (const path of [
      "/api/bank",
      `/api/media/${SHA}.jpg`,
      "/api/bank/abcdef012345",
      "/api/me",
    ]) {
      expect((await app.request(path)).status).toBe(401);
    }
    expect((await app.request("/api/sync", { method: "POST", body: "{}" })).status).toBe(401);
  });

  it("admin routes need the bearer token", async () => {
    const { app } = setup();
    expect((await adminReq(app, "GET", "/api/admin/users", undefined, "wrong")).status).toBe(401);
    expect((await app.request("/api/admin/users")).status).toBe(401);
  });

  it("the admin API is disabled without a token", async () => {
    const { app } = setup({ adminToken: "" });
    expect((await app.request("/api/admin/users")).status).toBe(503);
  });

  it("auth endpoints report when no pepper is configured", async () => {
    const { app } = setup({ pepper: "" });
    expect((await login(app, "x".repeat(32))).status).toBe(503);
    expect((await app.request("/api/me")).status).toBe(401);
  });
});

describe("login", () => {
  it("a fresh key logs in and sets an httpOnly cookie", async () => {
    const { app } = setup();
    const { key } = await createUser(app, "Maria");
    const res = await login(app, key);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: expect.any(String), name: "Maria" });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("simata_session=");
    expect(cookie.toLowerCase()).toContain("httponly");

    const me = await app.request("/api/me", withCookie(cookieFrom(res)));
    expect(await me.json()).toMatchObject({ name: "Maria" });
  });

  it("accepts the key with or without its hyphens and any case", async () => {
    const { app } = setup();
    const { key } = await createUser(app);
    expect((await login(app, key.toUpperCase().replace(/-/g, ""))).status).toBe(200);
  });

  it("rejects a wrong key and a disabled account", async () => {
    const { app } = setup();
    const u = await createUser(app);
    expect((await login(app, newLoginKey())).status).toBe(401);
    await adminReq(app, "POST", `/api/admin/users/${u.id}/disable`);
    expect((await login(app, u.key)).status).toBe(401);
  });

  it("rate-limits repeated failures", async () => {
    const { app } = setup();
    let last = 0;
    for (let i = 0; i < 25; i++) last = (await login(app, newLoginKey(), "ratelimit-ip")).status;
    expect(last).toBe(429);
  });

  it("logging out invalidates the session", async () => {
    const { app } = setup();
    const { key } = await createUser(app);
    const cookie = cookieFrom(await login(app, key));
    expect((await app.request("/api/me", withCookie(cookie))).status).toBe(200);
    await app.request("/api/auth/logout", withCookie(cookie, { method: "POST" }));
    expect((await app.request("/api/me", withCookie(cookie))).status).toBe(401);
  });
});

describe("admin user management", () => {
  it("creates, lists, rotates, disables and deletes", async () => {
    const { app } = setup();
    const u = await createUser(app, "Nikos");
    expect(u.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    const list = (await (await adminReq(app, "GET", "/api/admin/users")).json()) as {
      users: { id: string; name: string }[];
    };
    expect(list.users).toEqual([expect.objectContaining({ id: u.id, name: "Nikos" })]);

    // Rotating kills old sessions and the old key.
    const cookie = cookieFrom(await login(app, u.key));
    const rotated = (await (
      await adminReq(app, "POST", `/api/admin/users/${u.id}/rotate`)
    ).json()) as { key: string };
    expect(rotated.key).not.toBe(u.key);
    expect((await login(app, u.key)).status).toBe(401);
    expect((await login(app, rotated.key)).status).toBe(200);
    expect((await app.request("/api/me", withCookie(cookie))).status).toBe(401);

    expect((await adminReq(app, "POST", `/api/admin/users/${u.id}/disable`)).status).toBe(200);
    expect((await login(app, rotated.key)).status).toBe(401);
    expect((await adminReq(app, "POST", `/api/admin/users/${u.id}/enable`)).status).toBe(200);
    expect((await login(app, rotated.key)).status).toBe(200);

    expect((await adminReq(app, "DELETE", `/api/admin/users/${u.id}`)).status).toBe(200);
    const after = (await (await adminReq(app, "GET", "/api/admin/users")).json()) as {
      users: { id: string }[];
    };
    expect(after.users).toEqual([]);
  });

  it("never stores or returns a raw key", async () => {
    const { app, ports } = setup();
    const u = await createUser(app);
    const expected = await hashSecret(PEPPER, normalizeKey(u.key));
    expect(await ports.users.byKeyHash(expected)).toMatchObject({ id: u.id });
    expect((await adminReq(app, "GET", "/api/admin/users")).status).toBe(200);
  });
});

describe("POST /api/sync", () => {
  it("accepts events, returns them back, and is idempotent", async () => {
    const { app } = setup();
    const cookie = cookieFrom(await login(app, (await createUser(app)).key));
    const events = [ev("a"), ev("b")];

    const first = await (await post(app, cookie, { events })).json();
    expect(first).toMatchObject({ accepted: 2, hasMore: false });
    expect(first.events.map((e: { id: string }) => e.id)).toEqual(["a", "b"]);

    const replay = await (await post(app, cookie, { events, cursor: first.cursor })).json();
    expect(replay).toMatchObject({ accepted: 0, events: [], cursor: first.cursor });
  });

  it("keeps two accounts apart", async () => {
    const { app } = setup();
    const a = cookieFrom(await login(app, (await createUser(app, "A")).key));
    const b = cookieFrom(await login(app, (await createUser(app, "B")).key));

    await post(app, a, { events: [ev("only-a")] });
    const bView = await (await post(app, b, {})).json();
    expect(bView.events).toEqual([]);

    const aView = await (await post(app, a, {})).json();
    expect(aView.events.map((e: { id: string }) => e.id)).toEqual(["only-a"]);
  });

  it("pages large histories with hasMore", async () => {
    const { app } = setup();
    const cookie = cookieFrom(await login(app, (await createUser(app)).key));
    const events = Array.from({ length: 700 }, (_, i) => ev(`e${String(i).padStart(4, "0")}`));
    const a = await (await post(app, cookie, { events })).json();
    expect(a.events).toHaveLength(500);
    expect(a.hasMore).toBe(true);
    const b = await (await post(app, cookie, { cursor: a.cursor })).json();
    expect(b.events).toHaveLength(200);
    expect(b.hasMore).toBe(false);
  });

  it("rejects bad input", async () => {
    const { app } = setup();
    const cookie = cookieFrom(await login(app, (await createUser(app)).key));
    const bad = async (body: unknown) => (await post(app, cookie, body)).status;
    expect(await bad({ events: [{ id: "x" }] })).toBe(400);
    expect(await bad({ events: [ev("a", { mode: "nope" as never })] })).toBe(400);
    expect(await bad({ events: [ev("a", { at: NOW + 3 * 86_400_000 })] })).toBe(400);
    expect(await bad({ cursor: -1 })).toBe(400);
  });
});

describe("/api/me", () => {
  it("updates the display name", async () => {
    const { app } = setup();
    const cookie = cookieFrom(await login(app, (await createUser(app)).key));
    const res = await app.request(
      "/api/me",
      withCookie(cookie, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "  Nikos  " }),
      }),
    );
    expect(await res.json()).toEqual({ id: expect.any(String), name: "Nikos" });
    expect(await (await app.request("/api/me", withCookie(cookie))).json()).toMatchObject({
      name: "Nikos",
    });
  });
});

describe("bank and media", () => {
  it("404s when nothing is seeded", async () => {
    const { app } = setup();
    const cookie = cookieFrom(await login(app, (await createUser(app)).key));
    expect((await app.request("/api/bank", withCookie(cookie))).status).toBe(404);
  });

  it("serves the current bank with an etag and answers 304 on a match", async () => {
    const { app, blobs } = setup();
    const cookie = cookieFrom(await login(app, (await createUser(app)).key));
    const bank = { version: "abcdef012345", categories: [], questions: [] };
    await blobs.put("bank.json", {
      body: json({ current: "bank.abcdef012345.json", version: "abcdef012345" }),
      contentType: "application/json",
    });
    await blobs.put("bank.abcdef012345.json", {
      body: json(bank),
      contentType: "application/json",
    });

    const res = await app.request("/api/bank", withCookie(cookie));
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"abcdef012345"');
    expect(await res.json()).toEqual(bank);

    const cached = await app.request(
      "/api/bank",
      withCookie(cookie, { headers: { "if-none-match": '"abcdef012345"' } }),
    );
    expect(cached.status).toBe(304);
  });

  it("serves media by content hash and nothing else", async () => {
    const { app, blobs } = setup();
    const cookie = cookieFrom(await login(app, (await createUser(app)).key));
    await blobs.put(`media/${SHA}.jpg`, {
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
    });
    const res = await app.request(`/api/media/${SHA}.jpg`, withCookie(cookie));
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
  });
});
