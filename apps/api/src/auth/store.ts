import type { SqlDb } from "../adapters/sql";
import type {
  NewSession,
  NewUser,
  SessionStore,
  StoredSession,
  User,
  UserRecord,
  UserStore,
} from "../ports";

type UserRow = {
  id: string;
  key_hash: string;
  name: string;
  created_at: number;
  last_seen_at: number | null;
  disabled: number;
};

const toUser = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
  disabled: r.disabled === 1,
});

const toRecord = (r: UserRow): UserRecord => ({ ...toUser(r), keyHash: r.key_hash });

export class SqlUserStore implements UserStore {
  constructor(private readonly db: SqlDb) {}

  async insert(u: NewUser): Promise<void> {
    await this.db.batch([
      {
        sql: `INSERT INTO users (id, key_hash, name, created_at, last_seen_at, disabled)
              VALUES (?, ?, ?, ?, NULL, 0)`,
        params: [u.id, u.keyHash, u.name, u.createdAt],
      },
    ]);
  }

  async byKeyHash(keyHash: string): Promise<UserRecord | null> {
    const rows = await this.db.all<UserRow>(
      `SELECT id, key_hash, name, created_at, last_seen_at, disabled
         FROM users WHERE key_hash = ?`,
      [keyHash],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async byId(id: string): Promise<UserRecord | null> {
    const rows = await this.db.all<UserRow>(
      `SELECT id, key_hash, name, created_at, last_seen_at, disabled FROM users WHERE id = ?`,
      [id],
    );
    const row = rows[0];
    return row ? toRecord(row) : null;
  }

  async list(): Promise<User[]> {
    const rows = await this.db.all<UserRow>(
      `SELECT id, key_hash, name, created_at, last_seen_at, disabled
         FROM users ORDER BY created_at, id`,
    );
    return rows.map(toUser);
  }

  async setName(id: string, name: string): Promise<void> {
    await this.db.batch([{ sql: `UPDATE users SET name = ? WHERE id = ?`, params: [name, id] }]);
  }

  async setKeyHash(id: string, keyHash: string): Promise<void> {
    await this.db.batch([
      { sql: `UPDATE users SET key_hash = ? WHERE id = ?`, params: [keyHash, id] },
    ]);
  }

  async setDisabled(id: string, disabled: boolean): Promise<void> {
    await this.db.batch([
      { sql: `UPDATE users SET disabled = ? WHERE id = ?`, params: [disabled ? 1 : 0, id] },
    ]);
  }

  async touch(id: string, at: number): Promise<void> {
    await this.db.batch([
      { sql: `UPDATE users SET last_seen_at = ? WHERE id = ?`, params: [at, id] },
    ]);
  }

  async remove(id: string): Promise<void> {
    // Explicit sibling delete, since D1 does not enforce the FK cascade by default.
    await this.db.batch([
      { sql: `DELETE FROM sessions WHERE user_id = ?`, params: [id] },
      { sql: `DELETE FROM users WHERE id = ?`, params: [id] },
    ]);
  }
}

export class SqlSessionStore implements SessionStore {
  constructor(private readonly db: SqlDb) {}

  async insert(s: NewSession): Promise<void> {
    await this.db.batch([
      {
        sql: `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [s.tokenHash, s.userId, s.createdAt, s.expiresAt, s.lastSeenAt],
      },
    ]);
  }

  async get(tokenHash: string): Promise<StoredSession | null> {
    const rows = await this.db.all<{
      user_id: string;
      expires_at: number;
      last_seen_at: number;
    }>(`SELECT user_id, expires_at, last_seen_at FROM sessions WHERE token_hash = ?`, [tokenHash]);
    const row = rows[0];
    return row
      ? { userId: row.user_id, expiresAt: row.expires_at, lastSeenAt: row.last_seen_at }
      : null;
  }

  async touch(tokenHash: string, lastSeenAt: number, expiresAt: number): Promise<void> {
    await this.db.batch([
      {
        sql: `UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?`,
        params: [lastSeenAt, expiresAt, tokenHash],
      },
    ]);
  }

  async removeByToken(tokenHash: string): Promise<void> {
    await this.db.batch([
      { sql: `DELETE FROM sessions WHERE token_hash = ?`, params: [tokenHash] },
    ]);
  }

  async removeByUser(userId: string): Promise<void> {
    await this.db.batch([{ sql: `DELETE FROM sessions WHERE user_id = ?`, params: [userId] }]);
  }

  async purgeExpired(now: number): Promise<void> {
    await this.db.batch([{ sql: `DELETE FROM sessions WHERE expires_at <= ?`, params: [now] }]);
  }
}
