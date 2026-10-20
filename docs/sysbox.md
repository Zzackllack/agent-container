# Docker-in-Docker with Sysbox

The workspace contains Docker Engine, its CLI, Buildx, and the Compose plugin.
The Sysbox override starts an internal daemon before T3 and gives the `agent`
user access to its Unix socket. The host runs Sysbox; Sysbox is not installed
inside the image.

Nested builds, Compose networking, two-layer port forwarding, persistence, and
Codex sandboxed Docker commands passed on an amd64 Ubuntu 24.04 Sysbox host.
The [validation record](validation.md) lists the tested versions; verify
compatibility on your own host.

## Host requirements

- A Linux Docker Engine host with systemd and an architecture supported by
  Sysbox. The image and the package example below cover amd64 and arm64.
- A host distribution, kernel, and filesystem compatible with the selected
  Sysbox release. Check the upstream [compatibility table](https://github.com/nestybox/sysbox/blob/master/docs/distro-compat.md)
  and [installation guide](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-package.md).
  The Debian 13 **container image** does not require a Debian 13 host.
- User namespaces and working volume ownership mapping. Modern kernels avoid
  the shiftfs requirement on older hosts; use the release's host-specific advice.
- A registered `sysbox-runc` runtime and running Sysbox services. Docker Desktop
  does not acquire Sysbox by building this image or installing a package on macOS.
- Space for the workspace image and a separate inner Docker image/build cache.

Inspect the host before installing anything:

```sh
cat /etc/os-release
uname -r
uname -m
docker version
docker info --format '{{json .Runtimes}}'
docker info --format '{{.DefaultRuntime}}'
df -h /var/lib/docker
```

## Install on the Linux host

The example pins [Sysbox CE 0.7.1](https://github.com/nestybox/sysbox/releases/tag/v0.7.1).
Review the release requirements and plan for a possible Docker restart first.
Back up existing Docker configuration and check the host's current networks:

```sh
if [ -f /etc/docker/daemon.json ]; then
    sudo cp -a /etc/docker/daemon.json "/etc/docker/daemon.json.before-sysbox.$(date +%Y%m%d%H%M%S)"
fi
docker network ls
```

The upstream installer may add runtime and network settings. Its
[installation without a Docker restart](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/install-package.md#installing-sysbox-without-restarting-docker)
section explains the conditions for avoiding a restart. Do not overwrite existing
daemon configuration or copy network ranges without checking for conflicts.
Removing unrelated containers is not a prerequisite of this project's setup.

Download the host architecture's package and verify its release checksum:

```sh
sysbox_version=0.7.1
case "$(dpkg --print-architecture)" in
    amd64)
        sysbox_arch=amd64
        sysbox_sha256=9d6d5484f980d0a17f86c492c1262015c2afb66280bdb97215b79fde6a0261c5
        ;;
    arm64)
        sysbox_arch=arm64
        sysbox_sha256=04ca894ae0b53f0fa54eaacc173ce40363c9a95ea5450f773716a84ef650a69b
        ;;
    *) echo "No package example for this architecture." >&2; exit 1 ;;
esac
sysbox_package="sysbox-ce_${sysbox_version}.linux_${sysbox_arch}.deb"
curl --fail --show-error --location --retry 3 \
    "https://github.com/nestybox/sysbox/releases/download/v${sysbox_version}/${sysbox_package}" \
    --output "$sysbox_package"
printf '%s  %s\n' "$sysbox_sha256" "$sysbox_package" | sha256sum --check --strict
```

After checking installation impact, install and inspect the runtime:

```sh
sudo apt-get update
sudo apt-get install -y jq
sudo apt-get install "./$sysbox_package"
sudo systemctl status sysbox sysbox-mgr sysbox-fs --no-pager
docker info --format '{{json .Runtimes}}'
docker info --format '{{.DefaultRuntime}}'
```

`sysbox-runc` must appear in the runtime list. Leave the host's existing default
runtime unchanged: only this project's override selects Sysbox. Check existing
services again if the installer restarted Docker. Before upgrading or removing
Sysbox later, follow its release-specific upgrade/uninstallation procedure.

## Start the workspace

From this repository, after configuring `.env` as described in the README:

```sh
docker compose -f compose.yaml -f compose.sysbox.yaml config --quiet
docker compose -f compose.yaml -f compose.sysbox.yaml up -d --build --wait
docker compose -f compose.yaml -f compose.sysbox.yaml exec --user agent workspace t3-pair
docker compose -f compose.yaml -f compose.sysbox.yaml exec --user agent workspace bash
```

Use both Compose files for lifecycle commands in this mode. Alternatively, set
`COMPOSE_FILE=compose.yaml:compose.sysbox.yaml` in `.env` on the Linux host, then
use the shorter `docker compose ...` commands throughout the README.

The override changes startup to container root so the launcher can start
`dockerd`. T3 and its terminal/agent children run as `agent` after readiness.
Compose `exec` defaults to the configured startup user, so use `--user agent`
for interactive commands. Passwordless sudo and access to the inner Docker
socket give the agent control of this workspace. The socket uses the primary
`agent` group, which remains mapped inside Codex's nested user namespace; a
supplementary `docker` group does not. No host daemon is mounted.

The healthcheck requires both the inner daemon and T3. If either managed process
exits, the launcher stops the other and Compose can restart the workspace.
Shutdown stops application processes before Docker; the override allows 45
seconds before the outer container is forcibly stopped.

## Storage and networking

`agent-home` and `agent-workspace` retain their existing meanings. The override
adds `agent-docker` at `/var/lib/docker` for inner images, volumes, containers,
and build cache. All volume names are scoped to the Compose project. Reuse the
same project name when switching between base and Sysbox configurations.

The inner daemon uses classic `overlay2` storage with Docker 29's containerd image
store explicitly disabled. This keeps image data under `/var/lib/docker`, the
data-root supported by Sysbox. Do not change this path or enable inner
`userns-remap`. Never share this volume between live daemons or mount the host's
own Docker data directory. See [Sysbox's daemon restrictions](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/dind.md#limitations-for-the-inner-docker)
and [Docker's storage documentation](https://docs.docker.com/engine/storage/containerd/).

The Docker API listens only on the workspace's Unix socket. No host socket or
Docker TCP API is published. Inner containers using `-p 8080:80` publish to the
**workspace's** network namespace. To reach that service from outside, also map
the workspace's port through the outer Compose service, for example:

```yaml
services:
  workspace:
    ports:
      - "127.0.0.1:8080:8080"
```

Use `0.0.0.0` or the workspace interface for the inner published port; an inner
binding to `127.0.0.1` is only reachable inside the workspace. Outer loopback
publishing keeps the example local; change the outer binding for remote access
deliberately, using the same LAN/VPN/proxy approach as T3.

Container and volume restart behavior still follows each inner project's Docker
configuration. An inner image cache is not shared with the host cache. Monitor
it with `docker system df` inside the workspace. Stop the workspace before taking
a consistent backup of the three volumes; `docker compose ... down -v` deletes them.

## Verify on the host

The container should be healthy before proceeding:

```sh
docker compose -f compose.yaml -f compose.sysbox.yaml ps
docker compose -f compose.yaml -f compose.sysbox.yaml logs --tail=100 workspace
docker compose -f compose.yaml -f compose.sysbox.yaml exec --user agent workspace docker info
docker compose -f compose.yaml -f compose.sysbox.yaml exec --user agent workspace docker run --rm hello-world
docker compose -f compose.yaml -f compose.sysbox.yaml exec --user agent workspace docker compose version
docker compose -f compose.yaml -f compose.sysbox.yaml exec --user agent workspace docker buildx version
```

Run the smoke test from the host's checkout, passing it into the workspace:

```sh
docker compose -f compose.yaml -f compose.sysbox.yaml exec -T --user agent workspace \
    sh -s < tests/nested-docker.sh
```

That test builds an inner image, exercises an inner Compose service and bind
mount, checks port forwarding within the workspace, and verifies an inner volume.
It only removes its uniquely named test resources. If this repository is already
cloned inside the workspace, `sh tests/nested-docker.sh` works there too.

Recreate the outer container without deleting volumes and confirm an existing
inner image and volume still exist. Verify a real project's build/Compose tests
and Codex's command sandbox separately. For inner cross-architecture builds,
Sysbox's [multi-arch requirements](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/dind.md#inner-docker-multi-arch-builds--v067-)
include Linux kernel 6.7 or newer; the image's amd64/arm64 support alone does not
establish this capability.

## T3 browser sandbox

T3's browser needs a separate host policy on Ubuntu hosts that restrict user
namespaces. See [T3 browser setup](browser.md) for the policy and read-only
Compose mount; running `t3 browser setup` inside the workspace cannot load it
on the host.

## Codex command sandbox

Codex's command sandbox is separate from Sysbox. For the pinned Linux CLI, use
`codex sandbox -- <command>`; `linux` is not a subcommand in this package.
Check startup inside the workspace:

```sh
codex sandbox -- /bin/true
```

### Ubuntu AppArmor exception

On Ubuntu hosts with `kernel.apparmor_restrict_unprivileged_userns=1`, Codex's
bundled bubblewrap may fail with `loopback: Failed RTM_NEWADDR: Operation not
permitted`. Inspect host kernel logs for `unprivileged_userns` denials before
applying this exception:

```sh
sysctl kernel.apparmor_restrict_unprivileged_userns
sudo journalctl -k --since '10 minutes ago' | rg 'apparmor|unprivileged_userns'
```

Ubuntu documents an [executable-specific user namespace allowance](https://documentation.ubuntu.com/release-notes/24.04/).
This repository provides one for `/opt/codex/codex-resources/bwrap`. From the
host checkout, on a host supporting AppArmor ABI 4:

```sh
sudo apparmor_parser --skip-kernel-load config/apparmor-codex-bwrap
sudo install -m 0644 config/apparmor-codex-bwrap /etc/apparmor.d/agent-container-codex-bwrap
sudo apparmor_parser --replace /etc/apparmor.d/agent-container-codex-bwrap
```

The profile allows user namespace creation for that executable path. It applies
to matching executables on this host, including across container mount
namespaces; it is not scoped to a Compose project. It leaves the global user
namespace restriction enabled. It is an allowance, not an added AppArmor
confinement policy. The image's bundled executable is root-owned.

This is a host file, not part of the image. Setting a Compose AppArmor profile
will not substitute for it: [Sysbox ignores Docker's AppArmor profiles](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/security.md#apparmor).
Recheck the path when upgrading Codex. To remove this optional exception later:

```sh
sudo apparmor_parser --remove /etc/apparmor.d/agent-container-codex-bwrap
sudo rm /etc/apparmor.d/agent-container-codex-bwrap
```

### Docker commands within the sandbox

The default command sandbox restricts networking, including Docker socket
connections. To test the intended Docker workflow without disabling filesystem
sandboxing, run inside the workspace:

```sh
codex sandbox -c 'sandbox_mode="workspace-write"' \
    -c 'sandbox_workspace_write.network_access=true' -- \
    docker run --rm busybox:1.37.0 echo nested-docker-ok
```

Pass these overrides directly to `sandbox`. In this pinned CLI, a preceding
global `-s workspace-write` does not select the debug sandbox's policy. For
normal CLI sessions that need this access, merge these settings into the
workspace user's existing `$CODEX_HOME/config.toml` rather than replacing it:

```toml
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = true
writable_roots = ["/home/agent/.docker"]
```

Buildx writes client state under `~/.docker`, so that directory needs write
access for normal builds. The smoke test instead uses temporary Docker client
state in its workspace directory. Keep any additional writable paths explicit.

This enables command networking beyond Docker as well. It is opt-in; this image
does not write a Codex permission configuration. See [official OpenAI documentation](https://learn.chatgpt.com/docs/agent-approvals-security)
for sandbox/network controls. T3 may supply per-session permissions, so verify
an authenticated agent task separately from this standalone command test.

Docker access grants control over the whole workspace through its daemon. An
inner container can mount workspace paths and perform writes on behalf of a
sandboxed command. Codex's direct filesystem restrictions therefore do not
constrain Docker-mediated changes; Sysbox remains the boundary toward the host.

To run the full nested smoke test through Codex from the host checkout:

```sh
docker compose -f compose.yaml -f compose.sysbox.yaml exec -T --user agent workspace \
    codex sandbox -c 'sandbox_mode="workspace-write"' \
    -c 'sandbox_workspace_write.network_access=true' -- \
    sh -s < tests/nested-docker.sh
```

## Troubleshooting

- **Unknown runtime `sysbox-runc`:** install/register Sysbox on the Docker host
  used by the active Docker context. Do not remove the runtime setting to make
  the nested daemon start under ordinary Docker.
- **Daemon startup or overlay permission failure:** check the host's Sysbox
  services, kernel, filesystem support, and daemon logs. The launcher does not
  retry with privileged mode, disabled iptables, or a slower storage fallback.
- **The outer container is healthy but a remote service is unreachable:** check
  both inner and outer port mappings, published interfaces, firewall, and routing.
- **Docker works in a shell but Codex reports socket permission denied:** check
  the sandbox's command networking and the socket's `agent` group. Do not make
  the socket world-writable.
- **Interactive commands run as root:** add `--user agent` to `compose exec`.

Sysbox still shares the host kernel. Workspace credentials, files, and allowed
network destinations remain available to agent code; scope them accordingly.
