# agent-container

A containerized development workspace for AI coding agents, intended to run
24/7 on an existing Linux server. The workspace will provide development tools,
repository checkouts, and its own Docker daemon so agents can build images and
run container-based tests.

**Status:** the Debian 13 image includes Codex, pinned OpenCode v1, and T3 Code.
Compose starts T3's web server with persistent storage and a configurable host
port. The internal Docker daemon, Sysbox runtime setup, and server deployment
are still pending.

## Build and use

```sh
cp .env.example .env
docker compose up -d --build --wait
docker compose exec workspace t3-pair
```

Open the printed one-time pairing URL in your browser. The default host binding
is `127.0.0.1:3773`; the container listens on `0.0.0.0:3773` so Docker can forward
that port. T3's own pairing and device authorization remain enabled. An unpaired
browser cannot control the workspace just by knowing its address.

The image starts `t3 serve` in the foreground. Compose handles restart and process
reaping; no systemd service is installed inside the container. To open a shell:

```sh
docker compose exec workspace bash
```

The image uses `debian:trixie-slim` (Debian 13) and supports Linux amd64 and arm64.
It includes Git, curl, CA certificates, SSH client, jq, ripgrep, less, nano,
process/network tools, archive utilities, and a basic C/C++ build toolchain.
APT is supplied by Debian; install extra packages with `sudo apt-get update` and
`sudo apt-get install ...`. Package changes made inside a container disappear
when that container is removed; add lasting tools to the Dockerfile.

The default user is `agent` (UID/GID 1000), with passwordless sudo inside the
container. Compose persists the complete `/home/agent` directory in `agent-home`
and repository checkouts in `agent-workspace`. This includes Codex credentials,
OpenCode configuration/data/cache, T3's database, pairing identity, provider
settings, and T3-managed worktrees. Volume names are scoped to the Compose project.
They survive container recreation and image rebuilds; `docker compose down -v`
deletes them. Keep the home volume private and include both volumes in backups.

Bind-mounted directories need compatible ownership on Linux. The previous manual
`docker run` example's volumes are not automatically imported into these Compose
volumes.

## OpenCode and T3 Code

- **OpenCode 1.18.35:** native glibc binary; the amd64 build uses the baseline
  variant for CPUs without AVX2. Automatic OpenCode updates are disabled.
- **T3 Code 0.0.45:** standalone Linux server runtime with its bundled web UI,
  terminal support, and resource monitor. No desktop GUI installation or separate
  Node.js installation is needed.

Versions and architecture-specific SHA-256 hashes live in `versions/opencode.env`
and `versions/t3.env`. Both installers verify downloads during the image build.
T3 0.0.45 supports OpenCode v1; the 0.0.46 train changes compatibility in favor
of OpenCode v2. Keep these pins together when evaluating upgrades.

Authenticate providers in this container, not on the Mac controlling it:

```sh
docker compose exec workspace opencode auth login
docker compose exec workspace codex login --device-auth
```

In T3's web UI, open **Settings → Providers** for this environment and enable
OpenCode and/or Codex. The installed paths are `/usr/local/bin/opencode` and
`/usr/local/bin/codex`. Projects use container paths such as `/workspace/my-project`.
Provider sign-in and a real agent task still need to be verified with your account.

Update tools through their version files and an image rebuild. Do not use T3's
remote server update button or `opencode upgrade` to change this pinned image.
Installed tools under `/opt` and `/usr/local/bin` are root-owned; interactive
clients should not replace them.

## Connect from the Mac, iPhone, or another browser

Direct pairing works when the device can reach the host's published port. On the
Linux server, set `T3_BIND_ADDRESS` in `.env` to its actual **NetBird IP**, and set
`T3_PUBLIC_URL` to `http://<server-NetBird-IP>:3773` (adjust the port if needed).
Then recreate the service and mint a fresh link:

```sh
docker compose up -d --wait
docker compose exec workspace t3-pair
# Or override the advertised origin for this link:
# Replace this example address with the server's actual NetBird IP.
docker compose exec workspace t3-pair http://100.100.100.42:3773
```

`t3-pair` uses T3 to mint a five-minute, one-time grant and replaces the container's
internal address with the advertised origin. Use a separate fresh URL per device.
Paste it into **Settings → Connections → Add environment** on the Mac, or
**Settings → Environments** on iPhone. A paired browser uses the same environment.
NetBird must be connected on the client and allow traffic to the server's port.
Pairing links are credentials; do not share them in issues or screenshots.

Your Mac currently uses the 0.0.46 nightly train, while this server is pinned to
stable 0.0.45. Native client compatibility across those releases is not yet
verified. If an app requests a server upgrade or rejects the version, use a
compatible stable client or deliberately upgrade the image and recheck OpenCode
compatibility. The container's own web UI matches its server version.

T3 Connect is an alternative to direct private-network access:

```sh
docker compose exec workspace t3 connect
# Complete the browser/code sign-in. Decline background service installation;
# Compose already owns the server process.
docker compose restart workspace
```

