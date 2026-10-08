# agent-container

A containerized development workspace for AI coding agents, with Codex CLI,
OpenCode, and T3 Code's web interface. Run it locally with Docker or keep it
available on a Linux server, with tools and configuration maintained in one
rebuildable image.

**Status:** the Debian 13 image includes Codex, pinned OpenCode v1, and T3 Code.
Compose starts T3's web server with persistent storage and a configurable host
port. An opt-in Sysbox configuration starts an internal Docker daemon for image
builds and container-based tests. This integration still needs end-to-end
verification on a compatible Linux host.

## Build and use

Requirements: Docker Engine or Docker Desktop with Docker Compose v2 and support
for Linux containers. The image supports `linux/amd64` and `linux/arm64`.
Clone this repository and run the following commands from its root:

```sh
cp .env.example .env
docker compose up -d --build --wait
docker compose exec --user agent workspace t3-pair
```

This starts T3 with the internal Docker daemon disabled. To enable Docker-in-Docker
on a Linux host with Sysbox, follow the [Sysbox setup guide](docs/sysbox.md) and
start with both Compose files:

```sh
docker compose -f compose.yaml -f compose.sysbox.yaml up -d --build --wait
docker compose -f compose.yaml -f compose.sysbox.yaml exec --user agent workspace bash
```

Open the printed one-time pairing URL in your browser. The default host binding
is `127.0.0.1:3773`; the container listens on `0.0.0.0:3773` so Docker can forward
that port. T3's own pairing and device authorization remain enabled. An unpaired
browser cannot control the workspace just by knowing its address.

In the base configuration, the launcher runs `t3 serve` directly. In Sysbox mode,
it starts Docker first and manages both processes, running T3 as `agent`. Compose
handles restart and process reaping; no systemd service is installed inside the
container. To open a shell in the base configuration:

```sh
docker compose exec --user agent workspace bash
```

The image uses `debian:trixie-slim` (Debian 13) and supports Linux amd64 and arm64.
It includes Git, curl, CA certificates, SSH client, jq, ripgrep, less, nano,
process/network tools, archive utilities, and a basic C/C++ build toolchain.
APT is supplied by Debian; install extra packages with `sudo apt-get update` and
`sudo apt-get install ...`. Package changes made inside a container disappear
when that container is removed; add lasting tools to the Dockerfile.

Docker Engine/CLI **29.8.2**, containerd **2.3.6**, Buildx **0.37.1**, and Compose
**5.6.0** are installed from Docker's signed Debian repository with exact package
versions in `versions/docker.env`. The repository signing key is checksum-pinned.
These are the tools inside the workspace; the host can use a different version.

The default user is `agent` (UID/GID 1000), with passwordless sudo inside the
container. Compose persists the complete `/home/agent` directory in `agent-home`
and repository checkouts in `agent-workspace`. This includes Codex credentials,
OpenCode configuration/data/cache, T3's database, pairing identity, provider
settings, and T3-managed worktrees. Volume names are scoped to the Compose project.
They survive container recreation and image rebuilds; `docker compose down -v`
deletes them. Keep the home volume private and include both volumes in backups.

If you replace named volumes with bind mounts, give the `agent` user compatible
directory ownership on Linux.

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

Configure provider authentication in the workspace environment:

```sh
docker compose exec --user agent workspace opencode auth login
docker compose exec --user agent workspace codex login --device-auth
```

In T3's web UI, open **Settings → Providers** for this environment and enable
OpenCode and/or Codex. The installed paths are `/usr/local/bin/opencode` and
`/usr/local/bin/codex`. Projects use container paths such as `/workspace/my-project`.
Provider access depends on the account or API credentials you configure. The
installation checks below do not establish that a provider can run agent tasks.

Update tools through their version files and an image rebuild. Do not use T3's
remote server update button or `opencode upgrade` to change this pinned image.
Installed tools under `/opt` and `/usr/local/bin` are root-owned; interactive
clients should not replace them.

## Remote access

Direct pairing requires the client to reach the host's published port. Choose a
host interface reachable over your LAN or private VPN, then set `T3_BIND_ADDRESS`
and `T3_PUBLIC_URL` in `.env`. For example, if the host's LAN address is
`192.168.1.20`:

```dotenv
T3_BIND_ADDRESS=192.168.1.20
T3_PORT=3773
T3_PUBLIC_URL=http://192.168.1.20:3773
```

Replace that example address with your host's address. `T3_BIND_ADDRESS` is an IP
assigned to the Docker host; `T3_PUBLIC_URL` is the origin your client can reach.
If you change `T3_PORT`, include that port in the advertised URL as well. Recreate
the service and mint a fresh link:

```sh
docker compose up -d --wait
docker compose exec --user agent workspace t3-pair
# Or override the advertised origin for this link:
docker compose exec --user agent workspace t3-pair http://192.168.1.20:3773
```

`t3-pair` uses T3 to mint a five-minute, one-time grant and replaces the container's
internal address with the advertised origin. Use a separate fresh URL per device.
Open it in a browser, or paste it into the native client's environment settings
(**Settings → Connections → Add environment** on macOS;
**Settings → Environments** on iPhone).
Pairing links are credentials; do not share them in issues or screenshots.

Allow the published port through the host firewall and any network access rules.
VPN tools such as WireGuard, NetBird, or Tailscale are optional ways to provide
private reachability; this project does not require a particular VPN.

