#!/bin/bash
set -euo pipefail

# Disposable image only: exercise the root exec path with real Codex storage,
# then replace the native programs to inspect UID, argument and key forwarding.
[[ $(id -u) == 0 ]]
# Fresh tools must be able to create their own XDG directories, rather than
# relying on just the precreated Codex/OpenCode child directories being writable.
for parent in /home/agent/.local /home/agent/.local/share /home/agent/.local/state /home/agent/.cache; do
    setpriv --reuid=agent --regid=agent --init-groups -- test -w "$parent"
done
test_dir=$(mktemp -d)
trap 'rm -rf "$test_dir"' EXIT
chown agent:agent "$test_dir"
export HOME="$test_dir" CODEX_HOME="$test_dir/.codex"
export XDG_CONFIG_HOME="$test_dir/.config"
unset CONTEXT7_API_KEY XDG_DATA_HOME XDG_STATE_HOME XDG_CACHE_HOME
install -d -o agent -g agent "$CODEX_HOME"

if ! printf 'fixture-not-a-real-api-key\n' | codex login --with-api-key > "$test_dir/login.log" 2>&1; then
    cat "$test_dir/login.log" >&2
    exit 1
fi
[[ $(stat -c '%u:%g:%a' "$CODEX_HOME/auth.json") == 1000:1000:600 ]]
setpriv --reuid=agent --regid=agent --init-groups -- codex login status > "$test_dir/status.log" 2>&1
if rg -q 'Permission denied' "$test_dir/login.log" "$test_dir/status.log"; then exit 1; fi
if ! opencode auth list > "$test_dir/opencode-auth.log" 2>&1; then
    cat "$test_dir/opencode-auth.log" >&2
    exit 1
fi
[[ $(stat -c '%u:%g' "$HOME/.local/share/opencode/log/opencode.log") == 1000:1000 ]]
setpriv --reuid=agent --regid=agent --init-groups -- test -w "$HOME/.local/share/opencode/log/opencode.log"

install -d -o agent -g agent "$XDG_CONFIG_HOME/agent-container"
printf 'fixture-context7-key\n' > "$XDG_CONFIG_HOME/agent-container/context7.key"
chown agent:agent "$XDG_CONFIG_HOME/agent-container/context7.key"
chmod 0600 "$XDG_CONFIG_HOME/agent-container/context7.key"
for binary in /opt/codex/bin/codex /opt/opencode/opencode; do
    rm "$binary"
    cat > "$binary" <<'STUB'
#!/bin/sh
set -eu
test "$(id -u)" = 1000
test "${CONTEXT7_API_KEY:-}" = fixture-context7-key
test "$#" = 2
test "$1" = 'argument with spaces'
test "$2" = '--literal-option'
STUB
    chmod 0755 "$binary"
done
for cli in codex opencode; do
    "$cli" 'argument with spaces' --literal-option
    setpriv --reuid=agent --regid=agent --init-groups -- "$cli" 'argument with spaces' --literal-option
done
echo 'Agent CLI user and credential ownership checks passed.'
