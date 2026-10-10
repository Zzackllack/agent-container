# Working on agent-container

## Project scope

This repository builds a Debian 13 development container with Codex CLI,
OpenCode, and T3 Code's web interface. Docker Compose starts the workspace and
persists its home and project directories. `compose.sysbox.yaml` opts into an
internal Docker daemon on a Linux host with Sysbox. Local builds and launcher
checks do not establish working nested containers; verify that on a Sysbox host.

Keep the setup usable on unrelated hosts. Examples must use generic addresses,
domains, and repository names. Avoid personal paths, private issue links,
assumptions about a particular VPN, or snapshots of a contributor's devices.

## Where changes belong

- `Dockerfile`: base packages, tool installation, user, and default process.
- `compose.yaml`, `compose.sysbox.yaml`, and `.env.example`: runtime configuration.
- `compose.instructions.yaml`: opt-in read-only instruction directory mount.
- `scripts/sync-instructions.sh`: host-side Git fetch and atomic publication;
  `scripts/workspace-instructions.sh`: link global files without replacing them.
- `tests/sync-instructions.sh`: local Git fixtures and last-good publication.
- `tests/workspace-instructions.sh`: real mounts, symlinks, and atomic updates.
- `docs/instructions.md`: host credentials, initial sync, and cron setup.
- `versions/*.env`: pinned releases/checksums or exact signed APT package versions.
- `scripts/install-*.sh`: download, verify, and install upstream release packages.
  Docker copies each installer and its version file into the same temporary
  directory; installers expect this layout rather than running directly from
  the source tree.
- `scripts/t3-pair.sh`: advertise a client-reachable origin for T3's pairing URL.
- `scripts/agent-cli.sh`: Codex/OpenCode launchers loading the private Context7 key;
  native executables remain under `/opt/codex` and `/opt/opencode`.
- `scripts/context7-setup.sh`, `tests/context7-setup.sh`: hidden/stdin key setup,
  config preservation, and pinned-CLI validation without real credentials.
- `docs/github.md`, `docs/context7.md`: runtime auth/setup and verification.
- `tests/t3-pair.sh`: checks the helper using a mock CLI without real credentials.
- `config/docker-daemon.json`: inner daemon storage, socket, and log settings.
- `config/apparmor-codex-bwrap`: optional host-only Ubuntu namespace allowance;
  keep it out of the image and document its executable-path scope.
- `scripts/workspace-entrypoint.sh`: Docker readiness and process shutdown;
  `scripts/workspace-healthcheck.sh`: daemon and T3 health.
- `tests/workspace-entrypoint.sh`: lifecycle checks with a mock daemon;
  `tests/nested-docker.sh`: real inner build/Compose checks on a Sysbox workspace.
- `docs/sysbox.md`: host requirements, installation, operation, and verification.
- `README.md`: setup, access methods, current limitations, and recorded validation.

## Image and script changes

- Use POSIX `sh` for installers and simple helpers. The process launcher and its
  lifecycle test use Bash. Use strict error handling, quoted variables, and
  temporary-directory cleanup. Keep installers separate from runtime helpers.
- Verify pinned checksums before extracting archives; Docker packages use signed
  APT metadata and a checksum-pinned key. Support `amd64` and `arm64`, and reject
  unsupported architectures explicitly.
- Preserve complete upstream packages when bundled helpers are required. Codex
  and T3 cannot be reduced to just their main executable.
- Check official release notes and upstream documentation before changing tool
  pins. OpenCode is deliberately pinned to v1; check its compatibility with T3
  when updating either tool. Update both architecture hashes and README versions.
- Keep tool upgrades in the image build. Preserve disabled OpenCode auto-update
  and root-owned installations instead of replacing binaries at runtime.
- GitHub CLI archives are pinned in `versions/gh.env`. Keep Context7 setup on the
  hosted HTTP transport; use the existing native config editors rather than
  adding a separate Node runtime or hand-editing TOML/JSONC.
