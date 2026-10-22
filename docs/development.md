# Working on agent-container

The workspace image, Sysbox override, and configuration dashboard have separate
runtime responsibilities. Read the relevant guide before changing one:

- [Architecture and isolation](architecture.md): scope and trust boundaries.
- [Sysbox](sysbox.md): daemon settings, nested namespaces, host verification.
- [Nightly updates](updates.md): persistent runtime and launcher protocol.
- [Agent instructions](instructions.md): local files and legacy migration.
- [Dashboard](dashboard.md): file API boundaries, frontend development and tests.
- [Recorded validation](validation.md): historical evidence and unverified behavior.

## Image and installer changes

- Use POSIX `sh` for installers and simple helpers. The process launcher and its
  lifecycle test use Bash. Use strict error handling, quoted variables, and
  temporary-directory cleanup. Keep installers separate from runtime helpers.
- Verify pinned checksums before extracting archives; Docker packages use signed
  APT metadata and a checksum-pinned key. Support `amd64` and `arm64`, and reject
  unsupported architectures explicitly. cloudflared follows the same signed APT
  route with Cloudflare's repository key.
- Preserve complete upstream packages when bundled helpers are required. Codex
  and T3 cannot be reduced to just their main executable.
- Docker copies each installer and its version file into the same temporary
  directory; installers expect that layout rather than a source-tree invocation.
- T3 follows nightly without an exact version pin. Resolve the current train at
  image build time and verify the release's SHA256SUMS. `T3_REFRESH` bypasses the
  install layer cache. Existing homes keep the updater-selected runtime.
- OpenCode uses v2 native npm platform archives. Check upstream documentation
  before changing pins; update both architecture hashes and [documented versions](tools.md).
- Codex, OpenCode, GitHub CLI, and Docker remain image-managed. T3 is the runtime
  exception: keep complete writable installations and upstream service state in
  `$T3CODE_HOME/runtime`; never overwrite them on restart or image rebuild.
- Run T3's bundled `__service-launcher` in the foreground, without systemd. Its
  protocol is currently 3. Use the real update test to detect upstream changes;
  do not fake update capabilities or replace the upstream update protocol.
- GitHub CLI archives are pinned in `versions/gh.env`. Keep Context7 setup on the
  hosted HTTP transport; use the existing native config editors rather than
  adding a separate Node runtime or hand-editing TOML/JSONC.
- Install APT packages with `--no-install-recommends` and remove package lists in
  the same layer. Add new `COPY` inputs to the `.dockerignore` allowlist; keep
  credentials and workspace files out of the build context.
- Language toolchains (Node.js, uv, Go, Rust, Java, Maven) are image-managed
  under `/opt` and `/usr/local`, with versions and per-architecture hashes in
  `versions/`. Java is the exception to the checksum rule: it uses the Debian
  OpenJDK package because Debian ships the current LTS release. Keep caches that
  agents write to (`GOPATH`, pnpm store, uv, `~/.cargo`, Maven's `~/.m2`) in the
  home volume instead of the image, and leave `CARGO_HOME` unset. Debian names
  some binaries differently upstream (`fdfind`, `batcat`); add the expected alias
  in the Dockerfile and assert it in `tests/toolchain.sh`.
- The heaviest toolchains (Go, Rust, Java with Maven) sit behind `WITH_GO`,
  `WITH_RUST`, and `WITH_JAVA` build arguments that default to `1`. Keep that
  pattern for new multi-hundred-megabyte additions, and keep
  `tests/toolchain.sh` skipping them only when the binary is really absent.

## Runtime constraints

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
- Keep instruction files in the persistent home/workspace volumes. The dashboard
  edits allowlisted local files; do not add background Git sync or cron.
- Do not commit `.env`, provider credentials, home-volume contents, or real
  pairing URLs. Mint grants through T3 and preserve the credential fragment when
  rewriting an origin; do not replace T3's authentication mechanism.
  The configuration dashboard has its own password/session, independent of T3.
  Keep it loopback-bound by default and never use it to bypass T3 authorization.
- Reject linked instruction files in the dashboard. Never expose arbitrary home
  files, authentication stores, or command execution via its API. Use private
  backups and revision checks before replacing local files.
- Accept Context7 keys through a hidden prompt or stdin, never command arguments
  or logs. Keep the key, configs, and backups private; test only with fake keys.
  Avoid displaying raw provider config/debug output with resolved credentials.

## Verification

Run these checks from the repository root after relevant changes:

```sh
git diff --check
docker compose config --quiet
docker compose -f compose.yaml -f compose.sysbox.yaml config --quiet
docker compose -f compose.yaml -f compose.browser.yaml config --quiet
docker compose -f compose.yaml -f compose.sysbox.yaml -f compose.browser.yaml config --quiet
docker compose -f compose.yaml -f compose.sysbox.yaml -f compose.browser-unsandboxed.yaml config --quiet
for script in scripts/*.sh tests/*.sh; do bash -n "$script"; done
sh tests/t3-pair.sh
```

For image, installer, or version changes, also run:

```sh
docker build --check .
docker build -t agent-container:check .
docker run --rm --init agent-container:check sh -ec \
  'codex --version; opencode --version; t3 --version; gh --version; docker --version; docker compose version; docker buildx version; sudo dockerd --validate'
docker run --rm --init \
  --mount "type=bind,source=$PWD,target=/tests,readonly" \
  agent-container:check bash /tests/tests/toolchain.sh
docker run --rm --init --user 0:0 \
  --mount "type=bind,source=$PWD,target=/tests,readonly" \
  agent-container:check bash /tests/tests/workspace-entrypoint.sh
docker run --rm --init --user 0:0 \
  --mount "type=bind,source=$PWD,target=/tests,readonly" \
  agent-container:check bash /tests/tests/agent-cli.sh
docker run --rm --init \
  --mount "type=bind,source=$PWD,target=/tests,readonly" \
  agent-container:check bash /tests/tests/context7-setup.sh
uv run tests/t3-update.py agent-container:check
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

For dashboard changes, run these from `dashboard/`:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
```

For dashboard packaging/persistence, run from the repository root:

```sh
docker build --check -f dashboard/Dockerfile .
docker build -f dashboard/Dockerfile -t agent-container-dashboard:check .
uv run tests/dashboard.py agent-container-dashboard:check
```

Documentation-only changes need link/anchor and Markdown rendering checks,
not a full image rebuild.

## Handoff

Keep README instructions aligned with changed behavior. Use Conventional Commits
with a body explaining non-obvious decisions and validation. Summarize checks and
unverified behavior when handing work back. Push, publish, and deploy only when
explicitly requested.
