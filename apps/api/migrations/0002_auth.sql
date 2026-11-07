-- Accounts and login sessions. Added after 0001 was already applied to the cloud D1.

-- One row per account. `key_hash` is HMAC-SHA256(AUTH_PEPPER, login key) — the key itself is never
-- stored, so a database leak does not expose logins. `id` is an internal UUID, not a credential.
CREATE TABLE users (
  id           TEXT PRIMARY KEY,
  key_hash     TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER,
  disabled     INTEGER NOT NULL DEFAULT 0
);

-- Server-side sessions backing the login cookie. `token_hash` is HMAC-SHA256(pepper, token).
CREATE TABLE sessions (
  token_hash   TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_expires ON sessions (expires_at);
