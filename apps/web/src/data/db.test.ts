import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { getDb } from "./db";

describe("per-account databases", () => {
  it("namespaces the database per account", () => {
    const a = getDb("user-a");
    const b = getDb("user-b");
    expect(a.name).toBe("simata:user-a");
    expect(b.name).toBe("simata:user-b");
    expect(a).not.toBe(b);
  });

  it("reuses one connection per account", () => {
    expect(getDb("user-a")).toBe(getDb("user-a"));
  });
});
