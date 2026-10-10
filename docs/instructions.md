# Shared global instructions from Git

Keep one `AGENTS.md` in a separate repository and sync it on the Docker host.
A host-side cron job fetches a chosen branch every 15 minutes. The workspace
mounts the published directory read-only and links both tools to the same file:

- Codex: `/home/agent/.codex/AGENTS.md`
- OpenCode: `/home/agent/.config/opencode/AGENTS.md`

Project-level `AGENTS.md` files still provide each repository's instructions.
Codex's global `AGENTS.override.md`, if present, takes precedence over its global
`AGENTS.md`. See [Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
and [OpenCode rules](https://opencode.ai/docs/rules/).

## Repository and host setup

Use a private repository for personal preferences. Its default layout is:

```text
agent-instructions/
└── AGENTS.md
```

Keep the shared text applicable to both macOS and Linux. Use conditional advice
for platform-specific package managers and paths. It will be readable by agent
code; keep secrets out of the file. Keep these personal instructions separate
from this project's public repository.

On the Linux Docker host, install Git, Bash, `flock` (usually `util-linux`),
`timeout` (usually `coreutils`), and an SSH client for SSH remotes. Choose a
regular host account to own and run the sync. For a private repository, configure
that account's noninteractive Git access, preferably a read-only deploy key with
a verified host key in `~/.ssh/known_hosts`. Do not embed a token in the repository
URL. Cron should not depend on a Mac SSH agent or an interactive password prompt.
Configure `BatchMode yes` for the Git host in this account's SSH config so a
missing credential fails rather than prompting.

The example uses `/srv/agent-instructions` for state and assumes this project's
checkout is `/opt/agent-container`; substitute paths owned/readable by your sync
account. Create the state directory with appropriate ownership once, then run
as that account:

```sh
sudo install -d -m 0700 -o "$(id -un)" -g "$(id -gn)" /srv/agent-instructions
timeout 120 /opt/agent-container/scripts/sync-instructions.sh \
    git@github.com:you/agent-instructions.git /srv/agent-instructions
```

Arguments are `REPOSITORY ABSOLUTE_STATE_DIRECTORY [BRANCH] [FILE]`, with defaults
`main` and `AGENTS.md`. A different branch or file is supported:

```sh
timeout 120 /opt/agent-container/scripts/sync-instructions.sh \
    git@github.com:you/dotfiles.git /srv/agent-instructions main agents/global.md
```

The script maintains a bare cache at `repository.git`, protected by the sync
account's permissions, and publishes only `published/AGENTS.md`. It never checks
out or runs repository code/hooks. It follows the current branch tip, including
intentional force pushes. Limit who can change the source branch: those changes
become global instructions for future agent sessions.

An exclusive lock skips overlapping runs. Fetch failures, missing files,
symlinks, and empty/whitespace-only files fail without replacing the last-good
published copy. Successful updates use an atomic rename. An unchanged file is
not replaced. Each successful run logs its source commit.

## Connect the workspace

Run the initial sync before starting the workspace. Add to the workspace's `.env`:

```dotenv
AGENT_INSTRUCTIONS_DIRECTORY=/srv/agent-instructions/published
# Ordinary Docker:
COMPOSE_FILE=compose.yaml:compose.instructions.yaml
# With Sysbox, use this instead:
# COMPOSE_FILE=compose.yaml:compose.sysbox.yaml:compose.instructions.yaml
```

Then rebuild and recreate the workspace:

```sh
docker compose config --quiet
docker compose up -d --build --wait
```

`compose.instructions.yaml` enables the startup helper and mounts only the
published directory at `/etc/agent-instructions`. The cache, SSH keys, and Git
credentials stay on the host. The directory mount allows file replacements to
become visible without recreating the container. An individual file bind mount
can remain attached to the old file after an atomic rename.

The helper runs as `agent`, including under the Sysbox root launcher. It creates
symlinks in the persistent home volume and accepts existing matching symlinks.
If either destination already contains a different file/link, startup stops
without overwriting it. Move your existing instruction files to backups before
enabling this feature. A missing/unreadable published file also stops startup.

To inspect the loaded file without contacting an AI provider:

```sh
docker compose exec --user agent workspace sh -ec \
    'readlink "$CODEX_HOME/AGENTS.md"; cat "$CODEX_HOME/AGENTS.md"; cat "$HOME/.config/opencode/AGENTS.md"'
```

After a sync, start a fresh agent session to pick up the new instructions.
An existing conversation may retain instructions loaded earlier; a container
restart is not needed for the published file itself.

## Schedule every 15 minutes

Edit the sync account's crontab with `crontab -e`. Use absolute paths, set a
predictable `PATH`, and record output. Create the log directory/file so that
account can write them. For example, put the log in that account's home:

```cron
PATH=/usr/local/bin:/usr/bin:/bin
*/15 * * * * timeout 120 /opt/agent-container/scripts/sync-instructions.sh git@github.com:you/agent-instructions.git /srv/agent-instructions main AGENTS.md >> "$HOME/agent-instructions-sync.log" 2>&1
```

Fifteen minutes keeps preferences reasonably fresh without requiring an
always-running sync service. Use hourly instead (`0 * * * *`) if changes are
infrequent. The Mac can be offline: the server fetches committed and pushed
changes directly from Git. Local uncommitted edits are not synced.

Run the exact command manually as the same account before relying on cron, then
check the log after a scheduled run. Rotate the log using the host's normal log
management. No cron job is installed by this repository or by the container.

## Disable or change the source

To switch repositories, branches, or paths, update the sync command and cron
entry, then run a successful sync. The mount and symlinks stay the same.

To disable shared instructions, remove `compose.instructions.yaml` from
`COMPOSE_FILE`, recreate the workspace, and unlink only the two shared symlinks
in its home volume. Restore any personal instruction-file backups afterward.
Remove the cron entry if you no longer need host sync. Keep the last published
copy/cache if you want to re-enable it later.

## Verification

`tests/sync-instructions.sh` uses local Git fixtures to check updates, unchanged
files, branch/path selection, overlap locking, and last-good retention after
offline, missing, empty, and symlink inputs. `tests/workspace-instructions.sh`
uses a disposable Docker workspace to check read-only mounting, updates through
both links without restarting, existing-file protection, and the root
launcher's user switch across home-volume reuse.

These checks do not establish private-repository authentication, a real cron
run, or this new bind mount on a Sysbox host. Verify those during your host setup.
