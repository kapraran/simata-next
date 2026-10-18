import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Bank,
  buildBank,
  convertLegacyStats,
  foldEvents,
  imageHashFromUrl,
  type LegacyStat,
  mulberry32,
  passChance,
  type RawQuestion,
} from "@simata/core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const content = join(root, "content");
const rawDir = join(content, "raw");
const rawImages = join(rawDir, "images");
const bankDir = join(content, "bank");

const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

/** Run wrangler. Only ever called with `r2 object get` (read-only) in this tool. */
function wrangler(args: string[]): Promise<{ code: number; out: string }> {
  const bin = join(
    dirname(createRequire(import.meta.url).resolve("wrangler")),
    "..",
    "bin",
    "wrangler.js",
  );
  return new Promise((res) => {
    const p = spawn(process.execPath, [bin, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => {
      out += d;
    });
    p.stderr.on("data", (d) => {
      out += d;
    });
    p.on("close", (code) => res({ code: code ?? 1, out }));
  });
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++] as T);
    }),
  );
}

async function r2Get(bucket: string, key: string, file: string): Promise<boolean> {
  const { code } = await wrangler([
    "r2",
    "object",
    "get",
    `${bucket}/${key}`,
    "--remote",
    "--file",
    file,
  ]);
  return code === 0;
}

/** One-time READ-ONLY copy from a bucket into content/raw. Nothing is written to the bucket. */
async function pull() {
  const bucket = arg("bucket", "simata") as string;
  const extra = arg("extra-images"); // e.g. a folder of images named <code>-<sha256>.jpg
  await mkdir(rawImages, { recursive: true });

  const qFile = join(rawDir, "questions.json");
  if (!existsSync(qFile)) {
    console.log(`pulling questions/all.json from ${bucket} (read-only)`);
    if (!(await r2Get(bucket, "questions/all.json", qFile)))
      throw new Error("could not read questions");
  }
  const raw = JSON.parse(await readFile(qFile, "utf8")) as RawQuestion[];

  // Pre-fill from a local folder where possible.
  if (extra) {
    for (const f of await readdir(extra)) {
      const h = /-([0-9a-f]{64})\.jpg$/.exec(f)?.[1];
      if (!h) continue;
      const buf = await readFile(join(extra, f));
      if (sha256(buf) === h && !existsSync(join(rawImages, `${h}.jpg`)))
        await cp(join(extra, f), join(rawImages, `${h}.jpg`));
    }
  }

  const wanted = new Map<string, string>(); // content hash -> r2 key
  for (const q of raw) {
    if (!q.image) continue;
    const h = imageHashFromUrl(q.image);
    if (h) wanted.set(h, `images/${sha256(q.image)}`);
  }

  const todo = [...wanted].filter(([h]) => !existsSync(join(rawImages, `${h}.jpg`)));
  console.log(
    `${wanted.size} distinct images, ${wanted.size - todo.length} already local, ${todo.length} to pull`,
  );

  const stats = { ok: 0, missing: 0, corrupt: 0 };
  await pool(todo, 6, async ([h, key]) => {
    const tmp = join(rawImages, `${h}.part`);
    if (!(await r2Get(bucket, key, tmp))) {
      stats.missing++;
      await rm(tmp, { force: true });
      return;
    }
    if (sha256(await readFile(tmp)) !== h) {
      stats.corrupt++;
      await rm(tmp, { force: true });
      return;
    }
    await rename(tmp, join(rawImages, `${h}.jpg`));
    stats.ok++;
  });
  console.log("pull done", stats);
}

