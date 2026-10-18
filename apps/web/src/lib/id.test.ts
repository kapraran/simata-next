import { describe, expect, it } from "vitest";
import { newId } from "./id";

describe("newId", () => {
  it("is 26 chars of Crockford base32", () => {
    expect(newId()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
  it("sorts by time", () => {
    const [a, b, c] = [newId(1000), newId(2000), newId(3000)];
    expect([c, a, b].sort()).toEqual([a, b, c]);
    expect(newId(1000) < newId(1001)).toBe(true);
  });
  it("differs for the same millisecond", () => {
    expect(newId(5)).not.toBe(newId(5));
  });
});
