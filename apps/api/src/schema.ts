import { z } from "zod";

export const eventSchema = z.object({
  id: z.string().min(1).max(64),
  questionId: z.string().min(1).max(100),
  correct: z.boolean(),
  durationMs: z.number().int().min(0).max(3_600_000),
  guessed: z.boolean(),
  mode: z.enum(["train", "sweep", "weak", "category", "exam", "legacy"]),
  at: z.number().int().min(0),
  deviceId: z.string().min(1).max(64),
});

export const kvSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.string().max(64 * 1024),
  updatedAt: z.number().int().min(0),
});

export const syncRequest = z.object({
  /** Highest event seq this device has already received. */
  cursor: z.number().int().min(0).default(0),
  /** Highest kv revision this device has already received. */
  kvRev: z.number().int().min(0).default(0),
  events: z.array(eventSchema).max(1000).default([]),
  kv: z.array(kvSchema).max(500).default([]),
});

export type SyncRequest = z.infer<typeof syncRequest>;
