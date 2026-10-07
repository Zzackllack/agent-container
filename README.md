# agent-container

A containerized development workspace for AI coding agents, intended to run
24/7 on an existing Linux server. The workspace will provide development tools,
repository checkouts, and its own Docker daemon so agents can build images and
run container-based tests.

**Status:** initial repository scaffold. The container image, Compose setup,
agent tooling, and server deployment have not been implemented or tested yet.

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
2. Build the development image and Compose configuration, including persistent
   storage and access through NetBird.
3. Install the chosen agent tools and verify a real repository's image builds
   and Compose tests inside the workspace.

## References

- [Original discussion: Configs issue #148](https://github.com/Zzackllack/Configs/issues/148)
- [Sysbox](https://github.com/nestybox/sysbox)
- [Sysbox Docker-in-Docker guide](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/dind.md)
- [Sysbox installation and coexistence with Docker](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-package.md)
