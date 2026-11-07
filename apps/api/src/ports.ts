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

/** A user as handed back to the admin API and `/api/me` — never includes the key hash. */
export type User = {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
  disabled: boolean;
};

/** A user row with the stored credential, for login lookups only. */
export type UserRecord = User & { keyHash: string };

export type NewUser = { id: string; keyHash: string; name: string; createdAt: number };

export interface UserStore {
  insert(user: NewUser): Promise<void>;
  byKeyHash(keyHash: string): Promise<UserRecord | null>;
  byId(id: string): Promise<UserRecord | null>;
  list(): Promise<User[]>;
  setName(id: string, name: string): Promise<void>;
  setKeyHash(id: string, keyHash: string): Promise<void>;
  setDisabled(id: string, disabled: boolean): Promise<void>;
  touch(id: string, at: number): Promise<void>;
  remove(id: string): Promise<void>;
}

export type NewSession = {
  tokenHash: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt: number;
};

export type StoredSession = { userId: string; expiresAt: number; lastSeenAt: number };

export interface SessionStore {
  insert(session: NewSession): Promise<void>;
  get(tokenHash: string): Promise<StoredSession | null>;
  /** Slide the expiry. Only called when a session is actually stale, to avoid a write per request. */
  touch(tokenHash: string, lastSeenAt: number, expiresAt: number): Promise<void>;
  removeByToken(tokenHash: string): Promise<void>;
  /** Kill every session for a user (sign-out everywhere, key rotation, disable). */
  removeByUser(userId: string): Promise<void>;
  purgeExpired(now: number): Promise<void>;
}

export type Ports = {
  clock: () => number;
  events: EventStore;
  kv: KvStore;
  blobs: BlobStore;
  users: UserStore;
  sessions: SessionStore;
  /** HMAC key for hashing login keys and session tokens. Empty = auth is not configured. */
  pepper: string;
  /** Bearer token for the admin API. Empty = the admin API is disabled. */
  adminToken: string;
};
