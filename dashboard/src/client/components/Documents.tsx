import { lazy, Suspense, useEffect, useState } from "react";
import {
  Check,
  ChevronRight,
  History,
  LockKeyhole,
  Save,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Document, HistoryEntry, Inventory } from "../../shared/types";
import { api } from "../api";
import { AgentMark, AgentMarks } from "../brand/AgentMark";
import { Modal } from "./Dialog";

const Editor = lazy(() => import("./Editor"));
const Preview = lazy(() => import("./Preview"));
export function Documents({
  kind,
  inventory,
  refresh,
  onDirty,
}: {
  kind: "instructions" | "config";
  inventory: Inventory;
  refresh: () => void;
  onDirty: (dirty: boolean) => void;
}) {
  const files = inventory.documents.filter((file) => file.kind === kind);
  const [selected, setSelected] = useState<string>("");
  const [document, setDocument] = useState<Document | null>(null);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"edit" | "preview" | "changes">("edit");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const dirty = !!document && draft !== document.content;
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const candidates = files.filter((file) =>
    `${file.label} ${file.path}`.toLowerCase().includes(search.toLowerCase()),
  );

  useEffect(() => {
    if (!selected && files[0]) setSelected(files[0].id);
  }, [files, selected]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setNotice("");
    setDocument(null);
    api<Document>(`document?id=${encodeURIComponent(selected)}`)
      .then((data) => {
        if (!controller.signal.aborted) {
          setDocument(data);
          setDraft(data.content);
          setView("edit");
        }
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selected]);
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);

  function select(id: string) {
    if (dirty) setNext(id);
    else setSelected(id);
  }
  async function save() {
    if (!document) return;
    setSaving(true);
    setError("");
    try {
      const saved = await api<Document>("document", {
        method: "PUT",
        body: { id: document.id, content: draft, revision: document.revision },
      });
      setDocument(saved);
      setDraft(saved.content);
      setReview(false);
      setNotice("Saved. Start a fresh agent session to load the changes.");
      refresh();
    } catch (error) {
      setReview(false);
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function reload() {
    if (!document) return;
    try {
      const data = await api<Document>(
        `document?id=${encodeURIComponent(document.id)}`,
      );
      setDocument(data);
      setDraft(data.content);
      setError("");
      setNotice("Reloaded the current file.");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function showHistory() {
    if (!document) return;
    try {
      setHistory(
        await api<HistoryEntry[]>(
          `history?id=${encodeURIComponent(document.id)}`,
        ),
      );
    } catch (error) {
      setError((error as Error).message);
    }
  }
  async function loadBackup(id: string) {
    if (!document) return;
    try {
      const result = await api<{ content: string }>(
        `history?id=${encodeURIComponent(document.id)}&backup=${encodeURIComponent(id)}`,
      );
      setDraft(result.content);
      setView("changes");
      setHistory(null);
      setNotice("Backup loaded as a draft. Review and save to restore it.");
    } catch (error) {
      setError((error as Error).message);
    }
  }
  return (
    <div className="documents-page">
      <header className="page-header">
        <div>
          <h1>{kind === "instructions" ? "Instructions" : "Configuration"}</h1>
          <p>
            {kind === "instructions"
              ? "Give your agents the context they should carry into every task."
              : "Edit the configuration files your coding agents read."}
          </p>
        </div>
        <span className="file-count">{files.length} locations</span>
      </header>
      {inventory.warnings.map((warning) => (
        <p className="notice warning" key={warning}>
          {warning}
        </p>
      ))}
      <div className="document-layout">
        <aside className="file-pane">
          <label className="search">
            <Search size={15} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a file…"
              aria-label="Find a file"
            />
          </label>
          {(["global", "project"] as const).map((scope) => {
            const group = candidates.filter((file) => file.scope === scope);
            return group.length ? (
              <div className="file-group" key={scope}>
                <h2>{scope === "global" ? "Agent defaults" : "Projects"}</h2>
                {group.map((file) => (
                  <button
                    key={file.id}
                    className={`file-item ${selected === file.id ? "selected" : ""}`}
                    onClick={() => select(file.id)}
                  >
                    {/* Agent marks identify the file owner; lock state stays on the right. */}
                    <AgentMarks agents={file.agents} />
                    <span className="file-item-label">
                      <strong>{file.label}</strong>
                      <small>
                        {file.scope === "project"
                          ? "AGENTS.md"
                          : file.exists
                            ? file.format.toUpperCase()
                            : "Create file"}
                      </small>
                    </span>
                    {!file.writable ? <LockKeyhole size={12} /> : null}
                  </button>
                ))}
              </div>
            ) : null;
          })}
          {!candidates.length ? (
            <p className="empty-list">No matching files.</p>
          ) : null}
        </aside>
        <section className="editor-panel">
          {document ? (
            <>
              <div className="editor-header">
                <div>
                  <AgentMark name={document.agents[0]} size="sm" />
                  <span>{document.path}</span>
                  {dirty ? (
                    <span className="dirty-dot" title="Unsaved changes" />
                  ) : null}
                </div>
                <div className="editor-header-actions">
                  <button
                    className="icon-button"
                    onClick={showHistory}
                    aria-label="Version history"
                  >
                    <History size={17} />
                  </button>
                  <button
                    className="button primary small"
                    onClick={() => setReview(true)}
                    disabled={!dirty || !document.writable || saving}
                  >
                    <Save size={14} />
                    Review & save
                  </button>
                </div>
              </div>
              <div className="editor-toolbar">
                <div className="segmented">
                  {(
                    [
                      "edit",
                      ...(kind === "instructions" ? ["preview"] : []),
                      "changes",
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab}
                      className={view === tab ? "active" : ""}
                      onClick={() => setView(tab as typeof view)}
                    >
                      {tab === "edit"
                        ? document.writable
                          ? "Editor"
                          : "Source"
                        : tab === "preview"
                          ? "Preview"
                          : "Changes"}
                    </button>
                  ))}
                </div>
                <span className={`badge ${document.writable ? "" : "locked"}`}>
                  {document.writable ? (
                    <ShieldCheck size={12} />
                  ) : (
                    <LockKeyhole size={12} />
                  )}
                  {document.writable ? "Local file" : "Read-only"}
                </span>
              </div>
              {!document.writable ? (
                <div className="readonly-note">
                  <LockKeyhole size={15} />
                  <span>{document.reason}</span>
                </div>
              ) : null}
              {error ? (
                <div className="notice error" role="alert">
                  {error}
                  <button className="text-button" onClick={reload}>
                    Reload file
                  </button>
                </div>
              ) : null}
              {notice ? (
                <div className="notice success" role="status">
                  <Check size={15} />
                  {notice}
                </div>
              ) : null}
              <div className="editor-body">
                <Suspense
                  fallback={<div className="loading">Loading editor…</div>}
                >
                  {view === "preview" ? (
                    <Preview content={draft} />
                  ) : (
                    <Editor
                      key={`${document.id}:${view}`}
                      content={draft}
                      format={document.format}
                      readOnly={!document.writable || view === "changes"}
                      original={
                        view === "changes" ? document.content : undefined
                      }
                      onChange={setDraft}
                    />
                  )}
                </Suspense>
              </div>
              <footer className="editor-footer">
                <span>
                  {draft.split("\n").length} lines
                  <span className="footer-divider" />
                  {new TextEncoder().encode(draft).length.toLocaleString()}{" "}
                  bytes
                </span>
                <span>
                  {dirty
                    ? "Unsaved changes"
                    : document.exists
                      ? "Saved on disk"
                      : "File has not been created"}
                </span>
              </footer>
            </>
          ) : (
            <div className="editor-empty">
              {loading
                ? "Opening file…"
                : error || "Select an instruction or configuration file."}
            </div>
          )}
        </section>
        {document ? (
          <aside className="details-pane">
            <h2>About this file</h2>
            <dl>
              <dt>Read by</dt>
              <dd className="agent-tags">
                {document.agents.map((agent) => (
                  <span key={agent}>
                    <AgentMark name={agent} size="sm" />
                    {agent}
                  </span>
                ))}
              </dd>
              <dt>Scope</dt>
              <dd>
                {document.scope === "global"
                  ? "Agent-wide default"
                  : "Project instructions"}
              </dd>
              <dt>Location</dt>
              <dd className="path-detail">{document.path}</dd>
              {document.linkTarget ? (
                <>
                  <dt>Linked source</dt>
                  <dd className="path-detail">{document.linkTarget}</dd>
                </>
              ) : null}
            </dl>
            <div className="detail-note">
              <ChevronRight size={15} />
              <p>
                {document.id === "codex:override"
                  ? "A non-empty global override takes precedence over Codex’s global AGENTS.md."
                  : kind === "config"
                    ? "Syntax is checked before saving. Provider-specific behavior is verified by the agent itself."
                    : document.scope === "project"
                      ? "Repository and nested instructions add context for work in this project."
                      : "Global rules provide a baseline. Repository instructions can add more specific guidance."}
              </p>
            </div>
            <p className="detail-foot">
              {kind === "config"
                ? "Configurations may contain credentials. Files and backups stay private in your volumes."
                : "Changes apply to fresh agent sessions. Existing conversations may retain their earlier instructions."}
            </p>
          </aside>
        ) : null}
      </div>
      <Modal
        open={review}
        onOpenChange={(value) => {
          if (!saving) setReview(value);
        }}
        title="Review changes"
        description="The current file is backed up before your changes replace it."
        wide
      >
        <div className="review-editor">
          <Suspense fallback={<div className="loading">Loading changes…</div>}>
            {document ? (
              <Editor
                content={draft}
                original={document.content}
                format={document.format}
                readOnly
              />
            ) : null}
          </Suspense>
        </div>
        <div className="dialog-actions">
          <button
            className="button secondary"
            onClick={() => setReview(false)}
            disabled={saving}
          >
            Keep editing
          </button>
          <button className="button primary" onClick={save} disabled={saving}>
            <Save size={15} />
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </Modal>
      <Modal
        open={next !== null}
        onOpenChange={(value) => {
          if (!value) setNext(null);
        }}
        title="Leave this draft?"
        description="Your changes have not been saved."
      >
        <div className="dialog-actions">
          <button className="button secondary" onClick={() => setNext(null)}>
            Keep editing
          </button>
          <button
            className="button primary"
            onClick={() => {
              if (next) setSelected(next);
              setNext(null);
            }}
          >
            Discard draft
          </button>
        </div>
      </Modal>
      <Modal
        open={history !== null}
        onOpenChange={(value) => {
          if (!value) setHistory(null);
        }}
        title="Version history"
        description="Backups are created before replacing an existing file."
      >
        {history?.length ? (
          <div className="history-list">
            {history.map((entry) => (
              <button key={entry.id} onClick={() => loadBackup(entry.id)}>
                <span>
                  {new Date(entry.savedAt).toLocaleString()}
                  <small>{entry.bytes.toLocaleString()} bytes</small>
                </span>
                <span>
                  Load draft
                  <ChevronRight size={14} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="history-empty">
            No previous versions yet. The first save of an existing file creates
            a backup.
          </p>
        )}
      </Modal>
    </div>
  );
}
