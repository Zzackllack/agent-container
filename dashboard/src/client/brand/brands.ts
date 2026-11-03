import type { ReactElement } from "react";
import {
  CloudflareMark,
  CodexMark,
  DockerMark,
  GitHubMark,
  GoMark,
  JavaMark,
  MavenMark,
  NodeMark,
  OpenCodeMark,
  RustMark,
  T3CodeMark,
  UvMark,
} from "./marks";

/**
 * Marks for the products and toolchains this container manages. Ids double as
 * the CSS hook (`mark--codex`) so a theme can tint a vendor glyph.
 */

export type BrandId =
  | "t3"
  | "codex"
  | "opencode"
  | "gh"
  | "cloudflared"
  | "node"
  | "go"
  | "rust"
  | "java"
  | "maven"
  | "docker"
  | "uv";

export interface Brand {
  id: BrandId;
  /** Name shown next to the mark. */
  label: string;
  Mark: (props: { className?: string }) => ReactElement;
  /**
   * Glyph-only artwork: the mark carries no background of its own, so the
   * chip supplies one. Tiled artwork (T3 Code, OpenCode) does not.
   */
  glyph: boolean;
}

export const BRANDS: Record<BrandId, Brand> = {
  t3: { id: "t3", label: "T3 Code", Mark: T3CodeMark, glyph: false },
  codex: { id: "codex", label: "Codex", Mark: CodexMark, glyph: true },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    Mark: OpenCodeMark,
    glyph: false,
  },
  gh: { id: "gh", label: "GitHub CLI", Mark: GitHubMark, glyph: true },
  cloudflared: {
    id: "cloudflared",
    label: "Cloudflare tunnel",
    Mark: CloudflareMark,
    glyph: true,
  },
  node: { id: "node", label: "Node.js", Mark: NodeMark, glyph: true },
  go: { id: "go", label: "Go", Mark: GoMark, glyph: true },
  rust: { id: "rust", label: "Rust", Mark: RustMark, glyph: true },
  java: { id: "java", label: "OpenJDK", Mark: JavaMark, glyph: true },
  maven: { id: "maven", label: "Apache Maven", Mark: MavenMark, glyph: true },
  docker: { id: "docker", label: "Docker", Mark: DockerMark, glyph: true },
  uv: { id: "uv", label: "uv", Mark: UvMark, glyph: true },
};

/**
 * Loose names from the API ("OpenJDK", "Node.js", a future label like "Cargo")
 * and ids from the versions table ("gh") both resolve here. Order matters:
 * the first matching alias wins.
 */
const ALIASES: Array<[RegExp, BrandId]> = [
  [/^t3/, "t3"],
  [/^opencode/, "opencode"],
  [/^codex|^openai/, "codex"],
  [/^github|^gh$/, "gh"],
  [/^cloudflare/, "cloudflared"],
  [/^node(js)?$/, "node"],
  [/^go$|^golang/, "go"],
  [/^rust|^cargo/, "rust"],
  [/^java|^openjdk/, "java"],
  [/^apachemaven|^maven/, "maven"],
  [/^docker/, "docker"],
  [/^uv$/, "uv"],
];

export function brandFor(name: string): Brand | null {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (key in BRANDS) return BRANDS[key as BrandId];
  for (const [pattern, id] of ALIASES) {
    if (pattern.test(key)) return BRANDS[id];
  }
  return null;
}
