import type { AnswerEvent, Mode } from "@simata/core";
import type { EventStore, KvEntry, KvStore, StoredEvent, StoredKv } from "../ports";

export type Stmt = { sql: string; params?: readonly (string | number | null)[] };

/** The only thing the stores need from a database. Implemented for node:sqlite and D1. */
export interface SqlDb {
  all<T>(sql: string, params?: Stmt["params"]): Promise<T[]>;
  /** Run statements atomically, in order. Returns rows changed per statement. */
  batch(stmts: readonly Stmt[]): Promise<number[]>;
}

// D1 caps a batch; keep chunks well under it.
const BATCH = 100;
// D1 allows 100 bound parameters per statement; 9 columns -> 11 rows (99 params).
const EVENT_ROWS_PER_STMT = 11;

type EventRow = {
  seq: number;
  id: string;
  question_id: string;
  correct: number;
  duration_ms: number;
  guessed: number;
  mode: string;
  at: number;
  device_id: string;
};

export class SqlEventStore implements EventStore {
  constructor(private readonly db: SqlDb) {}

  async append(userId: string, events: readonly AnswerEvent[]): Promise<number> {
    const stmts: Stmt[] = [];
    for (let i = 0; i < events.length; i += EVENT_ROWS_PER_STMT) {
      const rows = events.slice(i, i + EVENT_ROWS_PER_STMT);
      stmts.push({
        sql: `INSERT OR IGNORE INTO events
                (user_id, id, question_id, correct, duration_ms, guessed, mode, at, device_id)
              VALUES ${rows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
        params: rows.flatMap((e) => [
          userId,
          e.id,
          e.questionId,
          e.correct ? 1 : 0,
          Math.round(e.durationMs),
          e.guessed ? 1 : 0,
          e.mode,
          e.at,
          e.deviceId,
        ]),
      });
    }
    let inserted = 0;
    for (let i = 0; i < stmts.length; i += BATCH) {
      inserted += (await this.db.batch(stmts.slice(i, i + BATCH))).reduce((a, b) => a + b, 0);
    }
    return inserted;
  }

  async since(userId: string, cursor: number, limit: number): Promise<StoredEvent[]> {
    const rows = await this.db.all<EventRow>(
      `SELECT seq, id, question_id, correct, duration_ms, guessed, mode, at, device_id
         FROM events WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT ?`,
      [userId, cursor, limit],
    );
    return rows.map((r) => ({
      seq: r.seq,
      id: r.id,
      questionId: r.question_id,
      correct: r.correct === 1,
      durationMs: r.duration_ms,
      guessed: r.guessed === 1,
      mode: r.mode as Mode,
      at: r.at,
      deviceId: r.device_id,
    }));
  }
}

export class SqlKvStore implements KvStore {
  constructor(private readonly db: SqlDb) {}

  async put(userId: string, entries: readonly KvEntry[]): Promise<void> {
    for (let i = 0; i < entries.length; i += BATCH) {
      // The newer write wins; server_rev only moves when the row actually changes.
      const stmts = entries.slice(i, i + BATCH).map(
        (e): Stmt => ({
          sql: `INSERT INTO kv (user_id, key, value, updated_at, server_rev)
                VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(server_rev), 0) + 1 FROM kv))
                ON CONFLICT (user_id, key) DO UPDATE SET
                  value = excluded.value,
                  updated_at = excluded.updated_at,
                  server_rev = excluded.server_rev
                WHERE excluded.updated_at > kv.updated_at`,
          params: [userId, e.key, e.value, e.updatedAt],
        }),
      );
      await this.db.batch(stmts);
    }
  }

  async since(userId: string, rev: number): Promise<StoredKv[]> {
    const rows = await this.db.all<{
      key: string;
      value: string;
      updated_at: number;
      server_rev: number;
    }>(
      `SELECT key, value, updated_at, server_rev FROM kv
        WHERE user_id = ? AND server_rev > ? ORDER BY server_rev`,
      [userId, rev],
    );
    return rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedAt: r.updated_at,
      rev: r.server_rev,
    }));
  }
}
