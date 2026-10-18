import type { AnswerEvent } from "@simata/core";
import { describe, expect, it } from "vitest";
import type { EventStore, KvStore } from "../ports";

let n = 0;
const user = () => `u${Date.now()}-${n++}`;

export function ev(id: string, o: Partial<AnswerEvent> = {}): AnswerEvent {
  return {
    id,
    questionId: "ΟΡΓΑΝΑ 16",
    correct: true,
    durationMs: 4200,
    guessed: false,
    mode: "train",
    at: 1_700_000_000_000,
    deviceId: "phone",
    ...o,
  };
}

/** Behaviour every EventStore/KvStore implementation must have, whatever database is behind it. */
export function storesContract(
  name: string,
  make: () => Promise<{ events: EventStore; kv: KvStore }>,
) {
  describe(`EventStore contract: ${name}`, () => {
    it("round-trips every field, with the log position as seq", async () => {
      const { events } = await make();
      const u = user();
      const e = ev("a", {
        correct: false,
        guessed: true,
        mode: "weak",
        durationMs: 123,
        at: 5,
        deviceId: "pc",
      });
      expect(await events.append(u, [e])).toBe(1);
      const [got] = await events.since(u, 0, 10);
      expect(got).toMatchObject(e);
      expect(got?.seq).toBeGreaterThan(0);
    });

    it("ignores event ids it already has, so replays change nothing", async () => {
      const { events } = await make();
      const u = user();
      expect(await events.append(u, [ev("a"), ev("b")])).toBe(2);
      expect(await events.append(u, [ev("a"), ev("b"), ev("c")])).toBe(1);
      expect((await events.since(u, 0, 10)).map((e) => e.id)).toEqual(["a", "b", "c"]);
    });

    it("pages by cursor in insertion order", async () => {
      const { events } = await make();
      const u = user();
      await events.append(u, [ev("a"), ev("b"), ev("c"), ev("d")]);
      const first = await events.since(u, 0, 2);
      expect(first.map((e) => e.id)).toEqual(["a", "b"]);
      const rest = await events.since(u, first[1]?.seq ?? 0, 10);
      expect(rest.map((e) => e.id)).toEqual(["c", "d"]);
      expect(await events.since(u, rest[1]?.seq ?? 0, 10)).toEqual([]);
    });

    it("keeps users apart, even for the same event id", async () => {
      const { events } = await make();
      const [a, b] = [user(), user()];
      await events.append(a, [ev("same")]);
      expect(await events.append(b, [ev("same")])).toBe(1);
      expect(await events.since(a, 0, 10)).toHaveLength(1);
      expect(await events.since(b, 0, 10)).toHaveLength(1);
    });

    it("stores a large batch", async () => {
      const { events } = await make();
      const u = user();
      const many = Array.from({ length: 250 }, (_, i) => ev(`e${String(i).padStart(4, "0")}`));
      expect(await events.append(u, many)).toBe(250);
      expect(await events.since(u, 0, 1000)).toHaveLength(250);
    });

    it("accepts an empty append", async () => {
      const { events } = await make();
      expect(await events.append(user(), [])).toBe(0);
    });
  });

  describe(`KvStore contract: ${name}`, () => {
    it("round-trips entries, including non-ASCII keys", async () => {
      const { kv } = await make();
      const u = user();
      await kv.put(u, [{ key: "note:ΟΡΓΑΝΑ 16", value: '{"t":"νεκρή γωνία"}', updatedAt: 10 }]);
      const got = await kv.since(u, 0);
      expect(got).toHaveLength(1);
      expect(got[0]).toMatchObject({
        key: "note:ΟΡΓΑΝΑ 16",
        value: '{"t":"νεκρή γωνία"}',
        updatedAt: 10,
      });
    });

    it("last write wins by updatedAt; stale and equal writes are ignored", async () => {
      const { kv } = await make();
      const u = user();
      await kv.put(u, [{ key: "k", value: "v2", updatedAt: 20 }]);
      await kv.put(u, [{ key: "k", value: "old", updatedAt: 10 }]);
      await kv.put(u, [{ key: "k", value: "tie", updatedAt: 20 }]);
      expect((await kv.since(u, 0))[0]?.value).toBe("v2");
      await kv.put(u, [{ key: "k", value: "v3", updatedAt: 30 }]);
      expect((await kv.since(u, 0))[0]?.value).toBe("v3");
    });

    it("since(rev) returns only real changes", async () => {
      const { kv } = await make();
      const u = user();
      await kv.put(u, [
        { key: "a", value: "1", updatedAt: 1 },
        { key: "b", value: "1", updatedAt: 1 },
      ]);
      const all = await kv.since(u, 0);
      const top = Math.max(...all.map((e) => e.rev));
      expect(await kv.since(u, top)).toEqual([]);

      await kv.put(u, [{ key: "a", value: "0", updatedAt: 0 }]); // stale: no change
      expect(await kv.since(u, top)).toEqual([]);

      await kv.put(u, [{ key: "b", value: "2", updatedAt: 2 }]);
      const changed = await kv.since(u, top);
      expect(changed.map((e) => [e.key, e.value])).toEqual([["b", "2"]]);
      expect(changed[0]?.rev).toBeGreaterThan(top);
    });

    it("keeps users apart", async () => {
      const { kv } = await make();
      const [a, b] = [user(), user()];
      await kv.put(a, [{ key: "k", value: "A", updatedAt: 1 }]);
      await kv.put(b, [{ key: "k", value: "B", updatedAt: 1 }]);
      expect((await kv.since(a, 0))[0]?.value).toBe("A");
      expect((await kv.since(b, 0))[0]?.value).toBe("B");
    });
  });
}
