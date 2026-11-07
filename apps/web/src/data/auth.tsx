import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  api,
  cachedUser,
  claimKeyFromUrl,
  clearClaimFragment,
  type LoginError,
  type Me,
  markNameAsked,
  nameAsked,
  rememberUser,
} from "./authApi";
import { clearLegacyDbOnce, getDb, type SimataDb } from "./db";
import { log } from "./log";

export type AuthStatus = "loading" | "anon" | "authed";
export type { LoginError };

type Auth = {
  status: AuthStatus;
  user: Me | null;
  db: SimataDb | null;
  /** An account without a display name yet, so the app can ask for one. */
  needsName: boolean;
  /** Why an invite link failed to claim, to show on the login screen. */
  claimError: LoginError | null;
  login: (key: string) => Promise<{ ok: true } | { ok: false; error: LoginError }>;
  logout: () => Promise<void>;
  setName: (name: string) => Promise<void>;
  /** Dismiss the name prompt without setting a name. */
  skipName: () => void;
  /** Re-check the session, e.g. after the server rejected a sync with 401. */
  refresh: () => Promise<void>;
};

const Ctx = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [claimError, setClaimError] = useState<LoginError | null>(null);
  /** The account whose name prompt has been answered or skipped this session. */
  const [nameDoneFor, setNameDoneFor] = useState<string | null>(null);

  const apply = useCallback((next: Me | null) => {
    setUser(next);
    rememberUser(next);
    setStatus(next ? "authed" : "anon");
  }, []);

  /** Ask the server who we are; fall back to the remembered account only when the network is down. */
  const load = useCallback(async () => {
    const result = await api.me();
    if (result.kind === "ok") {
      apply(result.user);
      return;
    }
    if (result.kind === "anon") {
      apply(null);
      return;
    }
    // Offline: trust the remembered account so the app keeps working; without one, show login.
    const cached = cachedUser();
    apply(cached);
    if (!cached) log("auth", "offline with no remembered account");
  }, [apply]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      await clearLegacyDbOnce();

      // A claim link logs in straight away, then the key is wiped from the address bar.
      const claimKey = claimKeyFromUrl();
      if (claimKey) {
        log("auth", "claiming account");
        const r = await api.login(claimKey);
        clearClaimFragment();
        if (!r.ok) {
          log("auth", "claim failed", { error: r.error });
          if (alive) setClaimError(r.error);
        }
      }

      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  // A 401 from the sync layer means the session is gone.
  useEffect(() => {
    const onExpired = () => {
      log("auth", "session expired");
      void load();
    };
    window.addEventListener("simata:session-expired", onExpired);
    return () => window.removeEventListener("simata:session-expired", onExpired);
  }, [load]);

  const login = useCallback(
    async (key: string) => {
      const r = await api.login(key);
      if (r.ok) {
        setClaimError(null);
        apply(r.user);
      } else setClaimError(r.error);
      return r.ok ? ({ ok: true } as const) : ({ ok: false, error: r.error } as const);
    },
    [apply],
  );

  const logout = useCallback(async () => {
    await api.logout();
    apply(null);
  }, [apply]);

  const setName = useCallback(
    async (name: string) => {
      const updated = await api.setName(name);
      if (updated) apply(updated);
      if (user) {
        markNameAsked(user.id);
        setNameDoneFor(user.id);
      }
    },
    [apply, user],
  );

  const skipName = useCallback(() => {
    if (user) {
      markNameAsked(user.id);
      setNameDoneFor(user.id);
    }
  }, [user]);

  const db = useMemo(() => (user ? getDb(user.id) : null), [user]);

  const value: Auth = useMemo(
    () => ({
      status,
      user,
      db,
      needsName:
        user !== null && user.name === "" && nameDoneFor !== user.id && !nameAsked(user.id),
      claimError,
      login,
      logout,
      setName,
      skipName,
      refresh: load,
    }),
    [status, user, db, nameDoneFor, claimError, login, logout, setName, skipName, load],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
