import { ExternalLink } from "lucide-react";
import type { Overview } from "../../shared/types";
import { BrandMark } from "../brand/BrandMark";

/**
 * The sidebar's "what is running here" block: the T3 Code server plus the CLI
 * versions of the agents whose files this dashboard edits.
 */
export function WorkspaceCard({ overview }: { overview: Overview | null }) {
  const url = overview?.t3.url;
  const detail = !overview
    ? "Checking workspace…"
    : overview.t3.reachable
      ? (overview.t3.version ?? "Connected")
      : "Workspace unavailable";
  const body = (
    <>
      <BrandMark name="T3 Code" size="lg" />
      <span className="workspace-card-label">
        <strong>T3 Code</strong>
        <small>
          <span
            className={`status-dot ${overview?.t3.reachable ? "" : "offline"}`}
          />
          {detail}
        </small>
      </span>
    </>
  );
  if (!url) return <div className="workspace-card">{body}</div>;
  return (
    <a
      className="workspace-card"
      href={url}
      target="_blank"
      rel="noreferrer"
      title="Open T3 Code in a new tab"
    >
      {body}
      <ExternalLink size={14} />
    </a>
  );
}

/** Versions of the coding agents, minus tools that are not part of the CLI set. */
export function ToolchainList({ overview }: { overview: Overview | null }) {
  const tools = (overview?.tools ?? []).filter(
    (tool) => tool.category === "agent",
  );
  if (!tools.length) return null;
  return (
    <ul className="toolchain" aria-label="Agent CLIs in this image">
      {tools.map((tool) => (
        <li key={tool.id}>
          <BrandMark name={tool.id} size="sm" />
          {tool.name}
          <code>{tool.version}</code>
        </li>
      ))}
    </ul>
  );
}
