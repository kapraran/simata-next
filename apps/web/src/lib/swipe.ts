export type Sort = "hard" | "next" | "easy";

/** Which way a drag points, once it is past `t` pixels. Up is easy, left hard, right next. */
export function swipeDirection(dx: number, dy: number, t: number): Sort | null {
  if (dy < -t && -dy > Math.abs(dx)) return "easy";
  if (dx > t) return "next";
  if (dx < -t) return "hard";
  return null;
}
