import type { AnswerEvent } from "@simata/core";
import Dexie, { type EntityTable } from "dexie";
import { log } from "./log";

/** Booleans can't be indexed in IndexedDB, so "not yet pushed" is 1/0. */
export type LocalEvent = AnswerEvent & { pending: 0 | 1 };
export type LocalKv = { key: string; value: string; updatedAt: number; dirty: 0 | 1 };
export type Meta = { key: string; value: unknown };

export class SimataDb extends Dexie {
  events!: EntityTable<LocalEvent, "id">;
  kv!: EntityTable<LocalKv, "key">;
  meta!: EntityTable<Meta, "key">;

  constructor(name = "simata") {
    super(name);
    this.version(1).stores({
      events: "id, at, pending, questionId",
      kv: "key, dirty",
      meta: "key",
    });
    const started = Date.now();
    this.on("ready", () => log("db", `${name} open`, { msSinceCreated: Date.now() - started }));
    this.on("blocked", () => log("db", `${name} blocked by another open connection`));
    this.on("versionchange", () => log("db", `${name} version change requested`));
  }
}

/**
 * One database per account, named `simata:<userId>`. Two people sharing a tablet therefore never
 * share events, cursors or a push queue. Instances are cached so reopening is cheap and
 * `useLiveQuery` keeps a stable dependency.
 */
const open = new Map<string, SimataDb>();

export function getDb(userId: string): SimataDb {
  let d = open.get(userId);
  if (!d) {
    d = new SimataDb(`simata:${userId}`);
    open.set(userId, d);
  }
  return d;
}

/** Drop this account's data from the device (used by "Remove from this device"). */
export async function deleteDb(userId: string): Promise<void> {
  const d = open.get(userId);
  if (d) {
    d.close();
    open.delete(userId);
  }
  await Dexie.delete(`simata:${userId}`);
}

const LEGACY_FLAG = "simata:legacy-cleared";

/** One-time cleanup of the pre-multi-user database, so stale progress can't resurface. */
export async function clearLegacyDbOnce(): Promise<void> {
  try {
    if (localStorage.getItem(LEGACY_FLAG)) return;
    localStorage.setItem(LEGACY_FLAG, "1");
  } catch {
    // No storage: nothing to clean up.
    return;
  }
  try {
    await Dexie.delete("simata");
    log("db", "deleted legacy database");
  } catch {
    // It may never have existed.
  }
}

export async function getMeta<T>(d: SimataDb, key: string, fallback: T): Promise<T> {
  const row = await d.meta.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export function setMeta(d: SimataDb, key: string, value: unknown) {
  return d.meta.put({ key, value });
}
