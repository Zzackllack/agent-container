# agent-container

A containerized development workspace for AI coding agents, intended to run
24/7 on an existing Linux server. The workspace will provide development tools,
repository checkouts, and its own Docker daemon so agents can build images and
run container-based tests.

**Status:** the initial Debian 13 image includes development utilities and the
Codex CLI. The internal Docker daemon, Sysbox/Compose setup, and server deployment
are the next steps; this image currently starts an interactive shell.

## Build and use

```sh
docker build -t agent-container:dev .
docker run --rm -it --init \
  --mount type=volume,source=agent-workspace,target=/workspace \
  --mount type=volume,source=agent-codex,target=/home/agent/.codex \
  agent-container:dev
```

The image uses `debian:trixie-slim` (Debian 13) and supports Linux amd64 and arm64.
It includes Git, curl, CA certificates, SSH client, jq, ripgrep, less, nano,
process/network tools, archive utilities, and a basic C/C++ build toolchain.
APT is supplied by Debian; install extra packages with `sudo apt-get update` and
`sudo apt-get install ...`. Package changes made inside a container disappear
when that container is removed; add lasting tools to the Dockerfile.

The default user is `agent` (UID/GID 1000), with passwordless sudo inside the
container. `/workspace` holds checkouts, and `/home/agent/.codex` holds Codex
settings, sessions, and credentials. The named volumes above survive container
removal and image rebuilds. Bind-mounted directories need compatible ownership
on Linux; named volumes avoid that setup for this first image.

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
git clone <repository-url> /workspace/my-project
cd /workspace/my-project
codex
```

Device-code login must be enabled in your ChatGPT account's security settings
or allowed by your workspace administrator. This login flow does not require
publishing an OAuth callback port. See the [official authentication guide](https://learn.chatgpt.com/docs/auth)
for other login methods.

Treat the `agent-codex` volume as credential storage. Login happens at runtime;
no credentials are included in the image or build context. This first image
provides Codex's terminal interface; it does not include a graphical frontend.

The container boundary and Codex's own command sandbox are separate. This image
does not configure a Codex sandbox bypass. Whether its Linux sandbox works under
the eventual Sysbox runtime needs testing on the selected server.

### Verification so far

Both images build locally: arm64 natively, amd64 under Docker Desktop emulation.
Smoke checks on both cover CLI startup/help/completions, Git commits, C
compilation, and sudo. Named-volume ownership and persistence were also checked
on arm64. These checks do not cover an authenticated Codex task or nested Docker.

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
2. Add the internal Docker daemon and Compose configuration, including persistent
   Docker storage and access through NetBird.
3. Verify Codex command execution, a real repository's image builds, and Compose
   tests inside the Sysbox workspace. Add project-specific runtimes as needed.

## References

- [Original discussion: Configs issue #148](https://github.com/Zzackllack/Configs/issues/148)
- [Sysbox](https://github.com/nestybox/sysbox)
- [Sysbox Docker-in-Docker guide](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/dind.md)
- [Sysbox installation and coexistence with Docker](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-package.md)
- [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)
- [Codex release packages](https://github.com/openai/codex/releases)
