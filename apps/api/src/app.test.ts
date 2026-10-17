import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("GET /api/health", () => {
  it("returns ok with the injected clock", async () => {
    const app = createApp({ clock: () => 42 });
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, service: "api", time: 42 });
  });
});
