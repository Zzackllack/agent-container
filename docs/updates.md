# T3 nightly updates and persistent installations

T3 follows the nightly release train. The image contains a checksum-verified
nightly seed resolved during the build, without an exact nightly version pin.
OpenCode **2.0.29** is installed separately as a native, checksum-pinned v2 package.
Codex, OpenCode, GitHub CLI, and Docker remain image-managed.

## What persists

The existing `agent-home:/home/agent` volume contains all of T3's installation
and state. No additional host directory or executable mount is required:

| Path inside the home volume | Purpose |
| --- | --- |
| `.t3/runtime/versions/<version>/` | Complete downloaded runtime, web UI, terminal helpers, and resource monitor |
| `.t3/runtime/service-state.json` | Updater-selected version and update/rollback state |
| `.t3/runtime/db-backup/` | Database snapshots made by the upstream updater |
| `.t3/userdata/` | Database, settings, pairing identity, and credentials |

On the first T3 invocation, `scripts/t3-runtime.sh` copies the image seed into
this volume and creates the initial launcher state. If launcher state already
exists, it uses that selection, including pending-update recovery. It never
replaces it with the image seed. A broken or missing selected runtime produces
an error instead of silently downgrading a newer database.

`/usr/local/bin/t3` resolves the active version for CLI commands. The default
`workspace-t3` command starts the bundled `t3 __service-launcher` in the
foreground. That launcher supervises the server, accepts in-app updates, stages
new runtimes, and manages database migration/rollback. It stays alive while the
server version changes. Docker handles container restarts; no systemd service is
installed inside the container.

This integrates T3's internal launcher interface, currently protocol 3. A future
nightly can change it; the real update test checks this integration. See the
[upstream launcher](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/serviceLauncher.ts)
and [upstream update implementation](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/cloud/selfUpdate.ts).

## Update from T3

Use the nightly desktop/mobile client and its **Update server** action when it
offers a newer version. T3 targets the requesting client's exact version; the
nightly train is not polled on every container start. An update may briefly
interrupt the connection while its launcher replaces the server. Restarting or
recreating the container continues from the committed version in `agent-home`.

The bundled web UI follows the installed server. Rebuilding the image updates
its seed for new homes; it does not override an existing home's selected version.
`T3_REFRESH` only changes the build-cache key for fetching the seed. To explicitly
refresh it, while retaining the rest of the tool cache:

```sh
T3_REFRESH=$(date -u +%Y%m%d%H%M%S) docker compose build workspace
docker compose up -d --wait
docker compose exec --user agent workspace t3 --version
```

Use your normal `COMPOSE_FILE`/`-f` overrides, including Sysbox when applicable.
The version reported by `t3 --version` is the selected runtime; it can differ
from `/opt/t3/.install-complete`, which records the image seed.

Do not use `t3 service install` or `t3 service update` in this container: those
manage host boot services. Use the in-app updater to activate T3 releases; the
plain `t3 update` command does not manage this Compose-owned launcher.

Keep the complete home volume in backups. Removing `agent-home` deletes both
the installation and its data; `docker compose down -v` does that. If an update
requires manual recovery, stop the workspace before restoring a matching home
backup. Do not start an old image against a newer database to undo a migration.

## Moving an existing stable workspace

Rebuild and recreate it with its existing Compose project name and volumes. A
home without launcher state gets the nightly seed on first launch; existing
`userdata` stays in place for T3's own migration. Keep a backup before the first
transition if the existing history matters.

OpenCode v2 reads supported v1 config and the existing global `AGENTS.md` path.
Its plugins and server API changed; v1 plugins need porting. Legacy
`~/.config/opencode/config.json` is ignored by v2: move it to `opencode.jsonc`
when that is your only global config. The Context7 helper refuses that legacy
filename rather than writing a key/configuration OpenCode would ignore.
See the [OpenCode migration guide](https://opencode.ai/v2/docs/migrate-v1).

## Validation

Run the real update test on the Docker host:

```sh
uv run tests/t3-update.py agent-container:check
```

It downloads the preceding nightly into a disposable home, starts the upstream
launcher, pairs a temporary client, and calls the same `server.updateServer` RPC
used by the application. It verifies committed activation, container restart,
and full recreation with the same home volume. It removes its own containers
and volume and does not use provider credentials.

The Context7 tests exercise v2's global config editor and a live OpenCode server
with fake keys, waiting for asynchronous configuration plugin activation.
The 2026-10-14 image built on native arm64 and emulated amd64. Both architectures
passed CLI startup and launcher preflight. On native arm64, the actual update
from `0.0.46-nightly.20261014.3105` to `0.0.46-nightly.20261014.3118` committed and
survived both restart and recreation; these are recorded test versions, not pins.
Provider login, a real Context7 query, native client compatibility, and
agent-driven builds remain separate checks. Earlier Sysbox integration evidence
is recorded in the [validation guide](validation.md); local Docker Desktop tests
do not repeat it.
