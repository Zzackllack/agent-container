import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readToolchain } from "./toolchain.js";

test("reads pinned versions, extras, and Debian revisions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-toolchain-"));
  try {
    await Promise.all([
      writeFile(
        join(dir, "node.env"),
        "NODE_VERSION=24.22.2\nPNPM_VERSION=12.16.1\n",
      ),
      writeFile(
        join(dir, "docker.env"),
        "DOCKER_ENGINE_VERSION='5:29.9.2-1~debian.13~trixie'\n" +
          "COMPOSE_VERSION='5.7.0-1~debian.13~trixie'\n",
      ),
      writeFile(join(dir, "java.env"), "JAVA_MAJOR_VERSION=25\n"),
    ]);
    const { tools } = await readToolchain(dir);
    const byId = new Map(tools.map((tool) => [tool.id, tool]));

    assert.equal(byId.get("node")?.version, "24.22.2");
    // Yarn is declared for Node.js but has no entry in this fixture.
    assert.deepEqual(byId.get("node")?.extras, [
      { name: "pnpm", version: "12.16.1" },
    ]);
    assert.equal(byId.get("docker")?.version, "29.9.2");
    assert.deepEqual(byId.get("docker")?.extras, [
      { name: "Compose", version: "5.7.0" },
    ]);
    assert.equal(byId.get("java")?.version, "25");
    // A missing env file stays visible instead of dropping the tool.
    assert.equal(byId.get("go")?.version, "Not recorded");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
