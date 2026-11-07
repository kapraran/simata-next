import type { Flag, Mode } from "@simata/core";
import { newId } from "../lib/id";
import { getMeta, type SimataDb, setMeta } from "./db";
import type { ExamResult } from "./exams";
import { log } from "./log";
import type { Settings } from "./settings";
import { requestSync } from "./sync";

export async function getDeviceId(d: SimataDb): Promise<string> {
  const existing = await getMeta<string | null>(d, "deviceId", null);
  if (existing) return existing;
  const id = `web-${newId().slice(-8).toLowerCase()}`;
  await setMeta(d, "deviceId", id);
  return id;
}

export async function recordAnswer(
  d: SimataDb,
  a: { questionId: string; correct: boolean; durationMs: number; guessed: boolean; mode: Mode },
) {
  const now = Date.now();
  await d.events.add({
    id: newId(now),
    ...a,
    durationMs: Math.max(0, Math.round(a.durationMs)),
    at: now,
    deviceId: await getDeviceId(d),
    pending: 1,
  });
  log("write", "answer saved", { questionId: a.questionId, correct: a.correct, mode: a.mode });
  requestSync(d);
}

async function putKv(d: SimataDb, key: string, value: string) {
  await d.kv.put({ key, value, updatedAt: Date.now(), dirty: 1 });
  log("write", "setting saved", { key });
  requestSync(d);
}

/** null clears the flag. */
export const setFlag = (d: SimataDb, questionId: string, flag: Flag | null) =>
  putKv(d, `flag:${questionId}`, flag ?? "");

export const setNote = (d: SimataDb, questionId: string, text: string) =>
  putKv(d, `note:${questionId}`, text);

export const saveSettings = (d: SimataDb, s: Settings) => putKv(d, "settings", JSON.stringify(s));

export const saveExam = (d: SimataDb, r: ExamResult) => putKv(d, `exam:${r.at}`, JSON.stringify(r));
