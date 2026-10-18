import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { SqlDb, Stmt } from "./sql";

type Bind = (string | number | null)[];

export function nodeSqlDb(db: DatabaseSync): SqlDb {
  return {
    async all<T>(sql: string, params: Stmt["params"] = []) {
      return db.prepare(sql).all(...(params as Bind)) as T[];
    },
    async batch(stmts) {
      const changes: number[] = [];
      db.exec("BEGIN");
      try {
        for (const s of stmts) {
          const r = db.prepare(s.sql).run(...((s.params ?? []) as Bind));
          changes.push(Number(r.changes));
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return changes;
    },
  };
}

/** Apply migrations/*.sql in name order, once each. Same files that `wrangler d1 migrations apply` uses. */
export function migrate(db: DatabaseSync, dir: string): string[] {
  db.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  const done = new Set(
    (db.prepare("SELECT name FROM _migrations").all() as { name: string }[]).map((r) => r.name),
  );
  const applied: string[] = [];
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (done.has(file)) continue;
    db.exec("BEGIN");
    try {
      db.exec(readFileSync(join(dir, file), "utf8"));
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(file, Date.now());
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    applied.push(file);
  }
  return applied;
}
