import { type Bank, type Flag, foldEvents, type Progress, type Question } from "@simata/core";
import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { cachedBank, refreshBank } from "./bank";
import { db, type LocalEvent } from "./db";
import { type ExamResult, parseExam } from "./exams";
import { log } from "./log";
import { DEFAULT_SETTINGS, parseSettings, type Settings } from "./settings";
import { type SyncState, syncNow, syncStore } from "./sync";

export type Learner = {
  /** False until the bank, events and settings have been read from this device. */
  ready: boolean;
  bank: Bank | null;
  /** Bank has been read and there is nothing on the server or the device. */
  noBank: boolean;
  questions: readonly Question[];
  byId: ReadonlyMap<string, Question>;
  progress: Progress;
  flags: Readonly<Record<string, Flag>>;
  notes: Readonly<Record<string, string>>;
  settings: Settings;
  pendingCount: number;
  events: readonly LocalEvent[];
  exams: readonly ExamResult[];
};

const Ctx = createContext<Learner | null>(null);

export function useLearner(): Learner {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLearner outside LearnerProvider");
  return v;
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(syncStore.subscribe, syncStore.get);
}

const EMPTY_QUESTIONS: readonly Question[] = [];

/** Local reads that feed the pages. A read that never logs its line is a read that hung. */
async function timedRead<T extends unknown[]>(name: string, read: () => Promise<T>): Promise<T> {
  const started = Date.now();
  const rows = await read();
  log("data", `${name} read`, { ms: Date.now() - started, rows: rows.length });
  return rows;
}

export function LearnerProvider({ children }: { children: ReactNode }) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [bankLoaded, setBankLoaded] = useState(false);

  // Show the cached bank straight away, then ask the server whether there is a newer one.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const started = Date.now();
      const cached = await cachedBank(db);
      log("bank", "cached read", { ms: Date.now() - started, hit: cached !== null });
      if (alive && cached) setBank(cached);
      const fresh = await refreshBank(db);
      if (alive && fresh) setBank(fresh);
      if (alive) setBankLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Keep devices in step: on start, when we come back online or into view, and every minute.
  useEffect(() => {
    const go = (reason: string) => {
      log("sync", "trigger", { reason });
      void syncNow(db);
    };
    go("start");
    const onOnline = () => go("online");
    const onVisible = () => document.visibilityState === "visible" && go("visible");
    const onTick = () => go("interval");
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    const timer = setInterval(onTick, 60_000);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(timer);
    };
  }, []);

  const events = useLiveQuery(() => timedRead("events", () => db.events.toArray()), []);
  const kvRows = useLiveQuery(() => timedRead("kv", () => db.kv.toArray()), []);

  const progress = useMemo(() => foldEvents(events ?? []), [events]);
  const pendingCount = useMemo(
    () => (events ?? []).filter((e) => e.pending === 1).length,
    [events],
  );

  const { flags, notes, settings, exams } = useMemo(() => {
    const exams: ExamResult[] = [];
    const flags: Record<string, Flag> = {};
    const notes: Record<string, string> = {};
    let settingsRaw: string | undefined;
    for (const r of kvRows ?? []) {
      if (r.key.startsWith("flag:") && (r.value === "hard" || r.value === "easy")) {
        flags[r.key.slice(5)] = r.value;
      } else if (r.key.startsWith("note:") && r.value) notes[r.key.slice(5)] = r.value;
      else if (r.key === "settings") settingsRaw = r.value;
      else if (r.key.startsWith("exam:")) {
        const x = parseExam(r.value);
        if (x) exams.push(x);
      }
    }
    return { flags, notes, exams, settings: parseSettings(settingsRaw) };
  }, [kvRows]);

  const questions = bank?.questions ?? EMPTY_QUESTIONS;
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions]);

  const ready = (bank !== null || bankLoaded) && events !== undefined && kvRows !== undefined;
  useEffect(() => {
    if (ready) log("app", "data ready", { bank: bank !== null, bankLoaded });
  }, [ready, bank, bankLoaded]);

  const value: Learner = {
    ready,
    bank,
    noBank: bankLoaded && bank === null,
    questions,
    byId,
    progress,
    flags,
    notes,
    settings: settings ?? DEFAULT_SETTINGS,
    pendingCount,
    events: events ?? [],
    exams,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
