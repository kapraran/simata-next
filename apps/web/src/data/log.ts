/**
 * Small on-device log so a learner can copy it from Settings and share it.
 * Kept in localStorage (not IndexedDB) so it still works when the database is the problem.
 */

export type LogEntry = {
  t: string;
  area: string;
  msg: string;
  data?: unknown;
};

const KEY = "simata:log";
const MAX = 400;

function read(): LogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as LogEntry[];
  } catch {
    return [];
  }
}

export function log(area: string, msg: string, data?: unknown) {
  const entry: LogEntry = { t: new Date().toISOString(), area, msg, data };
  try {
    const entries = read();
    entries.push(entry);
    localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX)));
  } catch {
    // Storage full or unavailable: logging must never break the app.
  }
}

export function logCount(): number {
  return read().length;
}

export function clearLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}

/** Plain text with a header about the device, ready to paste into a chat. */
export function formatLog(): string {
  const header = [
    `Simata log`,
    `time: ${new Date().toISOString()}`,
    `url: ${location.href}`,
    `standalone: ${matchMedia("(display-mode: standalone)").matches}`,
    `online: ${navigator.onLine}`,
    `userAgent: ${navigator.userAgent}`,
    "",
  ];
  const lines = read().map((e) => {
    const data = e.data === undefined ? "" : ` ${JSON.stringify(e.data)}`;
    return `${e.t} [${e.area}] ${e.msg}${data}`;
  });
  return [...header, ...lines].join("\n");
}

/** Record uncaught errors and connectivity changes for the whole session. */
export function installGlobalLogging() {
  window.addEventListener("error", (e) => log("error", e.message, `${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) =>
    log("error", "unhandled rejection", String(e.reason)),
  );
  window.addEventListener("online", () => log("net", "online"));
  window.addEventListener("offline", () => log("net", "offline"));
  log("app", "start", { visibility: document.visibilityState });
}
