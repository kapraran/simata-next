-- Applied by `wrangler d1 migrations apply` (cloud) and by the Node runner (local): same file.

CREATE TABLE events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT    NOT NULL,
  id          TEXT    NOT NULL,
  question_id TEXT    NOT NULL,
  correct     INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  guessed     INTEGER NOT NULL,
  mode        TEXT    NOT NULL,
  at          INTEGER NOT NULL,
  device_id   TEXT    NOT NULL,
  UNIQUE (user_id, id)
);

CREATE INDEX events_user_seq ON events (user_id, seq);

-- Settings, notes, flags. Last write wins by updated_at; server_rev is the sync cursor.
CREATE TABLE kv (
  user_id    TEXT    NOT NULL,
  key        TEXT    NOT NULL,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL,
  server_rev INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE INDEX kv_user_rev ON kv (user_id, server_rev);
