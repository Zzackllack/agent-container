# Start the workspace

For prebuilt GHCR images, follow [published images](images.md). The commands
below build from source.

Requirements: Docker Engine or Docker Desktop with Docker Compose v2 and support
for Linux containers. The image supports `linux/amd64` and `linux/arm64`.
Clone this repository and run the following commands from its root:

```sh
cp .env.example .env
docker compose up -d --build --wait
docker compose exec --user agent workspace t3-pair
```

This starts T3 with the internal Docker daemon disabled. To enable Docker-in-Docker
on a Linux host with Sysbox, follow the [Sysbox setup guide](sysbox.md) and
start with both Compose files:

```sh
docker compose -f compose.yaml -f compose.sysbox.yaml up -d --build --wait
docker compose -f compose.yaml -f compose.sysbox.yaml exec --user agent workspace bash
```

Open the printed one-time pairing URL in your browser. The default host binding
is `127.0.0.1:3773`; the container listens on `0.0.0.0:3773` so Docker can forward
that port. T3's own pairing and device authorization remain enabled. An unpaired
browser cannot control the workspace just by knowing its address.

The default command runs T3's service launcher in the foreground, enabling its
in-app server updater. In Sysbox mode, the outer launcher starts Docker first
and manages both processes, running T3 as `agent`. Compose handles restart and
process reaping; no systemd service is installed inside the
container. To open a shell in the base configuration:

```sh
docker compose exec --user agent workspace bash
```

## Configure the agents

### Workspace hostname

Set `WORKSPACE_HOSTNAME` in `.env` to give the workspace a readable hostname:

```dotenv
WORKSPACE_HOSTNAME=agent-box
```

Compose passes this through `services.workspace.hostname`. Recreate the workspace
with `docker compose up -d --no-deps workspace` using your usual overrides.
The next shell uses `agent@agent-box` rather than a container ID. The hostname
also supplies a readable default for tools that use it as their environment name;
an already saved custom name in T3 may need to be changed separately.
In Coolify, set the environment variable and ensure Raw Compose includes the
`hostname: ${WORKSPACE_HOSTNAME:-agent-container}` line, then redeploy.

This is the container's hostname; it does not rename the Linux host or change
the URL/NetBird address. Named volumes and saved agent data stay the same.

### Provider login

Log in to the providers you want to use:

```sh
docker compose exec --user agent workspace codex login --device-auth
docker compose exec --user agent workspace opencode auth login
```

In T3, open **Settings → Providers** for this environment and enable Codex and/or
OpenCode. Use container paths such as `/workspace/my-project` for projects.
See [tools and provider setup](tools.md) for installation details and Codex use.

## Open the configuration dashboard

Open <http://localhost:3780> and retrieve its password with:

```sh
docker compose exec dashboard cat /var/lib/agent-dashboard/password
```

Dashboard login is separate from T3 pairing. The [dashboard guide](dashboard.md)
covers instruction/configuration editing, backups, and access settings.

## Optional setup

- [Remote web/native access](remote-access.md): LAN/VPN bindings, HTTPS, T3 Connect.
- [GitHub CLI](github.md): login and Git authentication.
- [Context7 MCP](context7.md): configure Codex and OpenCode with your key.
- [Agent instructions](instructions.md): global and project rules in the dashboard.
- [Storage](storage.md): what survives recreation and what to back up.
- [Updates](updates.md): T3 nightly upgrades and existing home volumes.

Keep your configured `COMPOSE_FILE` or explicit `-f` overrides on subsequent
Compose commands. The short commands in these guides use the base stack unless
an override is shown.