- Install APT packages with `--no-install-recommends` and remove package lists in
  the same layer. Add new `COPY` inputs to the `.dockerignore` allowlist; keep
  credentials and workspace files out of the build context.

## Runtime boundaries

- Preserve loopback publishing, configurable host bindings, and T3 pairing.
  The launcher manages Docker and T3 together in Sysbox mode; Compose owns
  restart and process reaping. Do not add a background systemd service for T3.
- The default user is `agent` (UID/GID 1000), with sudo inside the container.
  Keep `/home/agent` and `/workspace` persistent and owned by that user. The Sysbox
  override starts as root, then launches the application with `setpriv` as agent.
  Use `compose exec --user agent` for interactive work.
- Do not use a host Docker socket mount or `privileged: true` as a shortcut for
  nested Docker. Keep Sysbox opt-in for this workspace, the Docker API on its
  internal Unix socket, and inner data exclusively in `/var/lib/docker`. Preserve
  classic `overlay2` storage and disabled containerd snapshotters/userns-remap.
  Keep socket access on the primary `agent` group; supplementary groups are
  unmapped in Codex's nested user namespace. Docker access controls the workspace
  and can perform writes beyond Codex's direct filesystem permissions.
- Keep instruction synchronization on the host; mount only its published
  directory read-only. Do not bake personal rules or Git credentials into the
  image, mount the repository cache, overwrite existing global files, or start
  cron inside the workspace. Keep failed syncs from replacing the last-good file.
- Do not commit `.env`, provider credentials, home-volume contents, or real
  pairing URLs. Mint grants through T3 and preserve the credential fragment when
  rewriting an origin; do not implement a separate authentication mechanism.
- Accept Context7 keys through a hidden prompt or stdin, never command arguments
  or logs. Keep the key, configs, and backups private; test only with fake keys.
  Avoid displaying raw provider config/debug output with resolved credentials.

## Verification

Run these checks from the repository root after relevant changes:

```sh
git diff --check
docker compose config --quiet
docker compose -f compose.yaml -f compose.sysbox.yaml config --quiet
for script in scripts/*.sh tests/*.sh; do bash -n "$script"; done
sh tests/t3-pair.sh
```

For image, installer, or version changes, also run:

```sh
docker build --check .
docker build -t agent-container:check .
docker run --rm --init agent-container:check sh -ec \
  'codex --version; opencode --version; t3 --version; gh --version; docker --version; docker compose version; docker buildx version; sudo dockerd --validate'
docker run --rm --init --user 0:0 \
  --mount "type=bind,source=$PWD,target=/tests,readonly" \
  agent-container:check bash /tests/tests/workspace-entrypoint.sh
docker run --rm --init --user 0:0 \
  --mount "type=bind,source=$PWD,target=/tests,readonly" \
  agent-container:check bash /tests/tests/sync-instructions.sh
bash tests/workspace-instructions.sh agent-container:check
docker run --rm --init \
  --mount "type=bind,source=$PWD,target=/tests,readonly" \
  agent-container:check bash /tests/tests/context7-setup.sh
```

Validate architecture-specific changes on both Linux architectures and state
whether checks ran natively or under emulation. For server or Compose behavior,
use a separate Compose project and an unused loopback port so existing workspace
volumes and services are unaffected. Remove only disposable test resources;
`docker compose down -v` deletes that project's persistent data.

CLI startup, provider discovery, and a model catalog do not prove authenticated
agent tasks. Local browser checks do not prove native-client compatibility or
remote reachability. Record what was tested and any remaining limitations; do
not disable Codex's command sandbox just to make a check pass.

## Handoff

Keep README instructions aligned with changed behavior. Use Conventional Commits
with a body explaining non-obvious decisions and validation. Summarize checks and
unverified behavior when handing work back. Push, publish, and deploy only when
explicitly requested.
