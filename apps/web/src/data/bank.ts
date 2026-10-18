import type { Bank } from "@simata/core";
import { getMeta, type SimataDb, setMeta } from "./db";

type Cached = { etag: string; bank: Bank };

/** The bank stored on this device, if any. Works offline. */
export async function cachedBank(d: SimataDb): Promise<Bank | null> {
  return (await getMeta<Cached | null>(d, "bank", null))?.bank ?? null;
}

/** Ask the server for a newer bank; fall back to the cached one when offline. */
export async function refreshBank(d: SimataDb, f: typeof fetch = fetch): Promise<Bank | null> {
  const cached = await getMeta<Cached | null>(d, "bank", null);
  try {
    const res = await f("/api/bank", {
      headers: cached ? { "If-None-Match": cached.etag } : {},
    });
    if (res.status === 304 && cached) return cached.bank;
    if (!res.ok) throw new Error(`bank ${res.status}`);
    const bank = (await res.json()) as Bank;
    await setMeta(d, "bank", { etag: res.headers.get("etag") ?? `"${bank.version}"`, bank });
    return bank;
  } catch {
    return cached?.bank ?? null;
  }
}

/** URL of a question image served by the api, e.g. "media/<sha>.jpg" -> "/api/media/<sha>.jpg". */
export function imageUrl(key: string): string {
  return `/api/${key}`;
}