For HTTPS access, configure a reverse proxy with WebSocket forwarding and set
`T3_PUBLIC_URL` to its origin, for example `https://agent.example`. The hostname
must resolve from the client. A reverse proxy and TLS certificates are not
provided by this repository; keep the upstream port bound to an interface the
proxy can reach.

Use a native client compatible with the pinned T3 server. If an app requests a
server upgrade or rejects the version, check the release's client compatibility
before changing the image, and recheck OpenCode compatibility too. The bundled
web UI matches its server version.

T3 Connect is an alternative to direct private-network access:

```sh
docker compose exec --user agent workspace t3 connect
# Complete the browser/code sign-in. Decline background service installation;
# Compose already owns the server process.
docker compose restart workspace
```

Sign in to the same T3 Connect account on your clients and select the environment.
This opt-in path contacts T3's service; it is not required for direct pairing.
The hosted `app.t3.codes` frontend requires an HTTPS backend. For a private HTTP
endpoint, use this container's web UI or direct pairing in a compatible native app.
For hosted-web access, configure HTTPS with WebSocket forwarding, or use T3 Connect.

See [T3 remote access](https://github.com/pingdotgg/t3code/blob/v0.0.45/docs/user/remote-access.md)
for the supported connection and authorization flows.

## Codex CLI

Codex **0.161.0** is installed from the official native Linux package, including
its helper binaries. Node.js is not required for this installation. The version
and SHA-256 hashes for both architectures are pinned in `versions/codex.env`;
downloads are verified during the build. To upgrade, update all three values
using the release's `codex-package_SHA256SUMS`, update the version here, then
rebuild.

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

The container boundary and Codex's own command sandbox are separate. This image
does not configure a Codex sandbox bypass. Whether its Linux sandbox works under
the Sysbox runtime needs testing on the selected server.

## Recorded validation

Development checks covered arm64 natively and amd64 under Docker Desktop
emulation. All three CLI version checks passed, and T3 served its environment
descriptor on both architectures. Docker's build checks reported no warnings.

On arm64, Compose reached healthy status, an unpaired browser saw the pairing
screen, and a one-time link opened the working web UI. T3 detected Codex 0.161.0
and OpenCode 1.18.35 and loaded OpenCode's model catalog. Container recreation
preserved home/workspace files, the T3 database, and the paired browser session.
`sh tests/t3-pair.sh` checks address rewriting and rejection of malformed origins.

These checks do not cover authenticated provider tasks, native client
connections, T3 Connect, remote network reachability, or nested Docker. Baseline
Git, C compilation, and sudo checks also passed.

On the tested Docker Desktop setup with the default runtime,
`codex sandbox linux /bin/true` fails because bubblewrap cannot create a namespace.
The image's CLI installation works, but that does not establish working
sandboxed agent execution. Resolving and testing that under Sysbox is part of
the server setup.

The Docker-enabled image built on native arm64 and emulated amd64. All installed
tool version checks and daemon configuration validation passed. Launcher tests
passed for readiness, user switching, daemon/application failure, and graceful
shutdown. The base Compose workspace became healthy and retained project files
after recreation. The launcher tests use a mock daemon and do not establish that
inner containers run under Sysbox. The smoke test in
`tests/nested-docker.sh` covers an actual image build, an inner Compose service,
networking, bind mounts, and volume persistence when run inside that environment.

## Why this project exists

Development workflows need more than file edits. Verifying a change can require
starting application containers, databases, and entire Docker Compose stacks.
An agent needs that capability to complete the development workflow.

A repeatable workspace can use existing hardware and keep tool installation
separate from the host's configuration. Pinned downloads, persistent project
storage, and a bundled web UI make the environment easier to rebuild and access
from different devices. The Sysbox configuration gives the workspace an internal
Docker daemon for project containers, separate from the host's Docker daemon.

The focus is development: editing repositories, building software, running
tests, and inspecting results. Chat bots and general-purpose assistant
integrations are outside the initial scope.

## Docker isolation

The Sysbox override configures an internal Docker daemon with its own images,
networks, build cache, and volumes. Sysbox runs the outer workspace container,
selected explicitly with `runtime: sysbox-runc` on a compatible Linux host.
Existing services can continue using their current runtime.

Sysbox supports nested Docker without a conventional privileged outer container
or a mount of the host's Docker socket. The `agent-docker` volume persists inner
Docker storage at `/var/lib/docker`; it needs its own disk budget. The Docker API
stays on a Unix socket inside the workspace. To reach inner application ports
externally, publish them at both container layers. See the
[setup, storage, networking, and verification guide](docs/sysbox.md).

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
2. Install Sysbox on the selected Linux host and start the override. Run the
   nested Docker smoke test and check storage across outer container recreation.
3. Verify Codex command execution, a real repository's image builds, and Compose
   tests inside the Sysbox workspace. Add project-specific runtimes as needed.

## Development

See [AGENTS.md](AGENTS.md) for the repository layout, installer conventions,
compatibility constraints, and checks to run when making changes.

## References

- [Sysbox](https://github.com/nestybox/sysbox)
- [Sysbox Docker-in-Docker guide](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/dind.md)
- [Sysbox installation and coexistence with Docker](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-package.md)
- [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)
- [Codex release packages](https://github.com/openai/codex/releases)
- [OpenCode 1.18.35](https://github.com/anomalyco/opencode/releases/tag/v1.18.35)
- [T3 Code 0.0.45](https://github.com/pingdotgg/t3code/releases/tag/v0.0.45)
