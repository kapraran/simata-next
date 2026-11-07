import "fake-indexeddb/auto";
import type { AnswerEvent } from "@simata/core";
import { beforeEach, describe, expect, it } from "vitest";
import { cachedBank, refreshBank } from "./bank";
import { getMeta, SimataDb } from "./db";
import { parseSettings } from "./settings";
import { syncNow, syncStore } from "./sync";
import { recordAnswer, setFlag } from "./writes";

/**
 * A small model of the server's /api/sync contract (see apps/api/src/app.ts):
 * events are deduped by id and numbered, kv is last-write-wins with a revision.
 */
function fakeServer(opts: { pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 500;
  const events: (AnswerEvent & { seq: number })[] = [];
  const kv = new Map<string, { key: string; value: string; updatedAt: number; rev: number }>();
  let rev = 0;
  const calls: unknown[] = [];
  let down = false;

  const fetchImpl = (async (_url: string, init: RequestInit) => {
    if (down) throw new TypeError("offline");
    const body = JSON.parse(init.body as string);
    calls.push(body);
    for (const e of body.events as AnswerEvent[]) {
      if (!events.some((x) => x.id === e.id)) events.push({ ...e, seq: events.length + 1 });
    }
    for (const e of body.kv as { key: string; value: string; updatedAt: number }[]) {
      const cur = kv.get(e.key);
      if (!cur || e.updatedAt > cur.updatedAt) kv.set(e.key, { ...e, rev: ++rev });
    }
    const page = events.filter((e) => e.seq > body.cursor).slice(0, pageSize + 1);
    const out = page.slice(0, pageSize);
    return Response.json({
      accepted: 0,
      cursor: out.length ? out[out.length - 1]?.seq : body.cursor,
      hasMore: page.length > pageSize,
      events: out,
      kvRev: rev,
      kv: [...kv.values()].filter((x) => x.rev > body.kvRev),
    });
  }) as unknown as typeof fetch;

  return {
    fetchImpl,
    events,
    kv,
    calls,
    setDown: (v: boolean) => {
      down = v;
    },
  };
}

let n = 0;
const fresh = () => new SimataDb(`test-${n++}`);
const answer = (d: SimataDb, q = "Q1", correct = true) =>
  recordAnswer(d, { questionId: q, correct, durationMs: 4000, guessed: false, mode: "train" });

describe("syncNow", () => {
  let server: ReturnType<typeof fakeServer>;
  beforeEach(() => {
    server = fakeServer();
  });

  it("pushes pending events once and marks them synced", async () => {
    const d = fresh();
    await answer(d, "Q1");
    await answer(d, "Q2");
    expect(await d.events.where("pending").equals(1).count()).toBe(2);

    const r = await syncNow(d, server.fetchImpl);
    expect(r).toMatchObject({ ok: true, pushed: 2 });
    expect(server.events).toHaveLength(2);
    expect(await d.events.where("pending").equals(1).count()).toBe(0);
    expect(await d.events.count()).toBe(2); // echoed copies did not duplicate

    await syncNow(d, server.fetchImpl);
    expect((server.calls.at(-1) as { events: unknown[] }).events).toHaveLength(0);
  });

  it("two devices converge on the same events", async () => {
    const phone = fresh();
    const pc = fresh();
    await answer(phone, "Q1");
    await syncNow(phone, server.fetchImpl);
    await answer(pc, "Q2");
    await syncNow(pc, server.fetchImpl);
    await syncNow(phone, server.fetchImpl);

    const ids = async (d: SimataDb) => (await d.events.toArray()).map((e) => e.questionId).sort();
    expect(await ids(phone)).toEqual(["Q1", "Q2"]);
    expect(await ids(pc)).toEqual(["Q1", "Q2"]);
  });

  it("keeps working data when the network is down and catches up later", async () => {
    const d = fresh();
    server.setDown(true);
    await answer(d, "Q1");
    const r = await syncNow(d, server.fetchImpl);
    expect(r.ok).toBe(false);
    expect(await d.events.where("pending").equals(1).count()).toBe(1);

    server.setDown(false);
    expect(await syncNow(d, server.fetchImpl)).toMatchObject({ ok: true, pushed: 1 });
    expect(server.events).toHaveLength(1);
  });

  it("pulls multiple pages", async () => {
    const small = fakeServer({ pageSize: 3 });
    const a = fresh();
    for (let i = 0; i < 7; i++) await answer(a, `Q${i}`);
    await syncNow(a, small.fetchImpl);

    const b = fresh();
    const r = await syncNow(b, small.fetchImpl);
    expect(r).toMatchObject({ ok: true, pulled: 7 });
    expect(await b.events.count()).toBe(7);
  });

  it("shares concurrent calls", async () => {
    const d = fresh();
    await answer(d);
    const [a, b] = await Promise.all([syncNow(d, server.fetchImpl), syncNow(d, server.fetchImpl)]);
    expect(a).toEqual(b);
    expect(server.events).toHaveLength(1);
  });

  it("syncs flags last-write-wins across devices", async () => {
    const a = fresh();
    const b = fresh();
    await setFlag(a, "Q1", "hard");
    await syncNow(a, server.fetchImpl);
    await syncNow(b, server.fetchImpl);
    expect((await b.kv.get("flag:Q1"))?.value).toBe("hard");

    await new Promise((r) => setTimeout(r, 5));
    await setFlag(b, "Q1", null); // cleared later on the other device
    await syncNow(b, server.fetchImpl);
    await syncNow(a, server.fetchImpl);
    expect((await a.kv.get("flag:Q1"))?.value).toBe("");
    expect((await a.kv.get("flag:Q1"))?.dirty).toBe(0);
  });

  it("pushes a local edit made while a sync was in flight", async () => {
    const d = fresh();
    await setFlag(d, "Q1", "hard");
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const slow = (async (url: string, init: RequestInit) => {
      await gate;
      return server.fetchImpl(url, init);
    }) as unknown as typeof fetch;

    const running = syncNow(d, slow);
    await new Promise((r) => setTimeout(r, 5));
    await setFlag(d, "Q1", "easy"); // edited while the push is on the wire
    release();
    await running;

    const row = await d.kv.get("flag:Q1");
    expect(row?.value).toBe("easy");
    expect(row?.dirty).toBe(0); // a second round in the same run picked the edit up
    expect(server.kv.get("flag:Q1")?.value).toBe("easy");
  });

  it("gives up on a run that never finishes and lets the next one through", async () => {
    const d = fresh();
    await answer(d);
    const hung = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    expect(await syncNow(d, hung, 50)).toMatchObject({ ok: false });
    expect(await syncNow(d, server.fetchImpl)).toMatchObject({ ok: true, pushed: 1 });
  });

  it("an abandoned run does not write when its late response arrives", async () => {
    const d = fresh();
    await answer(d);
    const late = (async (url: string, init: RequestInit) => {
      await new Promise((r) => setTimeout(r, 80));
      return server.fetchImpl(url, init);
    }) as unknown as typeof fetch;
    expect(await syncNow(d, late, 20)).toMatchObject({ ok: false });
    await new Promise((r) => setTimeout(r, 120));
    expect(await d.events.where("pending").equals(1).count()).toBe(1);
    expect(await getMeta(d, "cursor", 0)).toBe(0);
  });

  it("a timed-out run cannot overwrite the state of the next run", async () => {
    const d = fresh();
    await answer(d);
    const aborts = ((_url: string, init: RequestInit) =>
      new Promise((_, reject) =>
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        ),
      )) as unknown as typeof fetch;
    expect(await syncNow(d, aborts, 50)).toMatchObject({ ok: false });
    expect(await syncNow(d, server.fetchImpl)).toMatchObject({ ok: true, pushed: 1 });
    await new Promise((r) => setTimeout(r, 0));
    expect(syncStore.get()).toMatchObject({ state: "idle" });
  });

  it("picks up a write made while a round is in flight", async () => {
    const d = fresh();
    await answer(d, "Q1");
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let first = true;
    const slow = (async (url: string, init: RequestInit) => {
      if (first) {
        first = false;
        await gate;
      }
      return server.fetchImpl(url, init);
    }) as unknown as typeof fetch;

    const running = syncNow(d, slow);
    await new Promise((r) => setTimeout(r, 5));
    await answer(d, "Q2"); // lands while the first round is on the wire
    release();

    expect(await running).toMatchObject({ ok: true, pushed: 2 });
    expect(server.events).toHaveLength(2);
    expect(await d.events.where("pending").equals(1).count()).toBe(0);
  });

  it("records the server cursor", async () => {
    const d = fresh();
    await answer(d);
    await syncNow(d, server.fetchImpl);
    expect(await getMeta(d, "cursor", 0)).toBe(1);
  });
});

