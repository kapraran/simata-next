export type HealthStatus = { ok: true; service: string; time: number };

export function healthStatus(service: string, now: number): HealthStatus {
  return { ok: true, service, time: now };
}

export * from "./bank";
export * from "./events";
export * from "./fold";
export * from "./grade";
export * from "./legacy";
export * from "./passchance";
export * from "./rng";
export * from "./scheduler";
export * from "./session";
