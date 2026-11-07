import { type D1Like, d1SqlDb } from "./adapters/d1";
import { R2BlobStore, type R2Like } from "./adapters/r2-blob";
import { SqlEventStore, SqlKvStore } from "./adapters/sql";
import { createApp } from "./app";
import { SqlSessionStore, SqlUserStore } from "./auth/store";

/** Bindings + vars provided by wrangler.jsonc. Secrets are set with `wrangler secret put`. */
export type Env = {
  DB: D1Like;
  MEDIA: R2Like;
  /** HMAC pepper for hashing login keys and session tokens. Required. */
  AUTH_PEPPER?: string;
  /** Bearer token for the admin API. Unset = admin disabled. */
  ADMIN_TOKEN?: string;
  /** Workers Static Assets binding (serves the built web app). */
  ASSETS?: { fetch(request: Request): Promise<Response> };
};

// Bindings are stable for the isolate, so build the app once per env.
const apps = new WeakMap<object, ReturnType<typeof createApp>>();

function appFor(env: Env) {
  let app = apps.get(env);
  if (!app) {
    const sql = d1SqlDb(env.DB);
    app = createApp({
      clock: () => Date.now(),
      events: new SqlEventStore(sql),
      kv: new SqlKvStore(sql),
      blobs: new R2BlobStore(env.MEDIA),
      users: new SqlUserStore(sql),
      sessions: new SqlSessionStore(sql),
      pepper: env.AUTH_PEPPER ?? "",
      adminToken: env.ADMIN_TOKEN ?? "",
    });
    apps.set(env, app);
  }
  return app;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return appFor(env).fetch(request);
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};
