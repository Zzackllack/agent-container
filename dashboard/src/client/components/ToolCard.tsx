import type { ImageTool } from "../../shared/types";
import { BrandMark } from "../brand/BrandMark";

/** One category card on the overview's toolchain board. */
export function ToolCard({
  title,
  blurb,
  tools,
}: {
  title: string;
  blurb: string;
  tools: ImageTool[];
}) {
  return (
    <section className="card tool-card">
      <div className="card-heading">
        <div>
          <h2>{title}</h2>
          <p className="card-subtitle">{blurb}</p>
        </div>
        <span className="count-badge">{tools.length}</span>
      </div>
      {tools.length ? (
        <ul className="tool-list">
          {tools.map((tool) => (
            <li key={tool.id}>
              <BrandMark name={tool.id} size="lg" />
              <span className="tool-copy">
                <span className="tool-name">{tool.name}</span>
                <span className="tool-meta">
                  {tool.detail}
                  {tool.extras?.map((extra) => (
                    <span key={extra.name} className="tool-extra">
                      {extra.name} <code>{extra.version}</code>
                    </span>
                  ))}
                </span>
                {tool.note ? <span className="tool-note">{tool.note}</span> : null}
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
}
