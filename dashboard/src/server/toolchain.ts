import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  ImageTool,
  ToolCategory,
  ToolVersion,
  UtilityGroup,
} from "../shared/types.js";

/**
 * What the workspace image pins, read from the same versions/*.env files the
 * installers consume. The dashboard only reports; changing a version means
 * rebuilding the image. Keep this table in sync with Dockerfile and the apt
 * package list there.
 */

interface ToolSpec {
  id: string;
  name: string;
  detail: string;
  category: ToolCategory;
  /** File below `versions/`. */
  file: string;
  version: string;
  extras?: Array<{ name: string; key: string }>;
  note?: string;
}

const TOOLS: ToolSpec[] = [
  {
    id: "codex",
    name: "Codex",
    detail: "Coding agent CLI",
    category: "agent",
    file: "codex.env",
    version: "CODEX_VERSION",
  },
  {
    id: "opencode",
    name: "OpenCode",
    detail: "Coding agent CLI",
    category: "agent",
    file: "opencode.env",
    version: "OPENCODE_VERSION",
  },
  {
    id: "node",
    name: "Node.js",
    detail: "JavaScript runtime",
    category: "runtime",
    file: "node.env",
    version: "NODE_VERSION",
    extras: [
      { name: "pnpm", key: "PNPM_VERSION" },
      { name: "Yarn", key: "YARN_VERSION" },
    ],
  },
  {
    id: "go",
    name: "Go",
    detail: "Compiler and standard library",
    category: "runtime",
    file: "go.env",
    version: "GO_VERSION",
  },
  {
    id: "rust",
    name: "Rust",
    detail: "Compiler, Cargo, and rustup",
    category: "runtime",
    file: "rust.env",
    version: "RUST_TOOLCHAIN_VERSION",
    extras: [{ name: "rustup", key: "RUSTUP_VERSION" }],
  },
  {
    id: "java",
    name: "OpenJDK",
    detail: "Java development kit",
    category: "runtime",
    file: "java.env",
    version: "JAVA_MAJOR_VERSION",
  },
  {
    id: "maven",
    name: "Apache Maven",
    detail: "Java build tool",
    category: "runtime",
    file: "maven.env",
    version: "MAVEN_VERSION",
  },
  {
    id: "uv",
    name: "uv",
    detail: "Python packaging and projects",
    category: "runtime",
    file: "uv.env",
    version: "UV_VERSION",
  },
  {
    id: "docker",
    name: "Docker",
    detail: "Engine, CLI, and Compose",
    category: "platform",
    file: "docker.env",
    version: "DOCKER_ENGINE_VERSION",
    extras: [
      { name: "containerd", key: "CONTAINERD_VERSION" },
      { name: "Buildx", key: "BUILDX_VERSION" },
      { name: "Compose", key: "COMPOSE_VERSION" },
    ],
  },
  {
    id: "cloudflared",
    name: "Cloudflare tunnel",
    detail: "cloudflared, quick or named tunnels",
    category: "platform",
    file: "cloudflared.env",
    version: "CLOUDFLARED_VERSION",
    note: "Outbound only · no inbound ports",
  },
  {
    id: "gh",
    name: "GitHub CLI",
    detail: "GitHub from the terminal",
    category: "platform",
    file: "gh.env",
    version: "GH_VERSION",
  },
];

/** Debian packages from the Dockerfile's first apt block, grouped by purpose. */
const UTILITIES: UtilityGroup[] = [
  {
    group: "Shell & files",
    items: [
      "git",
      "git-lfs",
      "git-delta",
      "rsync",
      "less",
      "nano",
      "tree",
      "fd",
      "bat",
      "ripgrep",
      "fzf",
      "zoxide",
      "tmux",
      "just",
      "direnv",
    ],
  },
  {
    group: "Build & data",
    items: [
      "build-essential",
      "cmake",
      "pkg-config",
      "protobuf-compiler",
      "sqlite3",
      "postgresql-client",
      "python3",
      "python3-venv",
    ],
  },
  {
    group: "Network & system",
    items: [
      "curl",
      "wget",
      "dnsutils",
      "iproute2",
      "iputils-ping",
      "openssh-client",
      "openssl",
      "procps",
      "htop",
      "sudo",
      "shellcheck",
    ],
  },
  {
    group: "Headless browsers",
    items: ["xvfb", "xauth", "fontconfig", "fonts-dejavu-core", "fonts-liberation"],
  },
  {
    group: "Archives",
    items: ["bzip2", "unzip", "zip", "xz-utils", "zstd"],
  },
];

/** Parses `KEY=value` lines; the installers keep comments out of the way. */
function parseEnv(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of source.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

/** Debian versions carry an epoch and revision (`5:29.9.2-1~debian.13~trixie`). */
function cleanVersion(value: string): string {
  return value.replace(/^\d+:/, "").replace(/[-~]\d.*$/, "");
}

export interface Toolchain {
  tools: ImageTool[];
  utilities: UtilityGroup[];
}

export async function readToolchain(versions: string): Promise<Toolchain> {
  const sources = new Map<string, Record<string, string>>();
  async function read(file: string) {
    if (!sources.has(file)) {
      const source = await readFile(join(versions, file), "utf8").catch(
        () => "",
      );
      sources.set(file, parseEnv(source));
    }
    return sources.get(file)!;
  }

  const tools = await Promise.all(
    TOOLS.map(async (tool): Promise<ImageTool> => {
      const values = await read(tool.file);
      const version = values[tool.version];
      const extras: ToolVersion[] = [];
      for (const extra of tool.extras ?? []) {
        const value = values[extra.key];
        if (value) extras.push({ name: extra.name, version: cleanVersion(value) });
      }
      return {
        id: tool.id,
        name: tool.name,
        detail: tool.detail,
        category: tool.category,
        version: version ? cleanVersion(version) : "Not recorded",
        extras,
        note: tool.note,
      };
    }),
  );
  return { tools, utilities: UTILITIES };
}
