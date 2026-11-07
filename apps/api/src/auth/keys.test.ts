import { describe, expect, it } from "vitest";
import { hashSecret, newLoginKey, newSessionToken, normalizeKey, timingSafeEqual } from "./keys";

describe("keys", () => {
  it("makes UUID-shaped login keys that differ every time", () => {
    const a = newLoginKey();
    const b = newLoginKey();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });

  it("makes url-safe session tokens", () => {
    expect(newSessionToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("normalizes case and separators so a pasted key still matches", () => {
    const key = newLoginKey();
    expect(normalizeKey(key.toUpperCase())).toBe(normalizeKey(key));
    expect(normalizeKey(key.replace(/-/g, ""))).toBe(normalizeKey(key));
    expect(normalizeKey(` ${key} `)).toBe(normalizeKey(key));
  });

  it("hashes deterministically and changes with the pepper", async () => {
    const value = "abc";
    expect(await hashSecret("p1", value)).toBe(await hashSecret("p1", value));
    expect(await hashSecret("p1", value)).not.toBe(await hashSecret("p2", value));
    expect(await hashSecret("p1", value)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("compares tokens without leaking length", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
    expect(timingSafeEqual("abc", "abd")).toBe(false);
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });
});
