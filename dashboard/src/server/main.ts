import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { settings } from "./config.js";

const config = settings();
const app = await createApp(config);
const client =
  process.env.DASHBOARD_CLIENT ??
  fileURLToPath(new URL("../client/", import.meta.url));
app.use("*", serveStatic({ root: client }));
app.get("*", serveStatic({ path: `${client}/index.html` }));
const server = serve({
  fetch: app.fetch,
  hostname: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3780),
});
console.log(
  "Dashboard ready. Read its password from the private dashboard state volume.",
);
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close();
  });
}
