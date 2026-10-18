import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { sqliteStores } from "./contract/harness";
import { ev } from "./contract/stores.contract";
import type { Blob, BlobStore, Ports } from "./ports";

const NOW = 1_800_000_000_000;
const SHA = "a".repeat(64);

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

function setup(user: string | null = "me") {
  const blobs = new MemBlobs();
  const { events, kv } = sqliteStores();
  const ports: Ports = {
    clock: () => NOW,
    events,
    kv,
    blobs,
    identity: { resolve: async () => user },
  };
  return { app: createApp(ports), blobs };
}

const post = (app: ReturnType<typeof setup>["app"], body: unknown) =>
  app.request("/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("health and auth", () => {
  it("health is open", async () => {
    const res = await setup(null).app.request("/api/health");
    expect(await res.json()).toEqual({ ok: true, service: "api", time: NOW });
  });

  it("everything else needs an identity", async () => {
    const { app } = setup(null);
    for (const path of ["/api/bank", `/api/media/${SHA}.jpg`, "/api/bank/abcdef012345"]) {
      expect((await app.request(path)).status).toBe(401);
    }
    expect((await post(app, {})).status).toBe(401);
  });
});

describe("POST /api/sync", () => {
  it("accepts events, returns them back with a cursor, and is idempotent", async () => {
    const { app } = setup();
    const events = [ev("a"), ev("b")];

    const first = await (await post(app, { events })).json();
    expect(first).toMatchObject({ accepted: 2, hasMore: false });
    expect(first.events.map((e: { id: string }) => e.id)).toEqual(["a", "b"]);

    const replay = await (await post(app, { events, cursor: first.cursor })).json();
    expect(replay).toMatchObject({ accepted: 0, events: [], cursor: first.cursor });
  });

  it("two devices converge on the same log", async () => {
    const { app } = setup();
    const phone = await (await post(app, { events: [ev("p1", { deviceId: "phone" })] })).json();
    const pc = await (
      await post(app, { events: [ev("c1", { deviceId: "pc" })], cursor: 0 })
    ).json();
    expect(pc.events.map((e: { id: string }) => e.id)).toEqual(["p1", "c1"]);

    const phoneAgain = await (await post(app, { cursor: phone.cursor })).json();
    expect(phoneAgain.events.map((e: { id: string }) => e.id)).toEqual(["c1"]);
  });

  it("pages large histories with hasMore", async () => {
    const { app } = setup();
    const events = Array.from({ length: 700 }, (_, i) => ev(`e${String(i).padStart(4, "0")}`));
    const a = await (await post(app, { events })).json();
    expect(a.events).toHaveLength(500);
    expect(a.hasMore).toBe(true);
    const b = await (await post(app, { cursor: a.cursor })).json();
    expect(b.events).toHaveLength(200);
    expect(b.hasMore).toBe(false);
  });

  it("syncs key-value entries with last-write-wins", async () => {
    const { app } = setup();
    const a = await (
      await post(app, { kv: [{ key: "flag:Q1", value: "hard", updatedAt: NOW - 10 }] })
    ).json();
    expect(a.kv).toMatchObject([{ key: "flag:Q1", value: "hard" }]);

    const stale = await (
      await post(app, {
        kvRev: a.kvRev,
        kv: [{ key: "flag:Q1", value: "easy", updatedAt: NOW - 20 }],
      })
    ).json();
    expect(stale.kv).toEqual([]);

    const newer = await (
      await post(app, {
        kvRev: a.kvRev,
        kv: [{ key: "flag:Q1", value: "easy", updatedAt: NOW - 5 }],
      })
    ).json();
    expect(newer.kv).toMatchObject([{ key: "flag:Q1", value: "easy" }]);
  });

  it("rejects bad input", async () => {
    const { app } = setup();
    const bad = async (body: unknown) => (await post(app, body)).status;
    expect(await bad({ events: [{ id: "x" }] })).toBe(400);
    expect(await bad({ events: [ev("a", { mode: "nope" as never })] })).toBe(400);
    expect(await bad({ events: [ev("a", { durationMs: -1 })] })).toBe(400);
    expect(await bad({ events: [ev("a", { at: NOW + 3 * 86_400_000 })] })).toBe(400);
    expect(await bad({ events: Array.from({ length: 1001 }, (_, i) => ev(`e${i}`)) })).toBe(400);
    expect(await bad({ cursor: -1 })).toBe(400);

    const notJson = await app.request("/api/sync", { method: "POST", body: "{{" });
    expect(notJson.status).toBe(400);
  });

  it("rejects oversized bodies", async () => {
    const { app } = setup();
    const big = await app.request("/api/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kv: [{ key: "k", value: "x".repeat(3 * 1024 * 1024), updatedAt: 1 }],
      }),
    });
    expect(big.status).toBe(413);
  });
});

describe("bank and media", () => {
  it("404s when nothing is seeded", async () => {
    const { app } = setup();
    expect((await app.request("/api/bank")).status).toBe(404);
  });

  it("serves the current bank with an etag and answers 304 on a match", async () => {
    const { app, blobs } = setup();
    const bank = { version: "abcdef012345", categories: [], questions: [] };
    await blobs.put("bank.json", {
      body: json({ current: "bank.abcdef012345.json", version: "abcdef012345" }),
      contentType: "application/json",
    });
    await blobs.put("bank.abcdef012345.json", {
      body: json(bank),
      contentType: "application/json",
    });

    const res = await app.request("/api/bank");
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toBe('"abcdef012345"');
    expect(await res.json()).toEqual(bank);

    const cached = await app.request("/api/bank", {
      headers: { "if-none-match": '"abcdef012345"' },
    });
    expect(cached.status).toBe(304);
  });

  it("serves a pinned bank version as immutable", async () => {
    const { app, blobs } = setup();
    await blobs.put("bank.abcdef012345.json", {
      body: json({ ok: 1 }),
      contentType: "application/json",
    });
    const res = await app.request("/api/bank/abcdef012345");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect((await app.request("/api/bank/nothex")).status).toBe(400);
    expect((await app.request("/api/bank/000000000000")).status).toBe(404);
  });

  it("serves media by content hash and nothing else", async () => {
    const { app, blobs } = setup();
    await blobs.put(`media/${SHA}.jpg`, {
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
    });
    const res = await app.request(`/api/media/${SHA}.jpg`);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);

    expect((await app.request(`/api/media/${"b".repeat(64)}.jpg`)).status).toBe(404);
    expect((await app.request("/api/media/..%2F..%2Fetc%2Fpasswd")).status).toBe(400);
    expect((await app.request("/api/media/foo.jpg")).status).toBe(400);
  });
});
