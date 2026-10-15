import type { ReactElement } from "react";
import { CodexMark, GitHubMark, OpenCodeMark, T3CodeMark } from "./marks";

/**
 * Marks for the products this container manages. Ids double as the CSS hook
 * (`mark--codex`) so a theme can treat a vendor tile differently.
 */

export type AgentId = "t3" | "codex" | "opencode" | "gh";

export interface AgentBrand {
  id: AgentId;
  /** Name shown next to the mark. */
  label: string;
  Mark: (props: { className?: string }) => ReactElement;
  /**
   * Glyph-only artwork: the mark carries no background of its own, so the
   * chip supplies one. Tiled artwork (T3 Code, OpenCode) does not.
   */
  glyph: boolean;
}

export const AGENT_BRANDS: Record<AgentId, AgentBrand> = {
  t3: { id: "t3", label: "T3 Code", Mark: T3CodeMark, glyph: false },
  codex: { id: "codex", label: "Codex", Mark: CodexMark, glyph: true },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    Mark: OpenCodeMark,
    glyph: false,
  },
  gh: { id: "gh", label: "GitHub CLI", Mark: GitHubMark, glyph: true },
};

/**
 * Resolves the loose agent names the API returns ("Codex", "T3 Code") and the
 * baseline keys from the versions file ("codex", "gh") to one brand.
 */
export function agentBrand(name: string): AgentBrand | null {
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const id: AgentId | null = key.startsWith("t3")
    ? "t3"
    : key.startsWith("opencode")
      ? "opencode"
      : key.startsWith("codex")
        ? "codex"
        : key === "gh" || key.startsWith("github")
          ? "gh"
          : null;
  return id ? AGENT_BRANDS[id] : null;
}
