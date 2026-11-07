import { log } from "./log";

/** The account as the client sees it. */
export type Me = { id: string; name: string };

/** Why a login failed, so the UI can say something specific. */
export type LoginError = "invalid" | "throttled" | "offline" | "server";

/** Where the browser remembers which account this device last used, for offline boot. */
const USER_ID_KEY = "simata:userId";
const USER_NAME_KEY = "simata:userName";

export function cachedUser(): Me | null {
  try {
    const id = localStorage.getItem(USER_ID_KEY);
    if (!id) return null;
    return { id, name: localStorage.getItem(USER_NAME_KEY) ?? "" };
  } catch {
    return null;
  }
}

export function rememberUser(user: Me | null) {
  try {
    if (user) {
      localStorage.setItem(USER_ID_KEY, user.id);
      localStorage.setItem(USER_NAME_KEY, user.name);
    } else {
      localStorage.removeItem(USER_ID_KEY);
      localStorage.removeItem(USER_NAME_KEY);
    }
  } catch {
    // Private mode: the session still works, it just won't survive a reload.
  }
}

const TIMEOUT_MS = 15_000;

/** Whether we have already offered the name prompt for an account (so skipping doesn't loop). */
export function nameAsked(userId: string): boolean {
  try {
    return localStorage.getItem(`simata:nameAsked:${userId}`) === "1";
  } catch {
    return false;
  }
}

export function markNameAsked(userId: string): void {
  try {
    localStorage.setItem(`simata:nameAsked:${userId}`, "1");
  } catch {
    // Nothing to persist; the prompt may reappear, which is harmless.
  }
}

/** Result of asking the server who we are, with "offline" kept apart from "not logged in". */
export type MeResult = { kind: "ok"; user: Me } | { kind: "anon" } | { kind: "offline" };

async function call(path: string, init?: RequestInit): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(init?.body ? { "content-type": "application/json" } : {}),
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

export const api = {
  async me(): Promise<MeResult> {
    try {
      const res = await call("/api/me");
      if (res.status === 401) return { kind: "anon" };
      if (!res.ok) return { kind: "offline" };
      return { kind: "ok", user: (await res.json()) as Me };
    } catch (e) {
      log("auth", "me unreachable", { error: e instanceof Error ? e.message : String(e) });
      return { kind: "offline" };
    }
  },

  async login(key: string): Promise<{ ok: true; user: Me } | { ok: false; error: LoginError }> {
    try {
      const res = await call("/api/auth/login", { method: "POST", body: JSON.stringify({ key }) });
      if (res.status === 401) return { ok: false, error: "invalid" };
      if (res.status === 429) return { ok: false, error: "throttled" };
      if (!res.ok) return { ok: false, error: "server" };
      return { ok: true, user: (await res.json()) as Me };
    } catch {
      return { ok: false, error: "offline" };
    }
  },

  async logout(): Promise<void> {
    try {
      await call("/api/auth/logout", { method: "POST" });
    } catch {
      // A failed logout still signs out locally; the session expires on its own.
    }
  },

  async setName(name: string): Promise<Me | null> {
    try {
      const res = await call("/api/me", { method: "PATCH", body: JSON.stringify({ name }) });
      if (!res.ok) return null;
      return (await res.json()) as Me;
    } catch {
      return null;
    }
  },
};

/** The fragment of a claim link (`/claim#<key>`), if this page load came from one. */
export function claimKeyFromUrl(): string | null {
  const raw = location.hash.replace(/^#/, "").trim();
  if (!raw) return null;
  const value = raw.startsWith("key=") ? raw.slice(4) : raw;
  return /^[0-9a-f-]{32,40}$/i.test(value) ? value : null;
}

/** Erase the key from the address bar and history once it has been used. */
export function clearClaimFragment() {
  try {
    history.replaceState(null, "", location.pathname + location.search);
  } catch {
    location.hash = "";
  }
}
