import {
  ExternalLink,
  FolderGit2,
  RefreshCw,
  Settings2,
  Wrench,
} from "lucide-react";
import type {
  Inventory,
  Overview as OverviewData,
  ToolCategory,
} from "../../shared/types";
import { BrandMark, BrandMarks } from "../brand/BrandMark";

const GROUPS: Array<{
  category: ToolCategory;
  title: string;
  blurb: string;
}> = [
  {
    category: "agent",
    title: "Coding agents",
    blurb: "CLIs T3 can run inside this image.",
  },
  {
    category: "runtime",
    title: "Language runtimes",
    blurb: "Toolchains for the languages you build in.",
  },
  {
    category: "platform",
    title: "Platform tools",
    blurb: "Container, tunnel, and repository plumbing.",
  },
];

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
  const tools = overview?.tools ?? [];
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
        <BrandMark name="T3 Code" size="xl" />
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

      <div className="section-heading">
        <div>
          <h2>Image toolchain</h2>
          <p>
            {tools.length
              ? `${tools.length} pinned tools and the base packages shared by every workspace session.`
              : "Pinned toolchains and the base packages shared by every workspace session."}{" "}
            Versions change with a rebuild.
          </p>
        </div>
      </div>

      <div className="tool-grid">
        {GROUPS.map(({ category, title, blurb }) => {
          const group = tools.filter((tool) => tool.category === category);
          return (
            <section className="card tool-card" key={category}>
              <div className="card-heading">
                <div>
                  <h2>{title}</h2>
                  <p className="card-subtitle">{blurb}</p>
                </div>
                <span className="count-badge">{group.length}</span>
              </div>
              {group.length ? (
                <ul className="tool-list">
                  {group.map((tool) => (
                    <li key={tool.id}>
                      <BrandMark name={tool.id} size="lg" />
                      <span className="tool-copy">
                        <span className="tool-name">{tool.name}</span>
                        <span className="tool-detail">{tool.detail}</span>
                        {tool.note ? (
                          <span className="tool-note">{tool.note}</span>
                        ) : null}
                        {tool.extras?.length ? (
                          <span className="tool-extras">
                            {tool.extras.map((extra) => (
                              <span key={extra.name}>
                                {extra.name}
                                <code>{extra.version}</code>
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <code className="tool-version">{tool.version}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="section-note">No tools reported yet.</p>
              )}
            </section>
          );
        })}
      </div>

      {overview?.utilities.length ? (
        <section className="card utilities-card">
          <div className="card-heading">
            <div>
              <h2>Base utilities</h2>
              <p className="card-subtitle">
                Debian 13 packages available in every session.
              </p>
            </div>
            <span className="heading-icon">
              <Wrench size={15} />
            </span>
          </div>
          <div className="utility-groups">
            {overview.utilities.map((group) => (
              <div key={group.group}>
                <h3>{group.group}</h3>
                <ul className="chips">
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="section-note">
            Headless Chromium libraries are present for Playwright and
            Puppeteer; the browsers themselves stay a per-project install.
          </p>
        </section>
      ) : null}

      <div className="overview-columns">
        <section className="card">
          <div className="card-heading">
            <div>
              <h2>Global instructions</h2>
              <p className="card-subtitle">
                What each agent reads before a fresh session.
              </p>
            </div>
            <button className="text-button" onClick={openInstructions}>
              Manage files
            </button>
          </div>
          <div className="definition-list">
            {global.map((file) => (
              <div key={file.id}>
                <span className="definition-label">
                  <BrandMarks agents={file.agents} />
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

        <section className="card paths-card">
          <div className="card-heading">
            <div>
              <h2>Persistent locations</h2>
              <p className="card-subtitle">Volumes that survive a rebuild.</p>
            </div>
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
    </div>
  );
}
