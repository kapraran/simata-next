import { describe, expect, it } from "vitest";
import { swipeDirection } from "./swipe";

describe("swipeDirection", () => {
  it("maps left, right and up past the threshold", () => {
    expect(swipeDirection(-120, 5, 90)).toBe("hard");
    expect(swipeDirection(120, -5, 90)).toBe("next");
    expect(swipeDirection(10, -120, 90)).toBe("easy");
  });

  it("ignores short drags and downward pulls", () => {
    expect(swipeDirection(40, -30, 90)).toBeNull();
    expect(swipeDirection(0, 200, 90)).toBeNull();
  });

  it("a diagonal goes to whichever axis is stronger", () => {
    expect(swipeDirection(-100, -150, 90)).toBe("easy");
    expect(swipeDirection(-150, -100, 90)).toBe("hard");
  });
});
