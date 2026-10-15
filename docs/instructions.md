# Agent instructions

Use the [configuration dashboard](dashboard.md) to edit instructions directly:

| Location | Applies to |
| --- | --- |
| `/home/agent/.codex/AGENTS.md` | Codex global defaults |
| `/home/agent/.codex/AGENTS.override.md` | Codex global override; takes precedence |
| `/home/agent/.config/opencode/AGENTS.md` | OpenCode global defaults |
| `/workspace/AGENTS.md` and repository `AGENTS.md` files | Workspace/project rules |

T3 uses the selected provider's instructions. Keep both global files aligned
if you want the same defaults across Codex and OpenCode. Review the diff before
saving; the dashboard creates private backups of replaced files. Start a fresh
agent session after changes.

Global files persist in `agent-home`; project files persist in `agent-workspace`.
They survive restarts and recreation. No rules repository, scheduled Git pull,
host credentials, or extra bind mount is required. Project rules can still be
versioned normally in their own repositories. Keep secrets out of instructions.

## Migrating an older Git-sync setup

Skip this section if you never enabled the optional instruction overlay.
The removed Git-sync feature used symlinks to `/etc/agent-instructions/AGENTS.md`.
Before removing its mount, preserve those rules as local files. Run this as
`agent` in the old workspace while the publication is still mounted:

```sh
docker compose exec --user agent workspace bash
```

Then, inside that shell:

```bash
set -euo pipefail
for target in "$CODEX_HOME/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"; do
    # Leave unrelated links and existing local files alone.
    if [[ -L $target && $(readlink "$target") == /etc/agent-instructions/AGENTS.md ]]; then
        backup="${target}.git-sync-backup"
        [[ ! -e $backup && ! -L $backup ]]
        [[ -s $target && -r $target ]]
        temp=$(mktemp "${target}.XXXXXX")
        cat -- "$target" > "$temp"
        chmod 0600 "$temp"
        cp -P -- "$target" "$backup"
        mv -- "$temp" "$target"
    fi
done
```

Verify both local files before removing `compose.instructions.yaml` from your
Compose configuration and deleting `WORKSPACE_INSTRUCTIONS_ENABLED` and
`AGENT_INSTRUCTIONS_DIRECTORY`. Remove the matching host cron entry, then
recreate the services without the instruction mounts. Keep the old publication
and repository cache until you have checked the rules in the dashboard. The new
dashboard rejects symlink reads and writes instead of following them.
