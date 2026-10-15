export type Format = "markdown" | "jsonc" | "toml";
export interface DocumentInfo {
  id: string;
  label: string;
  path: string;
  kind: "instructions" | "config";
  format: Format;
  scope: "shared" | "global" | "project";
  agents: string[];
  exists: boolean;
  writable: boolean;
  source: "local" | "git" | "linked";
  reason?: string;
  linkTarget?: string;
}
export interface Document extends DocumentInfo {
  content: string;
  revision: string | null;
}
export interface Inventory {
  documents: DocumentInfo[];
  warnings: string[];
}
export interface HistoryEntry {
  id: string;
  savedAt: string;
  bytes: number;
}
export interface Overview {
  t3: { reachable: boolean; version?: string; url: string };
  baseline: Record<string, string>;
  home: string;
  workspace: string;
}
