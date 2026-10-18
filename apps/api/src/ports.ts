import type { AnswerEvent } from "@simata/core";

/** An event as stored: the log position `seq` is the sync cursor. */
export type StoredEvent = AnswerEvent & { seq: number };

export interface EventStore {
  /** Append events, ignoring ids already stored. Returns how many were new. */
  append(userId: string, events: readonly AnswerEvent[]): Promise<number>;
  /** Events with seq > cursor, oldest first. */
  since(userId: string, cursor: number, limit: number): Promise<StoredEvent[]>;
}

export type KvEntry = { key: string; value: string; updatedAt: number };
export type StoredKv = KvEntry & { rev: number };

export interface KvStore {
  /** Last write wins by updatedAt. Stale writes are ignored. */
  put(userId: string, entries: readonly KvEntry[]): Promise<void>;
  /** Entries changed after server revision `rev`, oldest change first. */
  since(userId: string, rev: number): Promise<StoredKv[]>;
}

export type Blob = { body: Uint8Array; contentType: string };

export interface BlobStore {
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
}

/** Resolves who is calling. null = not allowed. */
export interface Identity {
  resolve(req: Request): Promise<string | null>;
}

export type Ports = {
  clock: () => number;
  events: EventStore;
  kv: KvStore;
  blobs: BlobStore;
  identity: Identity;
};
