import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { FsBlobStore } from "./adapters/fs-blob";
import { migrate, nodeSqlDb } from "./adapters/node-sqlite";
import { SqlEventStore, SqlKvStore } from "./adapters/sql";
import { createApp } from "./app";
import { SqlSessionStore, SqlUserStore } from "./auth/store";

const port = Number(process.env.PORT ?? 3001);
const dataDir = resolve(process.env.DATA_DIR ?? "./data");
mkdirSync(dataDir, { recursive: true });

// Dev defaults so `docker compose up` works with no setup. Never use these beyond your own machine.
const pepper = process.env.AUTH_PEPPER ?? "dev-pepper-change-me";
const adminToken = process.env.ADMIN_TOKEN ?? "dev-admin";
if (!process.env.AUTH_PEPPER || !process.env.ADMIN_TOKEN) {
  console.warn("using development AUTH_PEPPER/ADMIN_TOKEN; set them in .env for anything shared");
}

const db = new DatabaseSync(join(dataDir, "simata.db"));
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
const applied = migrate(db, join(dirname(fileURLToPath(import.meta.url)), "../migrations"));
if (applied.length) console.log("migrations applied:", applied.join(", "));

const sql = nodeSqlDb(db);
const app = createApp({
  clock: () => Date.now(),
  events: new SqlEventStore(sql),
  kv: new SqlKvStore(sql),
  blobs: new FsBlobStore(join(dataDir, "blobs")),
  users: new SqlUserStore(sql),
  sessions: new SqlSessionStore(sql),
  pepper,
  adminToken,
});

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`api listening on :${info.port}, data in ${dataDir}`);
});
