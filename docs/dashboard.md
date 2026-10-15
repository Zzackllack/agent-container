# Configuration dashboard

The dashboard edits instruction and configuration files in the same home and
workspace volumes the agents use. It is a separate Compose service: React, Vite,
TypeScript, Tailwind CSS, CodeMirror, and a small Hono API on Node.js 24. The
workspace image does not need Node.js for this service.

## Open it

```sh
docker compose up -d --build --wait
docker compose exec dashboard cat /var/lib/agent-dashboard/password
```

Open <http://localhost:3780> and enter that password. Keep any configured Compose
overrides on these commands. The random password is generated on first start,
stored with mode `0600`, and never printed in service logs. Dashboard login and
T3 pairing are separate: the **Open T3 Code** link still requires T3 authorization.
Sessions last twelve hours and survive container recreation with the same state.

To rotate the password, remove only its file and restart the dashboard:

```sh
docker compose exec dashboard rm /var/lib/agent-dashboard/password
docker compose restart dashboard
docker compose exec dashboard cat /var/lib/agent-dashboard/password
```

Existing dashboard sessions become invalid after the restart. The dashboard
does not change provider credentials or mint T3 pairing grants.

## Files and editing

| Location | Purpose |
| --- | --- |
| `/home/agent/.codex/AGENTS.md` | Codex global instructions |
| `/home/agent/.codex/AGENTS.override.md` | Codex global override, which takes precedence when non-empty |
| `/home/agent/.config/opencode/AGENTS.md` | OpenCode global instructions |
| `/workspace/**/AGENTS.md` | Workspace, repository, and nested project instructions |
| `/home/agent/.codex/config.toml` | Codex configuration |
| `/home/agent/.config/opencode/opencode.json` or `.jsonc` | OpenCode configuration |
| `/etc/agent-instructions/AGENTS.md` | Optional read-only Git publication |

T3 uses the installed providers; edit their instruction files here. This first
version does not edit T3's database/settings, authentication files, host settings,
or arbitrary paths. Custom provider home/config directory overrides are not
discovered automatically. The file list describes locations, not a calculation
of every agent's effective instruction hierarchy. In particular, OpenCode's
ancestor search and Codex's traversal differ; use repository `AGENTS.md` for
rules both should see in that repository. Project discovery is limited to
`/workspace`; T3 worktrees stored elsewhere in the home are not listed.

Select a file, edit it, and use **Review & save** to inspect the diff before
writing. Markdown has a preview; embedded HTML is escaped and remote images
are not fetched. TOML and JSONC syntax is checked before saving, preserving your
comments and formatting. Validation does not check the full provider schema or
whether a particular model, plugin, or MCP server works. If neither OpenCode
config exists, the dashboard offers JSONC; it avoids creating a second global
configuration alongside an existing one.

Before replacing an existing file, the API saves a private backup. **Version
history** loads an older version as a draft; review and save it to restore.
Backups are retained until you remove them from the state volume, so include
their storage in your disk budget. An external edit normally produces a conflict
instead of overwriting the newer contents. Reloading discards the current draft;
copy anything you want to preserve first. Revision checks are not a filesystem
lock against another process writing at the exact instant of replacement.

Use **Rescan files** after adding repositories or editing files outside the UI.
Scanning stops at six directory levels, 2,000 directories, or 400 documents and
skips hidden/generated/dependency directories. Missing files are offered at the
workspace root and detected Git repository roots. The editor limit is 128 KiB.
Start a fresh agent session after instruction edits. Configuration changes may
also require restarting the affected provider or workspace service.

## Git-synchronized instructions

With [host Git synchronization](instructions.md) enabled, Compose mounts the
published directory into both services read-only. Global instruction symlinks
and the shared source are shown as Git-managed. Edit the source Git repository
and let the existing host sync publish it; the dashboard does not replace those
links, write into the publication, run Git, or start cron. Other symlink targets
are not readable/editable through the dashboard.

## Storage and access

`agent-home` and `agent-workspace` are shared with the workspace service.
`dashboard-state` persists the password and backups under
`/var/lib/agent-dashboard`. All three volumes survive recreation; `down -v`
deletes them. Both services use UID/GID 1000 for application files. Existing
bind mounts need matching ownership; the dashboard never recursively changes
ownership. The dashboard runs without root, a Docker socket, or permission to
execute workspace commands. It has a read-only root filesystem and writable
data volumes. Its filesystem/API checks do not isolate it from code already
running as the same user in the shared workspace.

The port binds to loopback by default. For another interface, set
`DASHBOARD_BIND_ADDRESS` and `DASHBOARD_PORT` in `.env`. The T3 link comes from
`T3_PUBLIC_URL`. For a reverse proxy, give the dashboard its own HTTPS origin:

```dotenv
DASHBOARD_BIND_ADDRESS=127.0.0.1
DASHBOARD_PORT=3780
DASHBOARD_PUBLIC_URL=https://box.example.com
T3_PUBLIC_URL=https://code.example.com
```

Proxy the dashboard origin to port 3780, preserving its path and host. Setting
`DASHBOARD_PUBLIC_URL` checks browser write origins and enables Secure session
cookies; use HTTPS consistently afterward. TLS/proxy setup is supplied by the
operator. Login grants access to configurations that can contain secrets;
treat dashboard access and backups accordingly. T3 Connect does not publish
this separate dashboard service.

## Development and checks

Use Node.js 24 and pnpm 12.11.2. The lockfile pins frontend/backend dependencies.
For development, use disposable paths rather than your actual agent home:

```sh
cd dashboard
pnpm install --frozen-lockfile
pnpm test
pnpm build
fixture=$(mktemp -d)
mkdir -p "$fixture/home" "$fixture/workspace" "$fixture/state"
AGENT_HOME="$fixture/home" AGENT_WORKSPACE="$fixture/workspace" \
  DASHBOARD_STATE="$fixture/state" HOST=127.0.0.1 PORT=3780 \
  node dist/server/index.js
```

Read the generated password from `$fixture/state/password` in another terminal.
For Vite hot reload, run `pnpm dev` alongside `pnpm dev:api` with the same fixture
variables, `PORT=3781`, and `DASHBOARD_PUBLIC_URL=http://127.0.0.1:5173` on the API.

From the repository root:

```sh
docker build --check -f dashboard/Dockerfile .
docker build -f dashboard/Dockerfile -t agent-container-dashboard:check .
uv run tests/dashboard.py agent-container-dashboard:check
```

The packaged test uses uniquely named disposable containers/volumes and removes
only those resources. It covers login, shared file writes, stale revisions,
backups, complete container recreation, session persistence, and logout.

Local validation also covers API file boundaries, symlink/credential-path
rejection, JSONC/TOML syntax, project discovery, and cross-origin writes.
Browser checks cover the editor, review/save, preview, history, read-only Git
sources, and responsive layout with fixture files. Docker builds run on arm64
natively and amd64 under emulation. The base Compose stack is checked with an
isolated project; sharing volumes with a live Sysbox workspace and access from
remote devices remain separate deployment checks.
