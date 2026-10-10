#!/bin/sh
set -eu

source_file=/etc/agent-instructions/AGENTS.md
if [ ! -r "$source_file" ] || [ ! -s "$source_file" ]; then
    echo "Global instructions are missing or unreadable. Run the host sync first." >&2
    exit 1
fi
codex_dir=${CODEX_HOME:-$HOME/.codex}
opencode_dir=${XDG_CONFIG_HOME:-$HOME/.config}/opencode

# Check both destinations before changing either. Personal instruction files
# require an explicit backup; startup must not silently replace them.
for target in "$codex_dir/AGENTS.md" "$opencode_dir/AGENTS.md"; do
    if [ -e "$target" ] || [ -L "$target" ]; then
        if [ ! -L "$target" ] || [ "$(readlink "$target")" != "$source_file" ]; then
            echo "Move aside $target before enabling shared global instructions." >&2
            exit 1
        fi
    fi
done
mkdir -p "$codex_dir" "$opencode_dir"
for target in "$codex_dir/AGENTS.md" "$opencode_dir/AGENTS.md"; do
    if [ ! -L "$target" ]; then ln -s "$source_file" "$target"; fi
done
if [ -s "$codex_dir/AGENTS.override.md" ]; then
    echo "Codex AGENTS.override.md takes precedence over the shared AGENTS.md." >&2
fi
