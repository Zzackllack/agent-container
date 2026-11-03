export type Format = "markdown" | "jsonc" | "toml";
export interface DocumentInfo {
  id: string;
  label: string;
  path: string;
  kind: "instructions" | "config";
  format: Format;
  scope: "global" | "project";
  agents: string[];
  exists: boolean;
  writable: boolean;
  source: "local" | "linked";
  reason?: string;
  linkTarget?: string;
}
export interface Document extends DocumentInfo {
  content: string;
  revision: string | null;
}
export type WarningLevel = "info" | "warning";
export interface InventoryWarning {
  /** Stable identifier; one entry exists per reason, never per folder. */
  code: "scan-depth" | "scan-limit" | "scan-permission";
  level: WarningLevel;
  message: string;
  /** Affected folders, collapsed behind a disclosure in the dashboard. */
  details?: string[];
  /** Folders left out of `details` because the list was capped. */
  hidden?: number;
}
export interface Inventory {
  documents: DocumentInfo[];
  warnings: InventoryWarning[];
}
export interface HistoryEntry {
  id: string;
  savedAt: string;
  bytes: number;
}
/** Where a pinned tool belongs on the overview board. */
export type ToolCategory = "agent" | "runtime" | "platform";

export interface ToolVersion {
  name: string;
  version: string;
}

export interface ImageTool {
  /** Brand id used by the client (`node`, `cloudflared`, …). */
  id: string;
  name: string;
  detail: string;
  category: ToolCategory;
  version: string;
  /** Secondary versions shipped alongside the main tool (pnpm, Compose, …). */
  extras?: ToolVersion[];
  note?: string;
}

export interface UtilityGroup {
  group: string;
  items: string[];
}

export interface Overview {
  t3: { reachable: boolean; version?: string; url: string };
  tools: ImageTool[];
  utilities: UtilityGroup[];
  home: string;
  workspace: string;
}
