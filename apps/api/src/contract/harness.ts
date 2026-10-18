import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { type D1Like, d1SqlDb } from "../adapters/d1";
import { FsBlobStore } from "../adapters/fs-blob";
import { migrate, nodeSqlDb } from "../adapters/node-sqlite";
import { R2BlobStore, type R2Like } from "../adapters/r2-blob";
import { SqlEventStore, SqlKvStore } from "../adapters/sql";

export const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../../migrations");

/** Fresh in-memory SQLite with the real migrations applied. */
export function sqliteStores() {
  const db = new DatabaseSync(":memory:");
  migrate(db, migrationsDir);
  const sql = nodeSqlDb(db);
  return { events: new SqlEventStore(sql), kv: new SqlKvStore(sql), db };
}

export function tempFsBlobs() {
  return new FsBlobStore(mkdtempSync(join(tmpdir(), "simata-blobs-")));
}

/** Local Cloudflare runtime (workerd) with a D1 database and an R2 bucket, both in memory. */
export async function miniflare() {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    compatibilityDate: "2026-01-01",
    d1Databases: ["DB"],
    r2Buckets: ["MEDIA"],
  });
  const d1 = (await mf.getD1Database("DB")) as unknown as D1Like & {
    exec(sql: string): Promise<unknown>;
  };
  // wrangler applies the same file with `d1 migrations apply`; here we run it statement by statement.
  const statements = readFileSync(join(migrationsDir, "0001_init.sql"), "utf8")
    .replace(/--.*$/gm, "")
    .split(";")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  await d1.batch(statements.map((s) => d1.prepare(s)));

  const bucket = (await mf.getR2Bucket("MEDIA")) as unknown as R2Like;
  const sql = d1SqlDb(d1);
  return {
    events: new SqlEventStore(sql),
    kv: new SqlKvStore(sql),
    blobs: new R2BlobStore(bucket),
    dispose: () => mf.dispose(),
  };
}
