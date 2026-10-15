import { resolve } from "node:path";

export interface Settings {
  home: string;
  workspace: string;
  state: string;
  published: string;
  t3Internal: string;
  t3Public: string;
  publicOrigin?: string;
  versions: string;
}
export function settings(): Settings {
  return {
    home: resolve(process.env.AGENT_HOME ?? "/home/agent"),
    workspace: resolve(process.env.AGENT_WORKSPACE ?? "/workspace"),
    state: resolve(process.env.DASHBOARD_STATE ?? "/var/lib/agent-dashboard"),
    published: resolve(
      process.env.AGENT_PUBLISHED ?? "/etc/agent-instructions/AGENTS.md",
    ),
    t3Internal: process.env.T3_INTERNAL_URL ?? "http://workspace:3773",
    t3Public: process.env.T3_PUBLIC_URL ?? "http://localhost:3773",
    publicOrigin: process.env.DASHBOARD_PUBLIC_URL
      ? new URL(process.env.DASHBOARD_PUBLIC_URL).origin
      : undefined,
    versions: resolve(process.env.IMAGE_VERSIONS ?? "/app/versions"),
  };
}