Sign in to the same T3 Connect account on the Mac/iPhone and select the environment.
This opt-in path contacts T3's service; it is not required for NetBird pairing.
The hosted `app.t3.codes` frontend requires an HTTPS backend. For a private HTTP
NetBird endpoint, use this container's web UI or direct pairing in the native app.
For hosted-web access, configure HTTPS with WebSocket forwarding, or use T3 Connect.

See [T3 remote access](https://github.com/pingdotgg/t3code/blob/v0.0.45/docs/user/remote-access.md)
for the supported connection and authorization flows.

### Codex CLI

Codex **0.161.0** is installed from the official native Linux package, including
its helper binaries. Node.js is not required for this installation. The version
and SHA-256 hashes for both architectures are pinned in `versions/codex.env`;
downloads are verified during the build. To upgrade, update all three values
using the release's `codex-package_SHA256SUMS`, update the version here, then
rebuild.

Inside the container:

```sh
codex login --device-auth
# Open the printed link on your Mac and enter the one-time code.
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

The container boundary and Codex's own command sandbox are separate. This image
does not configure a Codex sandbox bypass. Whether its Linux sandbox works under
the eventual Sysbox runtime needs testing on the selected server.

### Verification so far

Both images build and run locally: arm64 natively, amd64 under Docker Desktop
emulation. All three CLI version checks pass, and T3 serves its environment
descriptor on both architectures. Docker's build checks report no warnings.

On arm64, Compose reaches healthy status, an unpaired browser sees the pairing
screen, and a one-time link opens the working web UI. T3 detects Codex 0.161.0
and OpenCode 1.18.35 and loads OpenCode's model catalog. Container recreation
preserves home/workspace files, the T3 database, and the paired browser session.
`sh tests/t3-pair.sh` checks address rewriting and rejection of malformed origins.

These checks do not cover authenticated provider tasks, native Mac/iPhone
connections, T3 Connect, NetBird reachability, or nested Docker. The baseline Git,
C compilation, and sudo checks passed before this addition.

On the Mac's Docker Desktop with the default runtime, `codex sandbox linux /bin/true`
fails because bubblewrap cannot create a namespace. The image's CLI installation
works, but that does not establish working sandboxed agent execution. Resolving
and testing that under Sysbox is part of the server setup.

## Why we're building it

The projects we work on need more than file edits. Verifying a change can require
starting application containers, databases, and entire Docker Compose stacks.
An agent needs that capability to complete the development workflow.

We want a repeatable environment on infrastructure we already own, without
buying a dedicated machine or giving the agent control of the server's Docker
daemon. Keeping the setup in a separate repository makes the tools and
configuration easier to review, rebuild, and maintain.

The focus is development: editing repositories, building software, running
tests, and inspecting results. Chat bots and general-purpose assistant
integrations are outside the initial scope.

## What makes this setup different

- **Docker inside the workspace.** The agent uses an internal Docker daemon for
  project containers, with its own images, networks, build cache, and volumes.
- **Sysbox for the outer container.** Sysbox is installed on the Linux host and
  selected for this workspace with `runtime: sysbox-runc`. It enables nested
  Docker without the conventional privileged outer container or a mount of the
  host's Docker socket.
- **An additional runtime, not a server-wide migration.** Existing services can
  keep their current runtime. Sysbox will be selected explicitly for the agent
  workspace rather than made the server's default.
- **Persistent work with a rebuildable environment.** Repository checkouts and
  inner Docker state will use dedicated storage, separate from the image that
  supplies development tools.
- **Remote access through published ports.** Development services and a future
  agent interface can be reached through explicit port mappings, including
  bindings to the server's NetBird address.
- **Choice of agent tools.** The environment should support the tools we choose
  without tying its Docker capability to a particular chat interface or provider.

## Isolation and practical limits

Sysbox maps the workspace's root user to an unprivileged user on the host. It
still shares the host's Linux kernel and changes some of Docker's normal
security settings to support system workloads. It is not a VM or a guarantee
that arbitrary code cannot escape.

Files, credentials, and network destinations deliberately made available to the
workspace remain accessible to code running there. Mounts and credentials must
therefore be scoped to the development work.

Host compatibility and installation impact need to be checked before deployment.
Installing Sysbox may affect Docker configuration or require a daemon restart.
Its own installation is small, but project images, build caches, and test data
need a separate disk budget; a container memory limit does not limit that storage.

## Next steps

1. Select an existing server and check Sysbox compatibility, available resources,
   and the impact of installation on its current services.
2. Add the internal Docker daemon and select the Sysbox runtime in Compose,
   including persistent Docker storage. Configure the selected host's NetBird IP.
3. Verify Codex command execution, a real repository's image builds, and Compose
   tests inside the Sysbox workspace. Add project-specific runtimes as needed.

## References

- [Original discussion: Configs issue #148](https://github.com/Zzackllack/Configs/issues/148)
- [Sysbox](https://github.com/nestybox/sysbox)
- [Sysbox Docker-in-Docker guide](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/dind.md)
- [Sysbox installation and coexistence with Docker](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-package.md)
- [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)
- [Codex release packages](https://github.com/openai/codex/releases)
- [OpenCode 1.18.35](https://github.com/anomalyco/opencode/releases/tag/v1.18.35)
- [T3 Code 0.0.45](https://github.com/pingdotgg/t3code/releases/tag/v0.0.45)
