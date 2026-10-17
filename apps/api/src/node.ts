import { serve } from "@hono/node-server";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 3001);
const app = createApp({ clock: () => Date.now() });

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`api listening on :${info.port}`);
});
