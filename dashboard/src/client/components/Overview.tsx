import { ExternalLink, FolderGit2, RefreshCw, Settings2 } from "lucide-react";
import type { Inventory, Overview as OverviewData } from "../../shared/types";
import { agentBrand } from "../brand/agents";
import { AgentMark, AgentMarks } from "../brand/AgentMark";

export function Overview({
  overview,
  inventory,
  refresh,
  openInstructions,
  openConfiguration,
}: {
  overview: OverviewData | null;
  inventory: Inventory;
  refresh: () => void;
  openInstructions: () => void;
  openConfiguration: () => void;
}) {
  const global = inventory.documents.filter(
    (file) => file.scope === "global" && file.kind === "instructions",
  );
  const baseline = Object.entries(overview?.baseline ?? {});
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
        <AgentMark name="T3 Code" size="xl" />
        <div className="runtime-copy">
          <span className="eyebrow">Workspace runtime</span>
          <h2>{overview?.t3.version ?? "Waiting for workspace"}</h2>
          <p className="runtime-status">
            <span
              className={`status-dot ${overview?.t3.reachable ? "" : "offline"}`}
            />
            {overview?.t3.reachable
              ? "Workspace is reachable from the dashboard"
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
            Open T3 Code
            <ExternalLink size={15} />
          </a>
        ) : null}
      </section>

      <div className="overview-columns">
        <section className="card">
          <div className="card-heading">
            <h2>CLI image baseline</h2>
            <button className="text-button" onClick={openConfiguration}>
              Configure
            </button>
          </div>
          {baseline.length ? (
            <ul className="agent-list">
              {baseline.map(([tool, version]) => (
                <li key={tool}>
                  <AgentMark name={tool} size="md" />
                  <span>
                    <strong>{agentBrand(tool)?.label ?? tool}</strong>
                    <small>Installed in this image</small>
                  </span>
                  <code>{version}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="section-note">No CLI baselines reported yet.</p>
          )}
          <p className="section-note">
            Versions shipped with this dashboard build. T3’s live version is
            reported separately above.
          </p>
        </section>

        <section className="card">
          <div className="card-heading">
            <h2>Global instructions</h2>
            <button className="text-button" onClick={openInstructions}>
              Manage files
            </button>
          </div>
          <div className="definition-list">
            {global.map((file) => (
              <div key={file.id}>
                <span>
                  <AgentMarks agents={file.agents} />
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
      </div>

      <section className="card paths-card">
        <div className="card-heading">
          <h2>Persistent locations</h2>
          <button className="text-button" onClick={openConfiguration}>
            <Settings2 size={13} />
            Configuration
          </button>
        </div>
        <div className="path-list">
          <div>
            <FolderGit2 size={17} />
            <span>Agent home</span>
            <code>{overview?.home ?? "—"}</code>
          </div>
          <div>
            <FolderGit2 size={17} />
            <span>Repositories</span>
            <code>{overview?.workspace ?? "—"}</code>
          </div>
        </div>
        <p className="section-note">
          Edits go to these files directly. No separate copy of your agent
          configuration is maintained.
        </p>
      </section>
    </div>
  );
}
