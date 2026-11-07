import type { Bank } from "@simata/core";
import { getMeta, type SimataDb, setMeta } from "./db";
import { log } from "./log";

type Cached = { etag: string; bank: Bank };

/** The bank stored on this device, if any. Works offline. */
export async function cachedBank(d: SimataDb): Promise<Bank | null> {
  return (await getMeta<Cached | null>(d, "bank", null))?.bank ?? null;
}

/** Ask the server for a newer bank; fall back to the cached one when offline. */
export async function refreshBank(d: SimataDb, f: typeof fetch = fetch): Promise<Bank | null> {
  const cached = await getMeta<Cached | null>(d, "bank", null);
  log("bank", "request", { hadCache: cached !== null });
  try {
    const res = await f("/api/bank", {
      headers: cached ? { "If-None-Match": cached.etag } : {},
    });
    if (res.status === 304 && cached) {
      log("bank", "not modified");
      return cached.bank;
    }
    if (!res.ok) throw new Error(`bank ${res.status}`);
    const bank = (await res.json()) as Bank;
    await setMeta(d, "bank", { etag: res.headers.get("etag") ?? `"${bank.version}"`, bank });
    log("bank", "updated", { version: bank.version, questions: bank.questions.length });
    return bank;
  } catch (e) {
    log("bank", "fetch failed, using cache", {
      error: e instanceof Error ? e.message : String(e),
      hadCache: cached !== null,
    });
    return cached?.bank ?? null;
  }
}

/** URL of a question image served by the api, e.g. "media/<sha>.jpg" -> "/api/media/<sha>.jpg". */
export function imageUrl(key: string): string {
  return `/api/${key}`;
}
