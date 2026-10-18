import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { FsBlobStore } from "./adapters/fs-blob";
import { localIdentity } from "./adapters/identity";
import { migrate, nodeSqlDb } from "./adapters/node-sqlite";
import { SqlEventStore, SqlKvStore } from "./adapters/sql";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3001);
const dataDir = resolve(process.env.DATA_DIR ?? "./data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(join(dataDir, "simata.db"));
db.exec("PRAGMA journal_mode = WAL");
const applied = migrate(db, join(dirname(fileURLToPath(import.meta.url)), "../migrations"));
if (applied.length) console.log("migrations applied:", applied.join(", "));

const sql = nodeSqlDb(db);
const app = createApp({
  clock: () => Date.now(),
  events: new SqlEventStore(sql),
  kv: new SqlKvStore(sql),
  blobs: new FsBlobStore(join(dataDir, "blobs")),
  identity: localIdentity(),
});

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`api listening on :${info.port}, data in ${dataDir}`);
});
