#!/bin/bash
set -euo pipefail

if (( $# < 2 || $# > 4 )); then
    echo "Usage: $0 REPOSITORY ABSOLUTE_STATE_DIRECTORY [BRANCH=main] [FILE=AGENTS.md]" >&2
    exit 1
fi
repository=$1
state_dir=$2
branch=${3:-main}
instruction_file=${4:-AGENTS.md}
case "$state_dir" in
    /*) ;;
    *) echo "The state directory must be an absolute host path." >&2; exit 1 ;;
esac
case "$instruction_file" in
    ''|/*|..|../*|*/../*|*/..)
        echo "FILE must be a path within the instructions repository." >&2; exit 1 ;;
esac
git check-ref-format "refs/heads/$branch" >/dev/null

# The cache and credentials stay on the host. Mount only published/ in Docker.
umask 077
mkdir -p "$state_dir"
exec 9>"$state_dir/sync.lock"
if ! flock --nonblock 9; then
    echo "An instruction sync is already running; skipping."
    exit 0
fi
cache="$state_dir/repository.git"
if [[ ! -d $cache ]]; then
    git init --bare --quiet "$cache"
fi
if [[ $(git --git-dir="$cache" rev-parse --is-bare-repository) != true ]]; then
    echo "The instruction cache must be a bare Git repository." >&2
    exit 1
fi
export GIT_TERMINAL_PROMPT=0
# There is no checkout or merge, and repository hooks are disabled. The source
# ref tracks the selected branch even if the owner deliberately rewrites it.
git --git-dir="$cache" -c core.hooksPath=/dev/null fetch --quiet --no-tags --depth=1 \
    -- "$repository" "+refs/heads/$branch:refs/heads/source"
revision=$(git --git-dir="$cache" rev-parse refs/heads/source)
mode=$(git --git-dir="$cache" ls-tree "$revision" -- ":(literal)$instruction_file" | awk '{print $1}')
case "$mode" in
    100644|100755) ;;
    *) echo "The selected instruction file must be a regular Git file." >&2; exit 1 ;;
esac

published="$state_dir/published"
mkdir -p "$published"
chmod 0755 "$published"
pending=$(mktemp "$published/.AGENTS.md.XXXXXX")
trap 'rm -f "$pending"' EXIT
git --git-dir="$cache" show "$revision:$instruction_file" > "$pending"
if ! [[ -s $pending ]] || ! LC_ALL=C grep -q '[^[:space:]]' "$pending"; then
    echo "The selected instruction file is empty; keeping the published copy." >&2
    exit 1
fi
# File permissions must allow the container's mapped agent user to read it.
chmod 0644 "$pending"
if [[ -f $published/AGENTS.md ]] && cmp --silent "$pending" "$published/AGENTS.md"; then
    echo "Instructions unchanged ($revision)."
else
    # Rename within the mounted directory: readers see a complete old or new file.
    mv -f "$pending" "$published/AGENTS.md"
    echo "Published instructions from $revision."
fi
