# Published container images

The GitHub Actions workflow builds and tests both images on native Linux amd64
and arm64 runners, then publishes multi-platform manifests to GHCR:

| Image | Purpose |
| --- | --- |
| `ghcr.io/zzackllack/agent-container:latest` | Debian workspace, agents, T3, and optional inner Docker daemon |
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
[dashboard guide](dashboard.md). Add `compose.instructions.yaml` last if using
[Git-synchronized rules](instructions.md).

## Tags and updates

- `latest`: most recent successful publishing run from `main`.
- `build-<run-id>-<attempt>`: a particular tested build of both architectures.
- The same build tag with `-amd64` or `-arm64` is an intermediate single-platform
  image used to assemble the manifest.

The workflow runs for image-related changes on `main`, on manual dispatch, and
daily at 04:15 UTC to refresh the floating T3 nightly seed. Pull requests run
the native builds and checks without publishing. A new manifest is promoted
only after all four image/architecture jobs pass. Actions are SHA-pinned; pushes
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
