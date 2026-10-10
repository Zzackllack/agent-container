#!/bin/bash
set -euo pipefail
image=${1:-agent-container:check}
root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$root_dir/instruction-state"
test_dir=$(mktemp -d "$root_dir/instruction-state/check.XXXXXX")
name="agent-instructions-check-$(date +%s)-$$"
volume="$name-home"
cleanup() {
    docker rm --force "$name" >/dev/null 2>&1 || true
    docker volume rm "$volume" >/dev/null 2>&1 || true
    rm -rf "$test_dir"
}
trap cleanup EXIT
mkdir "$test_dir/published"
printf 'Initial shared instructions\n' > "$test_dir/published/AGENTS.md"
chmod 0755 "$test_dir" "$test_dir/published"
chmod 0644 "$test_dir/published/AGENTS.md"
docker run -d --init --name "$name" \
    -e WORKSPACE_INSTRUCTIONS_ENABLED=true \
    --mount "type=bind,source=$test_dir/published,target=/etc/agent-instructions,readonly" \
    --mount "type=volume,source=$volume,target=/home/agent" \
    "$image" sleep 120 >/dev/null
# Startup is asynchronous; wait for the helper's links without calling a model.
for ((attempt = 0; attempt < 20; attempt++)); do
    if docker exec "$name" test -L /home/agent/.config/opencode/AGENTS.md; then break; fi
    sleep 1
done
docker exec "$name" sh -ec '
    test "$(cat "$CODEX_HOME/AGENTS.md")" = "Initial shared instructions"
    cmp "$CODEX_HOME/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"
    test "$(stat -c %u "$CODEX_HOME/AGENTS.md")" = 1000
    workspace-instructions
'
if docker exec "$name" sh -c 'echo unexpected > /etc/agent-instructions/AGENTS.md' 2>/dev/null; then
    echo 'The published directory must be read-only.' >&2
    exit 1
fi
printf 'Updated shared instructions\n' > "$test_dir/published/new.md"
chmod 0644 "$test_dir/published/new.md"
mv "$test_dir/published/new.md" "$test_dir/published/AGENTS.md"
docker exec "$name" sh -ec '
    test "$(cat "$CODEX_HOME/AGENTS.md")" = "Updated shared instructions"
    cmp "$CODEX_HOME/AGENTS.md" "$HOME/.config/opencode/AGENTS.md"
    rm "$CODEX_HOME/AGENTS.md"
    printf "Personal instructions\n" > "$CODEX_HOME/AGENTS.md"
    if workspace-instructions; then exit 1; fi
    test "$(cat "$CODEX_HOME/AGENTS.md")" = "Personal instructions"
    rm "$CODEX_HOME/AGENTS.md"
    rm "$HOME/.config/opencode/AGENTS.md"
'
docker rm --force "$name" >/dev/null
# Exercise the root launcher's user switch and persistent home on recreation.
docker run --rm --init --user 0:0 -e WORKSPACE_INSTRUCTIONS_ENABLED=true \
    --mount "type=bind,source=$test_dir/published,target=/etc/agent-instructions,readonly" \
    --mount "type=volume,source=$volume,target=/home/agent" \
    "$image" sh -ec '
        test "$(stat -c %u /home/agent/.codex/AGENTS.md)" = 1000
        test "$(cat /home/agent/.codex/AGENTS.md)" = "Updated shared instructions"
    '
echo 'Workspace shared-instruction checks passed.'
