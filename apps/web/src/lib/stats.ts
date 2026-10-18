import {
  type AnswerEvent,
  foldEvents,
  MAX_PLAUSIBLE_MS,
  mulberry32,
  type Progress,
  passChance,
  type Question,
} from "@simata/core";
import { localDayRange } from "./time";

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(at: number): string {
  const d = new Date(at);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export type DayStat = { day: string; answers: number; accuracy: number };

/** Answers and accuracy (0-100) for each day in the last `days` days that has answers. Exams count too. */
export function dailyStats(events: readonly AnswerEvent[], now: number, days = 30): DayStat[] {
  const [todayStart] = localDayRange(now);
  const from = new Date(todayStart).setDate(new Date(todayStart).getDate() - (days - 1));
  const byDay = new Map<string, { n: number; right: number }>();
  for (const e of events) {
    if (e.at < from || e.at >= now + 1) continue;
    const k = dayKey(e.at);
    const s = byDay.get(k) ?? { n: 0, right: 0 };
    s.n++;
    if (e.correct) s.right++;
    byDay.set(k, s);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([day, s]) => ({ day, answers: s.n, accuracy: Math.round((s.right / s.n) * 100) }));
}

export type CategoryStat = {
  category: string;
  total: number;
  seen: number;
  /** Average chance of recalling a question in this category right now, 0-1. Unseen counts as 0. */
  mastery: number;
};

export function categoryMastery(
  questions: readonly Question[],
  progress: Progress,
  now: number,
): CategoryStat[] {
  const cats = new Map<string, { total: number; seen: number; sum: number }>();
  for (const q of questions) {
    if (q.disabled) continue;
    const c = cats.get(q.category) ?? { total: 0, seen: 0, sum: 0 };
    c.total++;
    const s = progress.states.get(q.id);
    if (s) {
      c.seen++;
      c.sum += progress.scheduler.retrievability(s.card, now);
    }
    cats.set(q.category, c);
  }
  return [...cats.entries()]
    .map(([category, c]) => ({
      category,
      total: c.total,
      seen: c.seen,
      mastery: c.total ? c.sum / c.total : 0,
    }))
    .sort((a, b) => a.mastery - b.mastery);
}

export type Trouble = {
  mostMissed: { id: string; misses: number; seen: number }[];
  slowest: { id: string; avgMs: number; seen: number }[];
};

/** Questions you miss most and the ones you take longest over (needs 2+ answers to call it slow). */
export function trouble(events: readonly AnswerEvent[], limit = 5): Trouble {
  const per = new Map<string, { seen: number; misses: number; ms: number; timed: number }>();
  for (const e of events) {
    const s = per.get(e.questionId) ?? { seen: 0, misses: 0, ms: 0, timed: 0 };
    s.seen++;
    if (!e.correct) s.misses++;
    if (e.durationMs <= MAX_PLAUSIBLE_MS) {
      s.timed++;
      s.ms += e.durationMs;
    }
    per.set(e.questionId, s);
  }
  const rows = [...per.entries()];
  return {
    mostMissed: rows
      .filter(([, s]) => s.misses > 0)
      .sort((a, b) => b[1].misses - a[1].misses || b[1].seen - a[1].seen)
      .slice(0, limit)
      .map(([id, s]) => ({ id, misses: s.misses, seen: s.seen })),
    slowest: rows
      .filter(([, s]) => s.timed >= 2)
      .map(([id, s]) => ({ id, avgMs: Math.round(s.ms / s.timed), seen: s.seen }))
      .sort((a, b) => b.avgMs - a.avgMs)
      .slice(0, limit),
  };
}

export type TrendPoint = { day: string; chance: number };

/**
 * Pass chance as it stood at the end of each recent day with activity, replayed from the log.
 * Percent, 0-100.
 */
export function passChanceTrend(
  events: readonly AnswerEvent[],
  questions: readonly Question[],
  now: number,
  opts: { days?: number; sims?: number } = {},
): TrendPoint[] {
  const days = opts.days ?? 30;
  const sims = opts.sims ?? 300;
  const sorted = [...events].sort((a, b) => a.at - b.at);
  const active = dailyStats(sorted, now, days).map((d) => d.day);
  return active.map((day) => {
    const [, end] = localDayRange(new Date(`${day}T12:00:00`).getTime());
    const at = Math.min(end, now);
    const upTo = sorted.filter((e) => e.at < end);
    const chance = passChance(questions, foldEvents(upTo), at, mulberry32(7), { sims });
    return { day, chance: Math.round(chance * 100) };
  });
}
