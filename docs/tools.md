# Tools and provider setup

The image uses `debian:trixie-slim` (Debian 13) and supports Linux amd64 and arm64.
It includes Git, curl, CA certificates, SSH client, jq, ripgrep, less, nano,
process/network tools, archive utilities, and a basic C/C++ build toolchain.
GitHub CLI **2.102.0** is also installed from checksum-pinned upstream packages.
APT is supplied by Debian; install extra packages with `sudo apt-get update` and
`sudo apt-get install ...`. Package changes made inside a container disappear
when that container is removed; add lasting tools to the Dockerfile.

For example, an agent can run `sudo apt-get update` followed by
`sudo apt-get install -y python3 python3-venv`. The `agent` user has passwordless
sudo. Language-specific tools such as pnpm and uv are not preinstalled in the
workspace; install those when needed or extend the workspace image for repeatable
project toolchains. The dashboard's Node runtime belongs to its separate image.

Docker Engine/CLI **29.8.2**, containerd **2.3.6**, Buildx **0.37.1**, and Compose
**5.6.0** are installed from Docker's signed Debian repository with exact package
versions in `versions/docker.env`. The repository signing key is checksum-pinned.
These are the tools inside the workspace; the host can use a different version.

## OpenCode and T3 Code

- **OpenCode 2.0.29:** native glibc binary; the amd64 build uses the baseline
  variant for CPUs without AVX2. Automatic OpenCode updates are disabled.
- **T3 Code nightly:** standalone Linux server runtime with its bundled web UI,
  terminal support, and resource monitor. No desktop GUI installation or separate
  Node.js installation is needed.

OpenCode's version and architecture-specific SHA-256 hashes live in
`versions/opencode.env`; its native packages come from npm without requiring
Node.js. T3's installer resolves the latest nightly and verifies its archive
against that release's `SHA256SUMS`. No exact T3 nightly is pinned in this repo.
The 0.0.46 nightly train supports OpenCode v2; stable T3 0.0.45 does not.

Configure provider authentication in the workspace environment:

```sh
docker compose exec --user agent workspace opencode auth login
docker compose exec --user agent workspace codex login --device-auth
```

In T3's web UI, open **Settings → Providers** for this environment and enable
OpenCode and/or Codex. The installed paths are `/usr/local/bin/opencode` and
`/usr/local/bin/codex`. Projects use container paths such as `/workspace/my-project`.
Provider access depends on the account or API credentials you configure. The
[recorded checks](validation.md) do not establish that a provider can run agent tasks.

Use T3's in-app server updater for T3 updates. Its selected version and complete
runtime live in `agent-home` alongside settings, database, pairing identity, and
credentials. Restarting, recreating, or rebuilding the container retains that
selection. See [nightly updates](updates.md).

Codex, OpenCode, GitHub CLI, and Docker still update through the image. Their
installations under `/opt` and `/usr/local/bin` remain root-owned; do not use
`opencode upgrade` to replace the image-managed executable.

## Codex CLI

Codex **0.161.0** is installed from the official native Linux package, including
its helper binaries. Node.js is not required for this installation. The version
and SHA-256 hashes for both architectures are pinned in `versions/codex.env`;
downloads are verified during the build. To upgrade, update all three values
using the release's `codex-package_SHA256SUMS`, update this guide, then rebuild.

Inside the container:

```sh
codex login --device-auth
# Open the printed link in a browser and enter the one-time code.
# Replace the URL with your repository.
git clone https://github.com/you/your-repo.git /workspace/my-project
cd /workspace/my-project
codex
```

Device-code login must be enabled in your ChatGPT account's security settings
or allowed by your workspace administrator. This login flow does not require
publishing an OAuth callback port. See the [official authentication guide](https://learn.chatgpt.com/docs/auth)
for other login methods.

Codex state is stored under `/home/agent/.codex` in the home volume. Login happens
at runtime; no credentials are included in the image or build context. T3 provides
the web interface for the installed CLIs; the Codex desktop app is not included.

The Codex/OpenCode launchers switch from root to `agent` when invoked through
Sysbox's default root exec user. Continue using `--user agent` for shells, GitHub
CLI, and other interactive commands. Do not call `/opt/codex/bin/codex` directly
as root: its private files would become unreadable to the agent processes.

### Permission denied during login

If an older image or a root shell created Codex state as root, repair only the
root-owned entries inside its persistent directory, without following symlinks:

```sh
docker compose exec --user root workspace sh -ec \
  'find /home/agent/.codex -xdev -uid 0 -exec chown -h agent:agent {} +'
docker compose exec --user agent workspace codex login status
```

This keeps credential permissions private and preserves sessions and existing
login. If status reports no login afterward, run `codex login --device-auth`
as `agent`. Do not make `auth.json` world-readable or paste its contents into logs.

The container boundary and Codex's own command sandbox are separate. This image
does not configure a Codex sandbox bypass. On the tested Ubuntu Sysbox host,
Codex required an executable-specific AppArmor exception. Docker commands also
require command network access and access to the inner socket. See the
[Codex sandbox checks and host exception](sysbox.md#codex-command-sandbox).

For GitHub and MCP configuration, see [GitHub CLI](github.md) and
[Context7 setup](context7.md). Versions and hashes are maintained in the
repository’s [version files](../versions/).
