#!/bin/bash
set -euo pipefail
root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
sync_script="$root_dir/scripts/sync-instructions.sh"
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
repo="$test_dir/source"
state="$test_dir/state"
git init --quiet --initial-branch=main "$repo"
git -C "$repo" config user.name 'Instruction test'
git -C "$repo" config user.email 'instructions@example.invalid'
printf 'Initial preferences\n' > "$repo/AGENTS.md"
git -C "$repo" add AGENTS.md
git -C "$repo" commit --quiet -m initial
bash "$sync_script" "$repo" "$state"
cmp "$repo/AGENTS.md" "$state/published/AGENTS.md"

printf 'Updated preferences\n' > "$repo/AGENTS.md"
git -C "$repo" commit --quiet -am update
bash "$sync_script" "$repo" "$state"
cmp "$repo/AGENTS.md" "$state/published/AGENTS.md"
cp "$state/published/AGENTS.md" "$test_dir/last-good"
# Idempotence and concurrent schedule invocations must preserve the snapshot.
bash "$sync_script" "$repo" "$state" | rg --quiet 'Instructions unchanged'
(
    exec 9>"$state/sync.lock"
    flock 9
    bash "$sync_script" "$repo" "$state" | rg --quiet 'already running'
)

expect_failure() {
    if bash "$sync_script" "$@" >/dev/null 2>&1; then
        echo "Expected sync failure." >&2
        exit 1
    fi
    cmp "$test_dir/last-good" "$state/published/AGENTS.md"
}
expect_failure "$test_dir/missing-remote" "$state"
expect_failure "$repo" "$state" main missing.md
ln -s AGENTS.md "$repo/alias.md"
git -C "$repo" add alias.md
git -C "$repo" commit --quiet -m symlink
expect_failure "$repo" "$state" main alias.md
printf ' \n\t\n' > "$repo/AGENTS.md"
git -C "$repo" commit --quiet -am empty
expect_failure "$repo" "$state"

# Branch and nested file selection are independent from the published filename.
git -C "$repo" checkout --quiet -b custom
mkdir "$repo/rules"
printf 'Selected branch and file\n' > "$repo/rules/global.md"
git -C "$repo" add rules/global.md
git -C "$repo" commit --quiet -m custom
bash "$sync_script" "$repo" "$state" custom rules/global.md
cmp "$repo/rules/global.md" "$state/published/AGENTS.md"
echo 'Git instruction sync checks passed.'
