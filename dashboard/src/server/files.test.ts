import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Files } from "./files.js";
import { createApp } from "./app.js";
import type { Settings } from "./config.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "agent-dashboard-"));
  const config: Settings = {
    home: join(root, "home"),
    workspace: join(root, "workspace"),
    state: join(root, "state"),
    published: join(root, "published/AGENTS.md"),
    t3Internal: "http://127.0.0.1:1",
    t3Public: "http://localhost:3773",
    versions: join(root, "versions"),
  };
  await Promise.all([
    mkdir(join(config.home, ".codex"), { recursive: true }),
    mkdir(join(config.home, ".config/opencode"), { recursive: true }),
    mkdir(join(config.workspace, "project/.git"), { recursive: true }),
    mkdir(join(root, "published")),
  ]);
  await writeFile(join(config.home, ".codex/AGENTS.md"), "# Original\n");
  await writeFile(config.published, "# Git rules\n");
  return {
    config,
    root,
    files: new Files(config),
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("edits preserve revisions and private backups; stale writes are rejected", async () => {
  const f = await fixture();
  try {
    const before = await f.files.read("codex:instructions");
    const saved = await f.files.save(before.id, "# Updated\n", before.revision);
    assert.equal(await readFile(before.path, "utf8"), "# Updated\n");
    assert.notEqual(before.revision, saved.revision);
    assert.equal((await stat(before.path)).mode & 0o777, 0o600);
    await assert.rejects(
      f.files.save(before.id, "stale", before.revision),
      /changed since/,
    );
    const history = await f.files.history(before.id);
    assert.equal(history.length, 1);
    assert.equal(
      await f.files.backup(before.id, history[0].id),
      "# Original\n",
    );
    const [a, b] = await Promise.allSettled([
      f.files.save(before.id, "A", saved.revision),
      f.files.save(before.id, "B", saved.revision),
    ]);
    assert.equal(
      [a, b].filter((result) => result.status === "fulfilled").length,
      1,
    );
  } finally {
    await f.cleanup();
  }
});

test("Git sources, symlinks, path traversal, and credential files cannot be written", async () => {
  const f = await fixture();
  try {
    await symlink(
      f.config.published,
      join(f.config.home, ".config/opencode/AGENTS.md"),
    );
    const linked = await f.files.read("opencode:instructions");
    assert.equal(linked.source, "git");
    assert.equal(linked.content, "# Git rules\n");
    await assert.rejects(
      f.files.save(linked.id, "replace", linked.revision),
      /read-only/,
    );
    await assert.rejects(
      f.files.save("shared:published", "replace", null),
      /Edit the source/,
    );
    await writeFile(join(f.root, "outside.txt"), "private");
    await symlink(
      join(f.root, "outside.txt"),
      join(f.config.home, ".codex/AGENTS.override.md"),
    );
    await assert.rejects(
      f.files.read("codex:override"),
      /Only links to the published/,
    );
    await writeFile(join(f.config.home, ".codex/auth.json"), "private");
    await symlink(
      join(f.config.home, ".codex/auth.json"),
      join(f.config.workspace, "project/AGENTS.md"),
    );
    await assert.rejects(
      f.files.read("project:project/AGENTS.md"),
      /Only links to the published/,
    );
    await symlink(f.root, join(f.config.workspace, "escape"));
    const escaped = await f.files.read("project:escape/AGENTS.md");
    assert.equal(escaped.writable, false);
    assert.equal(escaped.content, "");
    await assert.rejects(
      f.files.read("project:../AGENTS.md"),
      /inside the workspace/,
    );
    await assert.rejects(
      f.files.read("project:project/auth.json"),
      /Only project/,
    );
    await assert.rejects(f.files.read("codex:auth"), /Unknown document/);
  } finally {
    await f.cleanup();
  }
});

test("config validation and project discovery preserve comments and avoid duplicate OpenCode layers", async () => {
  const f = await fixture();
  try {
    await mkdir(join(f.config.workspace, "project/src"), { recursive: true });
    await writeFile(
      join(f.config.workspace, "project/src/AGENTS.md"),
      "# Nested\n",
    );
    const inventory = await f.files.inventory();
    assert(
      inventory.documents.some(
        (file) => file.id === "project:project/AGENTS.md" && !file.exists,
      ),
    );
    assert(
      inventory.documents.some(
        (file) => file.id === "project:project/src/AGENTS.md",
      ),
    );
    const content = '{\n // keep this comment\n "mcp": {"servers": {}},\n}\n';
    const saved = await f.files.save("opencode:config:jsonc", content, null);
    assert.equal(saved.content, content);
    await assert.rejects(
      f.files.save(saved.id, "{ bad", saved.revision),
      /Invalid JSONC/,
    );
    await assert.rejects(
      f.files.save("opencode:config:json", "{}", null),
      /already exists/,
    );
    await assert.rejects(
      f.files.save("codex:config", "model = [", null),
      /Invalid TOML/,
    );
    await f.files.save(
      "codex:config",
      '# keep\nmodel = "fixture-model"\n',
      null,
    );
    await assert.rejects(
      f.files.save("project:project/AGENTS.md", "x".repeat(129 * 1024), null),
      /128 KiB/,
    );
  } finally {
    await f.cleanup();
  }
});

test("API requires a signed session and rejects browser cross-origin writes", async () => {
  const f = await fixture();
  try {
    const app = await createApp(f.config);
    assert.equal((await app.request("/api/documents")).status, 401);
    assert.equal((await app.request("/healthz")).status, 200);
    const password = (
      await readFile(join(f.config.state, "password"), "utf8")
    ).trim();
    assert.equal(
      (await stat(join(f.config.state, "password"))).mode & 0o777,
      0o600,
    );
    const headers = {
      "Content-Type": "application/json",
      "X-Agent-Dashboard": "1",
    };
    assert.equal(
      (
        await app.request("/api/session", {
          method: "POST",
          headers: { ...headers, Origin: "https://other.example" },
          body: JSON.stringify({ password }),
        })
      ).status,
      403,
    );
    const login = await app.request("/api/session", {
      method: "POST",
      headers,
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("Set-Cookie")!.split(";")[0];
    assert(login.headers.get("Set-Cookie")!.includes("HttpOnly"));
    assert.equal(
      (await app.request("/api/documents", { headers: { Cookie: cookie } }))
        .status,
      200,
    );
    const bad = await app.request("/api/document", {
      method: "PUT",
      headers: { Cookie: cookie },
      body: JSON.stringify({
        id: "codex:instructions",
        content: "blocked",
        revision: null,
      }),
    });
    assert.equal(bad.status, 403);
    const reloaded = await createApp(f.config);
    assert.equal(
      (
        await reloaded.request("/api/documents", {
          headers: { Cookie: cookie },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await reloaded.request("/api/document?id=codex%3Aauth", {
          headers: { Cookie: cookie },
        })
      ).status,
      404,
    );
  } finally {
    await f.cleanup();
  }
});
