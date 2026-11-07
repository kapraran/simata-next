/**
 * Admin CLI for the Simata accounts API. There is no admin UI on purpose: this talks to
 * `/api/admin/*` with the ADMIN_TOKEN, so the same command works against the local Docker API or
 * the deployed Worker. It only ever *creates* keys and claim links; it prints them once and cannot
 * read them back.
 *
 *   npm run admin -- create --name "Maria"
 *   npm run admin -- list
 *   npm run admin -- rotate <id>
 *   npm run admin -- disable <id> | enable <id> | delete <id>
 *
 * Config: --api <url>   (default SIMATA_API or http://localhost:3001)
 *         --token <tok> (default ADMIN_TOKEN)
 *         --base-url <url> (default APP_URL, else the API base) for the claim link
 */
import { createInterface } from "node:readline";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const command = positional[0];
const id = positional[1];

const api = (arg("api") ?? process.env.SIMATA_API ?? "http://localhost:3001").replace(/\/$/, "");
const token = arg("token") ?? process.env.ADMIN_TOKEN ?? "";
const baseUrl = (arg("base-url") ?? process.env.APP_URL ?? api).replace(/\/$/, "");

async function apiCall(method: string, path: string, body?: unknown) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    if (res.status === 503) throw new Error("the server has no ADMIN_TOKEN configured");
    if (res.status === 401) throw new Error("bad or missing ADMIN_TOKEN");
    throw new Error(`${method} ${path} failed: ${res.status} ${text}`);
  }
  return text ? (JSON.parse(text) as unknown) : null;
}

type User = {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
  disabled: boolean;
};

const when = (ms: number | null) => (ms ? new Date(ms).toISOString().slice(0, 10) : "—");

function printClaim(id: string, key: string, name: string) {
  console.log(`\n  created ${id}${name ? ` (${name})` : ""}\n`);
  console.log(`  key   ${key}`);
  console.log(`  link  ${baseUrl}/claim#${key}\n`);
  console.log(
    "  The key is shown once and is not stored. Send the link; save a copy for yourself.",
  );
}

async function create() {
  const name = arg("name") ?? "";
  const user = (await apiCall("POST", "/api/admin/users", { name })) as {
    id: string;
    key: string;
    name: string;
  };
  printClaim(user.id, user.key, user.name);
}

async function list() {
  const { users } = (await apiCall("GET", "/api/admin/users")) as { users: User[] };
  if (users.length === 0) {
    console.log("no accounts yet");
    return;
  }
  console.log(`${users.length} account${users.length === 1 ? "" : "s"}\n`);
  for (const u of users) {
    const state = u.disabled ? "disabled" : "active";
    console.log(
      `  ${u.id}  ${u.name || "(no name)"}  ${state}  created ${when(u.createdAt)}  seen ${when(u.lastSeenAt)}`,
    );
  }
}

async function rotate() {
  requireId();
  const out = (await apiCall("POST", `/api/admin/users/${id}/rotate`)) as { key: string };
  console.log(`\n  rotated ${id}\n`);
  console.log(`  new key   ${out.key}`);
  console.log(`  new link  ${baseUrl}/claim#${out.key}\n`);
  console.log("  All sessions for this account were signed out.");
}

function requireId() {
  if (!id) throw new Error("this command needs a user id (see `list`)");
}

async function setDisabled(disabled: boolean) {
  requireId();
  await apiCall("POST", `/api/admin/users/${id}/${disabled ? "disable" : "enable"}`);
  console.log(`${disabled ? "disabled" : "enabled"} ${id}`);
}

async function remove() {
  requireId();
  const answer = await confirm(`Delete ${id} and all its progress? [y/N] `);
  if (!answer) {
    console.log("cancelled");
    return;
  }
  await apiCall("DELETE", `/api/admin/users/${id}`);
  console.log(`deleted ${id}`);
}

function confirm(prompt: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test(answer.trim()));
    }),
  );
}

const commands: Record<string, () => Promise<void>> = {
  create,
  list,
  rotate,
  disable: () => setDisabled(true),
  enable: () => setDisabled(false),
  delete: remove,
};

async function main() {
  if (!command || !commands[command]) {
    console.error(
      "usage: admin <create [--name N] | list | rotate <id> | disable <id> | enable <id> | delete <id>>\n" +
        "  options: --api <url> --token <token> --base-url <url>",
    );
    process.exit(1);
  }
  if (!token) throw new Error("no admin token (set ADMIN_TOKEN or pass --token)");
  await commands[command]();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
