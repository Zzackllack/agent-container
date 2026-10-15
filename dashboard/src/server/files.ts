import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import {
  parse as parseJson,
  type ParseError,
  printParseErrorCode,
} from "jsonc-parser";
import { parse as parseToml } from "smol-toml";
import type {
  Document,
  DocumentInfo,
  Format,
  HistoryEntry,
  Inventory,
  InventoryWarning,
} from "../shared/types.js";
import type { Settings } from "./config.js";

const MAX_BYTES = 128 * 1024;
const SKIP = new Set([
  ".git",
  "node_modules",
  "vendor",
  ".cache",
  ".venv",
  "dist",
  "build",
  "target",
  ".next",
]);
// Bounds for the workspace walk. Whichever bound truncates the walk is reported
// once, with the affected folders behind a disclosure — a folder-per-warning
// list is what used to bury the editor on workspaces with deep paths.
const SCAN_MAX_DEPTH = 6;
const SCAN_MAX_DIRECTORIES = 2000;
const SCAN_MAX_DOCUMENTS = 400;
const WARNING_DETAIL_LIMIT = 50;

/** Unique, sorted folder list for a warning, capped so huge walks stay small. */
function cappedPaths(paths: string[]): { details: string[]; hidden: number } {
  const unique = [...new Set(paths)].sort((a, b) => a.localeCompare(b));
  return {
    details: unique.slice(0, WARNING_DETAIL_LIMIT),
    hidden: Math.max(0, unique.length - WARNING_DETAIL_LIMIT),
  };
}
export class FileError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409 | 413 | 422,
    message: string,
  ) {
    super(message);
  }
}
function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}
function inside(root: string, path: string): boolean {
  const part = relative(root, path);
  return (
    part === "" ||
    (!part.startsWith(`..${sep}`) && part !== ".." && !isAbsolute(part))
  );
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Definition = Pick<
  DocumentInfo,
  "id" | "label" | "path" | "kind" | "format" | "scope" | "agents"
>;

export class Files {
  private writes = new Map<string, Promise<unknown>>();
  constructor(private config: Settings) {}

  private globals(): Definition[] {
    const home = this.config.home;
    return [
      {
        id: "codex:instructions",
        label: "Codex",
        path: join(home, ".codex/AGENTS.md"),
        kind: "instructions",
        format: "markdown",
        scope: "global",
        agents: ["Codex"],
      },
      {
        id: "codex:override",
        label: "Codex override",
        path: join(home, ".codex/AGENTS.override.md"),
        kind: "instructions",
        format: "markdown",
        scope: "global",
        agents: ["Codex"],
      },
      {
        id: "opencode:instructions",
        label: "OpenCode",
        path: join(home, ".config/opencode/AGENTS.md"),
        kind: "instructions",
        format: "markdown",
        scope: "global",
        agents: ["OpenCode"],
      },
      {
        id: "codex:config",
        label: "Codex configuration",
        path: join(home, ".codex/config.toml"),
        kind: "config",
        format: "toml",
        scope: "global",
        agents: ["Codex"],
      },
      ...["json", "jsonc"].map((ext): Definition => ({
        id: `opencode:config:${ext}`,
        label: `OpenCode ${ext === "jsonc" ? "configuration (JSONC)" : "configuration"}`,
        path: join(home, `.config/opencode/opencode.${ext}`),
        kind: "config",
        format: "jsonc",
        scope: "global",
        agents: ["OpenCode"],
      })),
    ];
  }
  private definition(id: string): Definition {
    const known = this.globals().find((entry) => entry.id === id);
    if (known) return known;
    if (!id.startsWith("project:"))
      throw new FileError(404, "Unknown document.");
    const path = resolve(this.config.workspace, id.slice(8));
    if (
      !inside(this.config.workspace, path) ||
      basename(path) !== "AGENTS.md"
    ) {
      throw new FileError(
        403,
        "Only project AGENTS.md files inside the workspace can be edited.",
      );
    }
    return {
      id,
      label: relative(this.config.workspace, dirname(path)) || "Workspace",
      path,
      kind: "instructions",
      format: "markdown",
      scope: "project",
      agents: ["Codex", "OpenCode"],
    };
  }
  // Do not follow links through parent directories or replace linked files.
  // Instructions and provider configuration must stay inside the allowlist.
  private async parents(path: string, root: string): Promise<void> {
    if (!inside(root, path))
      throw new FileError(403, "Path is outside the configured volume.");
    const parts = relative(root, dirname(path)).split(sep).filter(Boolean);
    for (const current of [
      root,
      ...parts.map((_, i) => join(root, ...parts.slice(0, i + 1))),
    ]) {
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink() || !info.isDirectory())
          throw new FileError(
            403,
            "A parent directory is linked or is not a directory.",
          );
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
  }
  private root(definition: Definition): string {
    return definition.scope === "project"
      ? this.config.workspace
      : this.config.home;
  }
  private async inspect(definition: Definition): Promise<DocumentInfo> {
    const base: DocumentInfo = {
      ...definition,
      exists: false,
      writable: true,
      source: "local",
    };
    try {
      await this.parents(definition.path, this.root(definition));
    } catch (error) {
      return { ...base, writable: false, reason: (error as Error).message };
    }
    try {
      const info = await lstat(definition.path);
      if (info.isSymbolicLink()) {
        const target = await realpath(definition.path).catch(() => "");

        return {
          ...base,
          exists: !!target,
          writable: false,
          source: "linked",
          linkTarget: target,
          reason:
            "Linked file. Replace it with a local file to edit it in the dashboard.",
        };
      }
      if (!info.isFile())
        return {
          ...base,
          writable: false,
          reason: "This path is not a regular file.",
        };
      if (base.writable) {
        try {
          await access(definition.path, constants.W_OK);
        } catch {
          base.writable = false;
          base.reason =
            "The dashboard user cannot write this file. Check volume ownership.";
        }
      }
      return { ...base, exists: true };
    } catch (error) {
      if (missing(error)) return base;
      throw error;
    }
  }
  async inventory(): Promise<Inventory> {
    const [documents, warnings] = await this.scanWorkspace();
    const openCodeConfigExists = documents.some(
      (doc) => doc.id.startsWith("opencode:config:") && doc.exists,
    );
    return {
      documents: documents.filter((doc) => {
        if (doc.id.startsWith("opencode:config:") && !doc.exists)
          return !openCodeConfigExists && doc.id.endsWith(":jsonc");
        return true;
      }),
      warnings,
    };
  }
  /**
   * Collects the known documents plus the notes explaining what the walk skipped.
   * Each bound that truncated the walk yields one entry, never one per folder.
   */
  private async scanWorkspace(): Promise<[DocumentInfo[], InventoryWarning[]]> {
    const documents = await Promise.all(
      this.globals().map((entry) => this.inspect(entry)),
    );
    const unreadable: string[] = [];
    const truncated: string[] = [];
    let visited = 0;
    const scan = async (directory: string, depth: number): Promise<void> => {
      if (
        ++visited > SCAN_MAX_DIRECTORIES ||
        documents.length >= SCAN_MAX_DOCUMENTS
      )
        return;
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (!missing(error)) unreadable.push(directory);
        return;
      }
      const repo = entries.some((entry) => entry.name === ".git");
      const rules = entries.find((entry) => entry.name === "AGENTS.md");
      if (rules || repo || directory === this.config.workspace) {
        const id = `project:${relative(this.config.workspace, join(directory, "AGENTS.md"))}`;
        documents.push(await this.inspect(this.definition(id)));
      }
      const children = entries.filter(
        (entry) =>
          entry.isDirectory() &&
          !entry.name.startsWith(".") &&
          !SKIP.has(entry.name),
      );
      if (depth >= SCAN_MAX_DEPTH) {
        if (children.length) truncated.push(directory);
        return;
      }
      for (const entry of children) {
        if (
          visited >= SCAN_MAX_DIRECTORIES ||
          documents.length >= SCAN_MAX_DOCUMENTS
        )
          break;
        await scan(join(directory, entry.name), depth + 1);
      }
    };
    await scan(this.config.workspace, 0);

    const warnings: InventoryWarning[] = [];
    if (
      visited >= SCAN_MAX_DIRECTORIES ||
      documents.length >= SCAN_MAX_DOCUMENTS
    )
      warnings.push({
        code: "scan-limit",
        level: "warning",
        message: `Scanning stopped at the limit of ${SCAN_MAX_DIRECTORIES.toLocaleString()} folders / ${SCAN_MAX_DOCUMENTS} files, so some instruction files may be missing.`,
      });
    if (unreadable.length)
      warnings.push({
        code: "scan-permission",
        level: "warning",
        message: `Cannot read ${unreadable.length === 1 ? "one folder" : `${unreadable.length.toLocaleString()} folders`}. Check directory permissions.`,
        ...cappedPaths(unreadable),
      });
    if (truncated.length)
      warnings.push({
        code: "scan-depth",
        level: "info",
        message: `Scanning skipped ${truncated.length === 1 ? "one folder" : `${truncated.length.toLocaleString()} folders`} deeper than ${SCAN_MAX_DEPTH} levels. Nested instruction files there are not listed.`,
        ...cappedPaths(truncated),
      });
    return [documents, warnings];
  }
  async read(id: string): Promise<Document> {
    const definition = this.definition(id);
    const info = await this.inspect(definition);
    if (!info.exists) return { ...info, content: "", revision: null };
    const path = definition.path;
    if (info.source === "linked") {
      throw new FileError(
        403,
        "Linked files cannot be read or edited through the dashboard.",
      );
    }
    if (info.reason && !info.writable) {
      // A rejected parent must not become a read escape through a symlink.
      await this.parents(path, this.root(definition));
    }
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const details = await handle.stat();
      if (!details.isFile()) throw new FileError(403, "Not a regular file.");
      if (details.size > MAX_BYTES)
        throw new FileError(413, "File exceeds the 128 KiB editor limit.");
      const content = await handle.readFile("utf8");
      return { ...info, content, revision: digest(content) };
    } finally {
      await handle.close();
    }
  }
  private validate(content: string, format: Format): void {
    if (Buffer.byteLength(content) > MAX_BYTES || content.includes("\0"))
      throw new FileError(413, "Use a text file smaller than 128 KiB.");
    if (format === "markdown") return;
    try {
      if (format === "toml") {
        parseToml(content);
        return;
      }
      const errors: ParseError[] = [];
      const parsed: unknown = parseJson(content, errors, {
        allowTrailingComma: true,
        disallowComments: false,
      });
      if (errors.length)
        throw new Error(
          `${printParseErrorCode(errors[0].error)} near character ${errors[0].offset + 1}`,
        );
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Configuration must be an object.");
    } catch (error) {
      throw new FileError(
        422,
        `Invalid ${format === "toml" ? "TOML" : "JSONC"}: ${(error as Error).message}`,
      );
    }
  }
  private async serialized<T>(key: string, task: () => Promise<T>): Promise<T> {
    const next = (this.writes.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(task);
    this.writes.set(key, next);
    try {
      return await next;
    } finally {
      if (this.writes.get(key) === next) this.writes.delete(key);
    }
  }
  async save(
    id: string,
    content: string,
    revision: string | null,
  ): Promise<Document> {
    return this.serialized(this.definition(id).path, async () => {
      const before = await this.read(id);
      if (!before.writable)
        throw new FileError(403, before.reason ?? "This source is read-only.");
      if (before.revision !== revision)
        throw new FileError(
          409,
          "This file changed since you opened it. Reload it before saving.",
        );
      this.validate(content, before.format);
      if (before.content === content && before.exists) return before;
      const definition = this.definition(id);
      if (id.startsWith("opencode:config:") && !before.exists) {
        const other = id.endsWith(":jsonc")
          ? "opencode:config:json"
          : "opencode:config:jsonc";
        if ((await this.inspect(this.definition(other))).exists)
          throw new FileError(
            409,
            "An OpenCode config already exists. Edit that file instead of creating a second global layer.",
          );
      }
      await this.parents(definition.path, this.root(definition));
      await mkdir(dirname(definition.path), { recursive: true });
      if (before.exists) {
        const backup = join(this.config.state, "backups", digest(id));
        await mkdir(backup, { recursive: true, mode: 0o700 });
        await writeFile(
          join(
            backup,
            `${new Date().toISOString().replace(/[:.]/g, "-")}_${randomUUID()}.txt`,
          ),
          before.content,
          { flag: "wx", mode: 0o600 },
        );
      }
      const pending = join(
        dirname(definition.path),
        `.dashboard-${randomUUID()}`,
      );
      try {
        await writeFile(pending, content, { flag: "wx", mode: 0o600 });
        const latest = await this.read(id);
        if (!latest.writable || latest.revision !== revision)
          throw new FileError(
            409,
            "The file changed during saving. Reload before trying again.",
          );
        await rename(pending, definition.path);
      } finally {
        await unlink(pending).catch((error: unknown) => {
          if (!missing(error)) throw error;
        });
      }
      return this.read(id);
    });
  }
  async history(id: string): Promise<HistoryEntry[]> {
    this.definition(id);
    const directory = join(this.config.state, "backups", digest(id));
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
    const entries = await Promise.all(
      names
        .filter((name) => /^[0-9TZ-]+_[0-9a-f-]+\.txt$/.test(name))
        .map(async (name) => {
          const info = await stat(join(directory, name));
          return {
            id: name,
            savedAt: info.mtime.toISOString(),
            bytes: info.size,
          };
        }),
    );
    return entries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }
  async backup(id: string, backup: string): Promise<string> {
    if (!(await this.history(id)).some((entry) => entry.id === backup))
      throw new FileError(404, "Backup not found.");
    const handle = await open(
      join(this.config.state, "backups", digest(id), backup),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    try {
      return await handle.readFile("utf8");
    } finally {
      await handle.close();
    }
  }
}
