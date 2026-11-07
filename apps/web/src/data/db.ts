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

export const db = new SimataDb();

export async function getMeta<T>(d: SimataDb, key: string, fallback: T): Promise<T> {
  const row = await d.meta.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export function setMeta(d: SimataDb, key: string, value: unknown) {
  return d.meta.put({ key, value });
}