describe("refreshBank", () => {
  const bank = { version: "abc", categories: [], questions: [] };

  it("caches the bank, uses the cache when offline, and sends the etag", async () => {
    const d = fresh();
    let seen: HeadersInit | undefined;
    const ok = (async (_u: string, init: RequestInit) => {
      seen = init.headers;
      return new Response(JSON.stringify(bank), { headers: { etag: '"abc"' } });
    }) as unknown as typeof fetch;
    expect(await refreshBank(d, ok)).toEqual(bank);
    expect(await cachedBank(d)).toEqual(bank);

    await refreshBank(d, ok);
    expect(seen).toEqual({ "If-None-Match": '"abc"' });

    const offline = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await refreshBank(d, offline)).toEqual(bank);

    const notModified = (async () =>
      new Response(null, { status: 304 })) as unknown as typeof fetch;
    expect(await refreshBank(d, notModified)).toEqual(bank);
  });

  it("returns null with nothing cached and no network", async () => {
    const offline = (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch;
    expect(await refreshBank(fresh(), offline)).toBeNull();
  });
});

describe("parseSettings", () => {
  it("falls back to defaults and ignores removed settings", () => {
    expect(parseSettings(undefined)).toEqual({ autoAdvance: false });
    expect(parseSettings("not json")).toEqual({ autoAdvance: false });
    expect(parseSettings('{"newPerDay":9999,"sessionSize":1,"autoAdvance":true}')).toEqual({
      autoAdvance: true,
    });
  });
});
