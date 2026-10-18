import type { AnswerEvent } from "@simata/core";
import { getMeta, type LocalEvent, type SimataDb, setMeta } from "./db";

export type SyncState = {
  state: "idle" | "syncing" | "error";
  lastOkAt?: number;
  error?: string;
};

export type SyncResult =
  | { ok: true; pushed: number; pulled: number }
  | { ok: false; error: string };

type ServerEvent = AnswerEvent & { seq: number };
type ServerKv = { key: string; value: string; updatedAt: number; rev: number };
type SyncResponse = {
  cursor: number;
  hasMore: boolean;
  events: ServerEvent[];
  kvRev: number;
  kv: ServerKv[];
};

const PUSH_LIMIT = 500;
const MAX_ROUNDS = 50;

let current: SyncState = { state: "idle" };
const listeners = new Set<() => void>();
const inflight = new WeakMap<SimataDb, Promise<SyncResult>>();

function set(next: SyncState) {
  current = next;
  for (const l of listeners) l();
}

export const syncStore = {
  get: () => current,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

function strip(e: LocalEvent): AnswerEvent {
  const { pending: _pending, ...event } = e;
  return event;
}

/**
 * Push local changes and pull everyone else's. Safe to call any time and any number of times:
 * concurrent calls share one run, and the server ignores events it already has.
 */
export function syncNow(d: SimataDb, f: typeof fetch = fetch): Promise<SyncResult> {
  const running = inflight.get(d);
  if (running) return running;
  const run = doSync(d, f).finally(() => inflight.delete(d));
  inflight.set(d, run);
  return run;
}

async function doSync(d: SimataDb, f: typeof fetch): Promise<SyncResult> {
  set({ ...current, state: "syncing" });
  let pushed = 0;
  let pulled = 0;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const cursor = await getMeta(d, "cursor", 0);
      const kvRev = await getMeta(d, "kvRev", 0);
      const pending = await d.events.where("pending").equals(1).limit(PUSH_LIMIT).toArray();
      const dirty = await d.kv.where("dirty").equals(1).toArray();

      const res = await f("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          cursor,
          kvRev,
          events: pending.map(strip),
          kv: dirty.map(({ key, value, updatedAt }) => ({ key, value, updatedAt })),
        }),
      });
      if (!res.ok) throw new Error(`sync failed: ${res.status}`);
      const data = (await res.json()) as SyncResponse;

      await d.transaction("rw", d.events, d.kv, d.meta, async () => {
        // What we pushed is now on the server.
        await d.events
          .where("id")
          .anyOf(pending.map((e) => e.id))
          .modify({ pending: 0 });
        // What others pushed (and our own, echoed back) is now here.
        await d.events.bulkPut(
          data.events.map(({ seq: _seq, ...e }): LocalEvent => ({ ...e, pending: 0 })),
        );

        // Settings/notes/flags: newest write wins. Keep a local edit made while we were syncing.
        for (const p of dirty) {
          const now = await d.kv.get(p.key);
          if (now && now.updatedAt === p.updatedAt) await d.kv.update(p.key, { dirty: 0 });
        }
        for (const s of data.kv) {
          const local = await d.kv.get(s.key);
          if (!local || s.updatedAt > local.updatedAt) {
            await d.kv.put({ key: s.key, value: s.value, updatedAt: s.updatedAt, dirty: 0 });
          }
        }
        await setMeta(d, "cursor", data.cursor);
        await setMeta(d, "kvRev", data.kvRev);
      });

      pushed += pending.length;
      pulled += data.events.length;
      if (!data.hasMore && pending.length < PUSH_LIMIT) break;
    }
    set({ state: "idle", lastOkAt: Date.now() });
    return { ok: true, pushed, pulled };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    set({ ...current, state: "error", error });
    return { ok: false, error };
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Sync soon, collapsing bursts of writes into one request. */
export function requestSync(d: SimataDb, delayMs = 1500) {
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(d), delayMs);
}
