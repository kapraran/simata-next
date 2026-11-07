import type { AnswerEvent } from "@simata/core";
import { getMeta, type LocalEvent, type SimataDb, setMeta } from "./db";
import { log } from "./log";

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
/** A whole sync run gives up after this, so a stuck run can't block the next attempt. */
const SYNC_TIMEOUT_MS = 20_000;
const FETCH_TIMEOUT_MS = 15_000;

let current: SyncState = { state: "idle" };
const listeners = new Set<() => void>();
const inflight = new WeakMap<SimataDb, Promise<SyncResult>>();
/** Bumped by every write; lets a running sync see writes that landed mid-round. */
let writeCount = 0;

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
export function syncNow(
  d: SimataDb,
  f: typeof fetch = fetch,
  timeoutMs = SYNC_TIMEOUT_MS,
): Promise<SyncResult> {
  const running = inflight.get(d);
  if (running) {
    log("sync", "joined a sync already running");
    return running;
  }
  const controller = new AbortController();
  const run = withDeadline(doSync(d, f, controller.signal), timeoutMs, () => {
    const error = "sync timed out";
    controller.abort();
    log("sync", "timed out; the next trigger starts a fresh run", { timeoutMs });
    set({ ...current, state: "error", error });
    return { ok: false, error } as const;
  }).finally(() => inflight.delete(d));
  inflight.set(d, run);
  return run;
}

function withDeadline<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(onTimeout()), ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer));
}

async function doSync(d: SimataDb, f: typeof fetch, aborted: AbortSignal): Promise<SyncResult> {
  set({ ...current, state: "syncing" });
  let pushed = 0;
  let pulled = 0;
  const started = Date.now();
  log("sync", "start");
  try {
    let drainedAt = writeCount;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const readStart = Date.now();
      // One read transaction for the whole round: fewer round trips to IndexedDB, and no
      // write can land between the four reads and change what is in `pending`.
      const { cursor, kvRev, pending, dirty } = await d.transaction(
        "r",
        d.events,
        d.kv,
        d.meta,
        async () => ({
          cursor: await getMeta(d, "cursor", 0),
          kvRev: await getMeta(d, "kvRev", 0),
          pending: await d.events.where("pending").equals(1).limit(PUSH_LIMIT).toArray(),
          dirty: await d.kv.where("dirty").equals(1).toArray(),
        }),
      );
      log("sync", `round ${round} request`, {
        cursor,
        kvRev,
        pushEvents: pending.length,
        pushKv: dirty.length,
        readMs: Date.now() - readStart,
      });

      const res = await f("/api/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.any([aborted, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
        body: JSON.stringify({
          cursor,
          kvRev,
          events: pending.map(strip),
          kv: dirty.map(({ key, value, updatedAt }) => ({ key, value, updatedAt })),
        }),
      });
      if (!res.ok) throw new Error(`sync failed: ${res.status}`);
      const data = (await res.json()) as SyncResponse;
      log("sync", `round ${round} response`, {
        pulledEvents: data.events.length,
        pulledKv: data.kv.length,
        cursor: data.cursor,
        hasMore: data.hasMore,
      });

      const applyStart = Date.now();
      const pushedIds = new Set(pending.map((e) => e.id));
      await d.transaction("rw", d.events, d.kv, d.meta, async () => {
        // What we pushed is now on the server.
        if (pending.length > 0) {
          await d.events
            .where("id")
            .anyOf(pending.map((e) => e.id))
            .modify({ pending: 0 });
        }
        // The rest is new from other devices. Our own events come back echoed; skip them,
        // they are already here and re-writing them only churns the live queries.
        const fromOthers = data.events.filter((e) => !pushedIds.has(e.id));
        if (fromOthers.length > 0) {
          await d.events.bulkPut(
            fromOthers.map(({ seq: _seq, ...e }): LocalEvent => ({ ...e, pending: 0 })),
          );
        }

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
      log("sync", `round ${round} applied`, { ms: Date.now() - applyStart });

      pushed += pending.length;
      pulled += data.events.length;
      if (data.hasMore || pending.length >= PUSH_LIMIT) continue;
      // A write that landed while this round was in flight is not in `pending` yet. Do one
      // more round now instead of leaving it pending until the next trigger.
      if (writeCount !== drainedAt) {
        drainedAt = writeCount;
        continue;
      }
      break;
    }
    if (aborted.aborted) return { ok: false, error: "sync timed out" };
    set({ state: "idle", lastOkAt: Date.now() });
    log("sync", "done", { pushed, pulled, ms: Date.now() - started });
    return { ok: true, pushed, pulled };
  } catch (e) {
    // The deadline already reported this run; a late error must not overwrite the next run's state.
    if (aborted.aborted) return { ok: false, error: "sync timed out" };
    const error = e instanceof Error ? e.message : String(e);
    log("sync", "failed", { error, ms: Date.now() - started });
    set({ ...current, state: "error", error });
    return { ok: false, error };
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Sync soon, collapsing bursts of writes into one request. */
export function requestSync(d: SimataDb, delayMs = 1500) {
  writeCount++;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(d), delayMs);
}
