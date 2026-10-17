import { healthStatus } from "@simata/core";
import { Hono } from "hono";

export type Ports = {
  clock: () => number;
};

// The app only knows ports. Each entrypoint (node.ts, later worker.ts) wires concrete adapters.
export function createApp(ports: Ports) {
  const app = new Hono();

  app.get("/api/health", (c) => c.json(healthStatus("api", ports.clock())));

  return app;
}