async function build() {
  const raw = JSON.parse(await readFile(join(rawDir, "questions.json"), "utf8")) as RawQuestion[];
  const available = new Set(
    (await readdir(rawImages)).filter((f) => f.endsWith(".jpg")).map((f) => f.replace(".jpg", "")),
  );
  const version = sha256(JSON.stringify(raw) + [...available].sort().join()).slice(0, 12);
  const { bank, disabled, invalid, suspicious } = buildBank(raw, available, version);

  await rm(bankDir, { recursive: true, force: true });
  await mkdir(join(bankDir, "media"), { recursive: true });
  const used = new Set(bank.questions.flatMap((q) => (q.image ? [q.image] : [])));
  for (const key of used) await cp(join(rawImages, key.replace("media/", "")), join(bankDir, key));
  const file = `bank.${version}.json`;
  await writeFile(join(bankDir, file), JSON.stringify(bank));
  await writeFile(join(bankDir, "bank.json"), JSON.stringify({ current: file, version }));

  const enabled = bank.questions.filter((q) => !q.disabled);
  const report = {
    version,
    total: bank.questions.length,
    enabled: enabled.length,
    disabled: bank.questions.length - enabled.length,
    withImage: enabled.filter((q) => q.image).length,
    distinctImages: used.size,
    invalid,
    disabledImages: disabled,
    suspicious,
  };
  await writeFile(join(content, "report.json"), JSON.stringify(report, null, 2));
  console.log(
    `bank ${version}: ${report.enabled} enabled / ${report.disabled} disabled, ` +
      `${report.distinctImages} distinct images, ${invalid.length} invalid, ${suspicious.length} suspicious`,
  );
}

/** Copy the built bank into the local blob folder (DATA_DIR/blobs), the fs BlobStore layout. */
async function seed() {
  const dest = join(resolve(arg("data", join(root, "data")) as string), "blobs");
  await mkdir(dest, { recursive: true });
  await cp(bankDir, dest, { recursive: true });
  console.log(`seeded ${dest}`);
}

/** Convert the 2022 stats.json into events + flags (content/legacy.json) and show where that leaves you. */
async function legacy() {
  const file = arg("stats");
  if (!file) throw new Error("usage: legacy --stats <path to old stats.json>");
  const stats = JSON.parse(await readFile(file, "utf8")) as LegacyStat[];
  const { events, flags } = convertLegacyStats(stats);
  await writeFile(join(content, "legacy.json"), JSON.stringify({ events, flags }));

  const current = JSON.parse(await readFile(join(bankDir, "bank.json"), "utf8")).current as string;
  const bank = JSON.parse(await readFile(join(bankDir, current), "utf8")) as Bank;
  const ids = new Set(bank.questions.map((q) => q.id));
  const orphans = events.filter((e) => !ids.has(e.questionId)).length;
  const now = Date.now();
  const progress = foldEvents(events);
  const chance = passChance(bank.questions, progress, now, mulberry32(1));
  console.log(
    `${events.length} events on ${progress.states.size} questions (${orphans} orphaned), ` +
      `flags: ${Object.keys(flags).length}, pass chance today: ${(chance * 100).toFixed(1)}%`,
  );

  const target = arg("push");
  if (!target) {
    console.log("not pushed (add --push http://localhost:3001 to send it to a server)");
    return;
  }
  // A flag is stamped with its question's last 2022 answer, so a flag you change in the app later wins.
  const lastAt = new Map(
    stats.map((s) => [s.id, Math.max(0, ...s.answers.map((a) => a.timestamp))]),
  );
  const kv = Object.entries(flags).map(([id, flag]) => ({
    key: `flag:${id}`,
    value: flag,
    updatedAt: lastAt.get(id) ?? 0,
  }));
  let accepted = 0;
  for (let i = 0; i < Math.max(events.length, 1); i += 500) {
    const res = await fetch(new URL("/api/sync", target), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ events: events.slice(i, i + 500), kv: i === 0 ? kv : [] }),
    });
    if (!res.ok) throw new Error(`push failed: ${res.status} ${await res.text()}`);
    accepted += ((await res.json()) as { accepted: number }).accepted;
  }
  console.log(
    `pushed: ${accepted} new events accepted (${events.length - accepted} already on the server)`,
  );
}

const cmd = process.argv[2];
const cmds: Record<string, () => Promise<void>> = { pull, build, seed, legacy };
const run = cmds[cmd ?? ""];
if (!run) {
  console.error(
    "usage: cli.ts pull [--bucket simata] [--extra-images dir] | build | seed [--data dir] | legacy --stats file [--push url]",
  );
  process.exit(1);
}
run().catch((e) => {
  console.error(e);
  process.exit(1);
});
