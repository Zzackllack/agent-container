# Published container images

The GitHub Actions workflow builds and tests the images on native Linux amd64
and arm64 runners, then publishes multi-platform manifests to GHCR:

| Image | Purpose |
| --- | --- |
| `ghcr.io/zzackllack/agent-container:latest` | Debian workspace with T3, coding agents, OpenHands, and optional inner Docker |
| `ghcr.io/zzackllack/agent-container-dashboard:latest` | Configuration dashboard |

## Run without building

Clone the repository for its Compose files, copy `.env.example` to `.env`, and
set this in `.env`:

```dotenv
COMPOSE_FILE=compose.yaml:compose.images.yaml
```

For a Linux host with Sysbox already installed, use:

```dotenv
COMPOSE_FILE=compose.yaml:compose.images.yaml:compose.sysbox.yaml
```

Then run:

```sh
docker compose pull
docker compose up -d --no-build --wait
docker compose exec --user agent workspace t3-pair
docker compose exec dashboard cat /var/lib/agent-dashboard/password
```

Use Compose 2.24.4 or newer. The image override uses `!reset` to remove local
build definitions; the base source-build setup remains available without it.
Set access bindings as described in [remote access](remote-access.md) and the
[dashboard guide](dashboard.md). Manage agent instructions through the [dashboard](dashboard.md).

## OpenHands backend

Use [compose.openhands.yaml](../compose.openhands.yaml) on a Linux host with
[`sysbox-runc`](sysbox.md). It uses the standard workspace image with a command
that starts the Agent Server and Automation Server. The usual workspace starts
T3. The review project has its own home, workspace, and inner Docker daemon.

Set `OPENHANDS_BACKEND_API_KEY` to a random key, and set
`OPENHANDS_FRONTEND_ORIGIN` to the Canvas browser origin, such as
`https://canvas.example.com` without a path. The backend publishes on
`127.0.0.1:8101` by default. Set `OPENHANDS_BACKEND_BIND_IP` to the private
interface address for direct access, or use a reverse proxy to port `8000`.

```sh
docker compose -f compose.openhands.yaml up -d
```

To use a local build, run `docker build -t agent-container:local .` and set
`WORKSPACE_IMAGE=agent-container:local` for the review Compose. Set
`OPENHANDS_IMAGE` only if the review service needs a different tag. The first
backend launch downloads the pinned Python services with `uvx` and caches them
in the review home. In Canvas, use **Manage Backends** to enter the backend URL
and API key. [OpenHands remote backend guide](https://docs.openhands.dev/openhands/usage/agent-canvas/backend-setup/remote)

For terminal `gh` commands, set `OPENHANDS_GH_TOKEN` to a dedicated token or run
`docker compose -f compose.openhands.yaml exec --user agent backend gh auth login`
with a bot account. The backend's GitHub CLI config lives in its review home.
GitHub App installation tokens expire after one hour. Unattended reviews as
the App need fresh tokens wired into their GitHub calls. The stock Canvas PR
review recipe asks for its own GitHub MCP credential.
[OpenHands PR review recipe](https://docs.openhands.dev/openhands/usage/agent-canvas/prebuilt/github-pr-review)

## Tags and updates

- `latest`: most recent successful publishing run from `main`.
- `build-<run-id>-<attempt>`: a particular tested build of both architectures.
- The same build tag with `-amd64` or `-arm64` is an intermediate single-platform
  image used to assemble the manifest.

The workflow runs for image-related changes on `main`, on manual dispatch, and
daily at 04:15 UTC to refresh the floating T3 nightly seed. Pull requests run
the native builds and checks without publishing. A new manifest is promoted
only after all image and architecture jobs pass. Actions are SHA-pinned; pushes
use the repository's `GITHUB_TOKEN`, not a stored personal token.

To select a particular build, set both overrides in `.env`:

```dotenv
WORKSPACE_IMAGE=ghcr.io/zzackllack/agent-container:build-<run-id>-<attempt>
DASHBOARD_IMAGE=ghcr.io/zzackllack/agent-container-dashboard:build-<run-id>-<attempt>
```

For an exact immutable reference, use each image's `@sha256:...` digest instead.
Update with `docker compose pull` followed by `docker compose up -d --no-build --wait`.
Volumes are retained. The workspace image updates its image-managed CLIs;
an existing home retains its selected T3 runtime and uses T3's own updater.
See [nightly updates](updates.md) and [persistent storage](storage.md).

## Package visibility

GHCR package visibility is separate from repository visibility. The workflow
links each image to its source repository; check the first publication's package
settings and verify anonymous pulls. This repository's packages inherited public
access. If a fork's package remains private, its owner can change that in package
settings. Subsequent pushes retain visibility. Forks publish under their own
lowercased owner namespace; their Compose overrides need to point there.

CI verifies the workspace tools, mock-daemon lifecycle, Git instruction sync,
Context7 configuration with fake credentials, and dashboard recreation. These
checks do not prove live Sysbox nesting or authenticated provider tasks; those
remain [server-side checks](sysbox.md#verify-on-the-host).
