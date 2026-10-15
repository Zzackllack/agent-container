import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { authentication } from "./auth.js";
import { FileError, Files } from "./files.js";
import type { Settings } from "./config.js";
import type { Overview } from "../shared/types.js";

export async function createApp(config: Settings) {
  const files = new Files(config);
  const auth = await authentication(
    config.state,
    config.publicOrigin?.startsWith("https:") ?? false,
  );
  const app = new Hono();
  app.use(
    "*",
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    }),
  );
  app.use("/api/*", bodyLimit({ maxSize: 160 * 1024 }));
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(c.req.method)) {
      // JSON plus an explicit header makes browser cross-origin writes require
      // a CORS preflight, which this application never grants.
      if (
        c.req.header("X-Agent-Dashboard") !== "1" ||
        !c.req.header("Content-Type")?.startsWith("application/json")
      ) {
        return c.json({ error: "A dashboard JSON request is required." }, 403);
      }
      const origin = c.req.header("Origin");
      if (
        origin &&
        origin !== (config.publicOrigin ?? new URL(c.req.url).origin)
      ) {
        return c.json(
          { error: "This request came from a different origin." },
          403,
        );
      }
    }
    if (c.req.path !== "/api/session" && !(await auth.authenticated(c)))
      return c.json({ error: "Sign in to continue." }, 401);
    await next();
  });
  app.get("/healthz", (c) => c.text("ok"));
  app.get("/api/session", async (c) =>
    c.json({ authenticated: await auth.authenticated(c) }),
  );
  app.post("/api/session", async (c) => {
    const body = z
      .object({ password: z.string().max(256) })
      .parse(await c.req.json());
    if (!auth.matches(body.password))
      return c.json({ error: "Password incorrect." }, 401);
    await auth.login(c);
    return c.json({ authenticated: true });
  });
  app.delete("/api/session", (c) => {
    auth.logout(c);
    return c.json({ authenticated: false });
  });
  app.get("/api/documents", async (c) => c.json(await files.inventory()));
  app.get("/api/document", async (c) =>
    c.json(await files.read(z.string().min(1).parse(c.req.query("id")))),
  );
  app.put("/api/document", async (c) => {
    const body = z
      .object({
        id: z.string().min(1),
        content: z.string(),
        revision: z.string().nullable(),
      })
      .parse(await c.req.json());
    return c.json(await files.save(body.id, body.content, body.revision));
  });
  app.get("/api/history", async (c) => {
    const id = z.string().min(1).parse(c.req.query("id"));
    const backup = c.req.query("backup");
    return c.json(
      backup
        ? { content: await files.backup(id, backup) }
        : await files.history(id),
    );
  });
  app.get("/api/overview", async (c) => {
    const [t3, baseline] = await Promise.all([
      fetch(`${config.t3Internal}/.well-known/t3/environment`, {
        signal: AbortSignal.timeout(2000),
      })
        .then(async (response) => {
          if (!response.ok) return { reachable: false };
          const data: unknown = await response.json();
          const result = z
            .object({ serverVersion: z.string() })
            .safeParse(data);
          return result.success
            ? { reachable: true, version: result.data.serverVersion }
            : { reachable: false };
        })
        .catch(() => ({ reachable: false })),
      Promise.all(
        ["codex", "opencode", "gh"].map(async (tool) => {
          const source = await readFile(
            join(config.versions, `${tool}.env`),
            "utf8",
          ).catch(() => "");
          return [
            tool,
            source.match(/^[A-Z_]+_VERSION=(.+)$/m)?.[1] ?? "Not recorded",
          ] as const;
        }),
      ).then((entries) => Object.fromEntries(entries)),
    ]);
    return c.json({
      t3: { ...t3, url: config.t3Public },
      baseline,
      home: config.home,
      workspace: config.workspace,
    } satisfies Overview);
  });
  app.all("/api/*", (c) => c.json({ error: "Unknown API route." }, 404));
  app.onError((error, c) => {
    if (error instanceof FileError)
      return c.json({ error: error.message }, error.status);
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return c.json({ error: "The request is not valid." }, 400);
    // File contents, tokens, and full parser objects must not reach server logs.
    console.error("Dashboard request failed:", error.name);
    return c.json(
      {
        error:
          "Cannot access this file. Check volume permissions and the configured paths.",
      },
      500,
    );
  });
  return app;
}
