# Recorded validation

Historical results below describe particular images and hosts, not a guarantee
for the currently deployed nightly. To reproduce relevant checks, see the
[development guide](development.md#verification).

The nightly/OpenCode v2 transition has separate checks in
[the update guide](updates.md#validation). Results below describe the earlier
stable image and Sysbox baseline; they do not prove every later nightly works.

Development checks covered arm64 natively and amd64 under Docker Desktop
emulation. All three CLI version checks passed, and T3 served its environment
descriptor on both architectures. Docker's build checks reported no warnings.

The GitHub CLI/Context7 image changes also passed native arm64 and emulated
amd64 builds and CLI checks. Fake-key tests verified preserved config comments
and settings, key rotation/environment overrides, private file permissions, and
rejection of invalid configs. A local mock MCP endpoint verified OpenCode's
bearer header. Real GitHub login, Context7 authentication/queries, and T3 agent
tasks using these credentials remain unverified.

On arm64, Compose reached healthy status, an unpaired browser saw the pairing
screen, and a one-time link opened the working web UI. T3 detected Codex 0.161.0
and OpenCode 1.18.35 and loaded OpenCode's model catalog. Container recreation
preserved home/workspace files, the T3 database, and the paired browser session.
`sh tests/t3-pair.sh` checks address rewriting and rejection of malformed origins.

These checks do not cover authenticated provider tasks, native client
connections, T3 Connect, or remote client reachability. Baseline
Git, C compilation, and sudo checks also passed.

On the tested Docker Desktop setup with the default runtime,
`codex sandbox -- /bin/true` fails because bubblewrap cannot create a namespace.
CLI installation alone does not establish working sandboxed agent execution.

The Docker-enabled image built on native arm64 and emulated amd64. Tool version
checks and daemon configuration validation passed. Launcher tests passed for
readiness, user switching, daemon/application failure, and graceful shutdown.
The base Compose workspace became healthy and retained project files after
recreation. These lifecycle tests use a mock daemon.

On 2026-10-08, a native amd64 Ubuntu 24.04 host with Linux 7.0, ext4, Docker
28.5.1, and Sysbox CE 0.7.1 passed the actual nested Docker checks:

- An inner image build with `COPY` and `RUN`, Compose networking/DNS, bind mounts,
  HTTP port forwarding, and inner volume persistence.
- HTTP forwarding through both the inner and outer container port mappings.
- Inner image/volume and workspace file persistence after outer recreation.
- T3 health, an unprivileged application user, and Sysbox's outer user-ID mapping.
- Codex sandbox startup and direct filesystem restrictions after the documented
  host AppArmor exception. Docker commands worked with workspace-write and
  command networking explicitly enabled.

Sysbox installation retained the host's default `runc` runtime and did not
restart Docker. This is a result for that host, not a promise about other hosts.
The smoke test in `tests/nested-docker.sh` reproduces the inner build/Compose
checks. Inner cross-architecture builds and authenticated provider tasks remain
unverified.
