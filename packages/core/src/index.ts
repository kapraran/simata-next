export type HealthStatus = { ok: true; service: string; time: number };

export function healthStatus(service: string, now: number): HealthStatus {
  return { ok: true, service, time: now };
}
export * from "./bank";
