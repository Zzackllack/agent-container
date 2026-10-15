# Architecture and isolation

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
[setup, storage, networking, and verification guide](sysbox.md).

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

## References

- [Sysbox](https://github.com/nestybox/sysbox)
- [Sysbox Docker-in-Docker guide](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/dind.md)
- [Sysbox installation and coexistence with Docker](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-package.md)
- [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)
- [Codex release packages](https://github.com/openai/codex/releases)
- [OpenCode v2](https://opencode.ai/v2/docs/)
- [T3 Code releases](https://github.com/pingdotgg/t3code/releases)
