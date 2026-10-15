# Persistent storage

Compose keeps these named volumes, scoped to the Compose project:

| Volume | Container path | Contents |
| --- | --- | --- |
| `agent-home` | `/home/agent` | Codex/OpenCode sessions, configuration and credentials; T3 conversations, pairing, worktrees and selected runtime; GitHub login |
| `agent-workspace` | `/workspace` | Project checkouts, including uncommitted files |
| `dashboard-state` | `/var/lib/agent-dashboard` | Dashboard password and private file backups |
| `agent-docker` (Sysbox only) | `/var/lib/docker` | Inner Docker images, containers, volumes and build cache |

The default user is `agent` (UID/GID 1000), with passwordless sudo inside the
container. The complete home is persisted, including configuration, data and
caches. If you replace named volumes with bind mounts, give the `agent` user
compatible directory ownership on Linux.

## Restarts, recreation, and deletion

Saved files survive service restarts, container recreation, and image rebuilds.
Running commands and processes stop when their container stops; saved sessions
can be resumed, but an interrupted task does not automatically continue.

`docker compose down` retains named volumes. **`docker compose down -v` deletes
that project's volumes and their data.** Changing the project name selects a
different set of volumes; it does not migrate the old data.

Files outside the mounted paths, including `/tmp` and `/root`, are not persisted
across recreation. Run agent tools as `agent`, rather than launching them with
sudo and creating state under root's home. Packages installed interactively with
APT also disappear on recreation; put lasting tools in the Dockerfile.

Persistence is not a backup. Back up project files and the complete home,
dashboard-state, and (when needed) inner Docker data. These can contain tokens,
conversation history, private source, and credentials. Stop the relevant service
or use a database-aware snapshot strategy for a consistent backup; copying a live
SQLite file alone is not a reliable snapshot.

See [T3 runtime persistence](updates.md#what-persists),
[dashboard storage](dashboard.md#storage-and-access), and
[inner Docker storage](sysbox.md#storage-and-networking) for their specific layouts.
