# Tools and provider setup

The image uses `debian:trixie-slim` (Debian 13) and supports Linux amd64 and arm64.
It is meant to be usable without a setup step: an agent should be able to open a
shell and build most projects it is handed. Everything below is image-managed
and version-pinned in `versions/`; `tests/toolchain.sh` checks the installed
versions against those pins.

## Preinstalled toolchains

| Tool | Version | Source |
| --- | --- | --- |
| Node.js | **24.22.0** (LTS) | `nodejs.org` tarball, SHA-256 pinned |
| pnpm / yarn | **12.11.2** / **1.22.22** | npm registry (integrity-checked) |
| uv (`uvx`) | **0.13.1** | Astral release archive, SHA-256 pinned |
| Go | **1.27.2** | `go.dev` tarball, SHA-256 pinned |
| Rust (rustc, cargo, rustfmt, clippy) | **1.99.1** | rustup with an image-managed toolchain |
| GitHub CLI | **2.102.0** | checksum-pinned release package |
| Python | **3.13.5** | Debian 13 (`python3`, `python3-venv`, `python3-dev`) |
| Docker Engine/CLI, containerd, Buildx, Compose | **29.9.1**, **2.4.2**, **0.38.0**, **5.6.0** | Docker's signed Debian repository |

Node.js lives in `/opt/node`, Go in `/usr/local/go`, and the Rust toolchain in
`/opt/rustup`; those trees are root-owned and stay image-managed, like Codex,
OpenCode, GitHub CLI, and Docker. `CARGO_HOME` is intentionally **not** set, so
`cargo install` and the cargo registry cache land in `~/.cargo` inside the home
volume. Node package caches, the pnpm store, uv's cache, and `GOPATH` follow the
same rule. Use `sudo npm install --global ...` for global npm packages, or pnpm
for unprivileged project-local installs.

uv manages its own Python builds in the home volume (`uv python install
3.13`), so projects needing a specific interpreter do not need `sudo`.

### Image size

The default workspace image is about 3.6 GB, and Node.js (~270 MB), Go
(~280 MB) and the Rust toolchain (~620 MB) are the largest new pieces. Go and
Rust are the easiest to leave out:

```sh
docker build --build-arg WITH_GO=0 --build-arg WITH_RUST=0 -t agent-container:slim .
```

That variant is roughly 2.7 GB and keeps every other tool. Published tags always
build the default variant.

## Preinstalled utilities

- **Search and navigation:** ripgrep, `fd`, bat, fzf, tree, `delta` (via
  `git config --global core.pagerDelta true` if you want it by default), less
- **Shell and terminal:** bash, zsh-free POSIX shell, tmux, `just`, zoxide,
  direnv
- **Files and transfer:** curl, wget, rsync, git-lfs, unzip/zip, xz, zstd, bzip2
- **Build:** build-essential, cmake, pkg-config, libssl-dev, protobuf-compiler
- **Data:** sqlite3, postgresql-client, jq
- **Diagnostics:** shellcheck, htop, process and network tools, openssl
- **Headless browsers:** the shared libraries Chromium needs (`libnss3`, `libgbm1`,
  `libasound2`, ATK, cups, X11 bits) plus `fontconfig`, DejaVu, Liberation fonts
  and Xvfb. Playwright or Puppeteer can then launch a browser after downloading
  its own browser build; the browsers themselves are not baked in.

Debian ships `fd` as `fdfind` and `bat` as `batcat`; the image adds the upstream
names in `/usr/local/bin`. GitHub CLI is installed from a checksum-pinned
upstream package. APT is supplied by Debian: install anything else with
`sudo apt-get update && sudo apt-get install ...`. Package changes made inside a
container disappear when that container is removed; add lasting tools to the
Dockerfile and pin their versions in `versions/`.

Deliberately **not** preinstalled, to keep the image and its pull time smaller:
other JavaScript runtimes (bun, Deno — `npm install --global bun` works),
cloud provider CLIs (aws, gcloud, az), Playwright/Puppeteer browser downloads,
prebuilt CPython toolchains (uv handles those), and IDEs. The dashboard's Node
runtime belongs to its separate image.

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

Codex **0.162.1** is installed from the official native Linux package, including
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

### OpenCode permission errors

Older root invocations can also leave OpenCode logs, state and credentials
unwritable by `agent`. Repair the root-owned entries in OpenCode's directories,
preserving file permissions and avoiding symlink traversal:

```sh
docker compose exec --user root workspace sh -ec '
  for p in /home/agent/.local /home/agent/.local/share /home/agent/.local/state /home/agent/.cache; do
    if [ -d "$p" ] && [ ! -L "$p" ] && [ "$(stat -c %u "$p")" = 0 ]; then
      chown agent:agent "$p"
    fi
  done
  for p in /home/agent/.local/share/opencode /home/agent/.local/state/opencode /home/agent/.cache/opencode /home/agent/.config/opencode; do
    if [ -d "$p" ] && [ ! -L "$p" ]; then
      find "$p" -xdev -uid 0 -exec chown -h agent:agent {} +
    fi
  done'
docker compose exec --user agent workspace opencode auth list
```

Do not delete the OpenCode directories: they contain persistent sessions and
credentials. New images give `agent` ownership of the XDG parent directories,
but existing home volumes still need the one-time repair above.

The container boundary and Codex's own command sandbox are separate. This image
does not configure a Codex sandbox bypass. On the tested Ubuntu Sysbox host,
Codex required an executable-specific AppArmor exception. Docker commands also
require command network access and access to the inner socket. See the
[Codex sandbox checks and host exception](sysbox.md#codex-command-sandbox).

For GitHub and MCP configuration, see [GitHub CLI](github.md) and
[Context7 setup](context7.md). Versions and hashes are maintained in the
repository’s [version files](../versions/).
