import {
  Box,
  ExternalLink,
  FileCode2,
  FolderGit2,
  RefreshCw,
} from "lucide-react";
import type { Inventory, Overview as OverviewData } from "../../shared/types";

export function Overview({
  overview,
  inventory,
  refresh,
  openInstructions,
}: {
  overview: OverviewData | null;
  inventory: Inventory;
  refresh: () => void;
  openInstructions: () => void;
}) {
  const global = inventory.documents.filter(
    (file) => file.scope === "global" && file.kind === "instructions",
  );
  return (
    <div className="overview-page">
      <header className="page-header">
        <div>
          <h1>Workspace overview</h1>
          <p>The tools, files, and services on this box.</p>
        </div>
        <button className="button secondary" onClick={refresh}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </header>
      <section className="runtime-panel">
        <div className="runtime-icon">
          <Box size={30} strokeWidth={1.4} />
        </div>
        <div>
          <span className="muted">T3 Code</span>
          <h2>{overview?.t3.version ?? "Waiting for workspace"}</h2>
          <p>
            <span
              className={`status-dot ${overview?.t3.reachable ? "" : "offline"}`}
            />
            {overview?.t3.reachable
              ? "Workspace is reachable"
              : "Workspace is not reachable from the dashboard"}
          </p>
        </div>
        {overview?.t3.url ? (
          <a
            className="button primary"
            href={overview.t3.url}
            target="_blank"
            rel="noreferrer"
          >
            Open T3
            <ExternalLink size={15} />
          </a>
        ) : null}
      </section>
      <div className="overview-columns">
        <section>
          <div className="section-heading">
            <h2>Instructions</h2>
            <button className="text-button" onClick={openInstructions}>
              Manage files
            </button>
          </div>
          <div className="definition-list">
            {global.map((file) => (
              <div key={file.id}>
                <span>
                  <FileCode2 size={17} />
                  {file.label}
                </span>
                <span className="badge">
                  {file.source === "linked"
                    ? "Linked file"
                    : file.exists
                      ? "Local file"
                      : "Not created"}
                </span>
              </div>
            ))}
          </div>
          <p className="section-note">
            T3 uses the instructions of its selected coding agent. Project rules
            stay in each repository.
          </p>
        </section>
        <section>
          <div className="section-heading">
            <h2>CLI image baseline</h2>
          </div>
          <div className="definition-list">
            {Object.entries(overview?.baseline ?? {}).map(([tool, version]) => (
              <div key={tool}>
                <span>
                  {tool === "gh"
                    ? "GitHub CLI"
                    : tool === "codex"
                      ? "Codex"
                      : "OpenCode"}
                </span>
                <code>{version}</code>
              </div>
            ))}
          </div>
          <p className="section-note">
            Versions shipped with this dashboard build. T3’s live version is
            reported separately above.
          </p>
        </section>
      </div>
      <section className="paths-section">
        <h2>Persistent locations</h2>
        <div>
          <FolderGit2 size={18} />
          <span>Agent home</span>
          <code>{overview?.home ?? "—"}</code>
        </div>
        <div>
          <FolderGit2 size={18} />
          <span>Repositories</span>
          <code>{overview?.workspace ?? "—"}</code>
        </div>
        <p className="section-note">
          Edits go to these files directly. No separate copy of your agent
          configuration is maintained.
        </p>
      </section>
    </div>
  );
}
