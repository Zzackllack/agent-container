# Working on agent-container

## Project scope

This repository builds a Debian 13 development container with Codex CLI,
OpenCode, and T3 Code's web interface. Docker Compose starts the workspace and
persists its home and project directories. Nested Docker and Sysbox integration
are planned; do not describe them as working until implemented and verified.

Keep the setup usable on unrelated hosts. Examples must use generic addresses,
domains, and repository names. Avoid personal paths, private issue links,
assumptions about a particular VPN, or snapshots of a contributor's devices.

## Where changes belong

- `Dockerfile`: base packages, tool installation, user, and default process.
- `compose.yaml` and `.env.example`: runtime configuration and portable defaults.
- `versions/*.env`: tool versions and SHA-256 hashes for amd64 and arm64.
- `scripts/install-*.sh`: download, verify, and install upstream release packages.
  Docker copies each installer and its version file into the same temporary
  directory; installers expect this layout rather than running directly from
  the source tree.
- `scripts/t3-pair.sh`: advertise a client-reachable origin for T3's pairing URL.
- `tests/t3-pair.sh`: checks the helper using a mock CLI without real credentials.
- `README.md`: setup, access methods, current limitations, and recorded validation.

## Image and script changes

- Use readable POSIX `sh` for scripts, with `set -eu`, quoted variables, and
  temporary-directory cleanup. Keep installers separate from runtime helpers.
- Verify pinned checksums before extracting downloads. Support both `amd64` and
  `arm64`, and reject unsupported architectures explicitly.
- Preserve complete upstream packages when bundled helpers are required. Codex
  and T3 cannot be reduced to just their main executable.
- Check official release notes and upstream documentation before changing tool
  pins. OpenCode is deliberately pinned to v1; check its compatibility with T3
  when updating either tool. Update both architecture hashes and README versions.
- Keep tool upgrades in the image build. Preserve disabled OpenCode auto-update
  and root-owned installations instead of replacing binaries at runtime.
- Install APT packages with `--no-install-recommends` and remove package lists in
  the same layer. Add new `COPY` inputs to the `.dockerignore` allowlist; keep
  credentials and workspace files out of the build context.

## Runtime boundaries

- Preserve loopback publishing by default, configurable host bindings, and T3's
  pairing authorization. Compose owns the foreground server; do not add another
  supervisor or a background systemd installation for T3.
- The default user is `agent` (UID/GID 1000), with sudo inside the container.
  Keep `/home/agent` and `/workspace` persistent and owned by that user.
- Do not use a host Docker socket mount or `privileged: true` as a shortcut for
  the planned nested Docker setup. Keep Sysbox opt-in for this workspace.
- Do not commit `.env`, provider credentials, home-volume contents, or real
  pairing URLs. Mint grants through T3 and preserve the credential fragment when
  rewriting an origin; do not implement a separate authentication mechanism.

## Verification

Run these checks from the repository root after relevant changes:

```sh
git diff --check
docker compose config --quiet
for script in scripts/*.sh tests/*.sh; do sh -n "$script"; done
sh tests/t3-pair.sh
```

For image, installer, or version changes, also run:

```sh
docker build --check .
docker build -t agent-container:check .
docker run --rm --init agent-container:check sh -ec \
  'codex --version; opencode --version; t3 --version'
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
