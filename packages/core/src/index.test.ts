import { describe, expect, it } from "vitest";
import { healthStatus } from "./index";

describe("healthStatus", () => {
  it("reports ok with the injected time", () => {
    expect(healthStatus("api", 123)).toEqual({ ok: true, service: "api", time: 123 });
  });
});
