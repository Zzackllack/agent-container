#!/bin/bash
set -euo pipefail
# Run as agent inside the built image; fixtures use no real API credentials.
test_dir=$(mktemp -d "$HOME/context7-check.XXXXXX")
trap 'rm -rf "$test_dir"' EXIT
export HOME="$test_dir/home" CODEX_HOME="$test_dir/home/.codex"
export XDG_CONFIG_HOME="$test_dir/home/.config" XDG_DATA_HOME="$test_dir/data"
export XDG_STATE_HOME="$test_dir/state" XDG_CACHE_HOME="$test_dir/cache"
unset CONTEXT7_API_KEY OPENCODE_CONFIG OPENCODE_CONFIG_DIR OPENCODE_CONFIG_CONTENT
mkdir -p "$CODEX_HOME" "$XDG_CONFIG_HOME/opencode"
cat > "$CODEX_HOME/config.toml" <<'TOML'
# Keep this preference.
model = "fixture-model"
[mcp_servers.existing]
command = "echo"
args = ["existing"]
TOML
cat > "$XDG_CONFIG_HOME/opencode/opencode.jsonc" <<'JSONC'
{
  // Keep this preference too.
  "model": "fixture/model",
  "mcp": { "existing": { "type": "local", "command": ["echo", "existing"], "enabled": false } },
}
JSONC
printf 'fixture-context7-key\n' | context7-setup --stdin > "$test_dir/setup.log"
if rg -q fixture-context7-key "$test_dir/setup.log"; then exit 1; fi
key_file="$XDG_CONFIG_HOME/agent-container/context7.key"
test "$(stat -c %a "$key_file")" = 600
test "$(stat -c %a "$CODEX_HOME/config.toml")" = 600
test "$(stat -c %a "$XDG_CONFIG_HOME/opencode/opencode.jsonc")" = 600
rg --quiet 'Keep this preference' "$CODEX_HOME/config.toml"
rg --quiet 'Keep this preference too' "$XDG_CONFIG_HOME/opencode/opencode.jsonc"
# Keys belong in one private file, not literal config values or setup output.
if rg -q fixture-context7-key "$CODEX_HOME/config.toml" "$XDG_CONFIG_HOME/opencode/opencode.jsonc"; then exit 1; fi
codex mcp get context7 --json > "$test_dir/codex.json"
jq -e '.transport.url == "https://mcp.context7.com/mcp" and .transport.bearer_token_env_var == "CONTEXT7_API_KEY"' "$test_dir/codex.json" >/dev/null
codex mcp get existing --json > /dev/null
opencode --pure debug config > "$test_dir/opencode.json"
jq -e '.model == "fixture/model" and .mcp.existing.enabled == false and .mcp.context7.headers.Authorization == "***"' "$test_dir/opencode.json" >/dev/null
rg -Fq 'Bearer {env:CONTEXT7_API_KEY}' "$XDG_CONFIG_HOME/opencode/opencode.jsonc"

# Debug output redacts headers. A local MCP child proves the launcher exports the
# stored key to OpenCode, without sending fixture credentials to a remote service.
verify_key_loading() {
    local expected=$1
    jq -n --arg output "$test_dir/key-observed" '{mcp: {
      context7: {enabled: false},
      probe: {type: "local", command: ["sh", "-c", "printf '\''%s'\'' \"$CONTEXT7_API_KEY\" > \"$1\"", "probe", $output]}
    }}' > "$test_dir/probe.json"
    OPENCODE_CONFIG="$test_dir/probe.json" opencode --pure mcp list > "$test_dir/probe.log" 2>&1
    test "$(cat "$test_dir/key-observed")" = "$expected"
    rm "$test_dir/key-observed"
}
verify_key_loading fixture-context7-key
cp "$CODEX_HOME/config.toml" "$test_dir/codex-before"
cp "$XDG_CONFIG_HOME/opencode/opencode.jsonc" "$test_dir/opencode-before"
printf 'rotated-context7-key\n' | context7-setup --stdin >/dev/null
cmp "$test_dir/codex-before" "$CODEX_HOME/config.toml"
cmp "$test_dir/opencode-before" "$XDG_CONFIG_HOME/opencode/opencode.jsonc"
verify_key_loading rotated-context7-key
CONTEXT7_API_KEY=override-fixture-key verify_key_loading override-fixture-key

# Bad input or configuration must leave both configs and the key untouched.
cp "$key_file" "$test_dir/key-before"
printf '{ malformed\n' > "$XDG_CONFIG_HOME/opencode/opencode.jsonc"
cp "$XDG_CONFIG_HOME/opencode/opencode.jsonc" "$test_dir/malformed-before"
if printf 'must-not-publish\n' | context7-setup --stdin > "$test_dir/failure.log" 2>&1; then exit 1; fi
cmp "$test_dir/key-before" "$key_file"
cmp "$test_dir/codex-before" "$CODEX_HOME/config.toml"
cmp "$test_dir/malformed-before" "$XDG_CONFIG_HOME/opencode/opencode.jsonc"
if rg -q must-not-publish "$test_dir/failure.log"; then exit 1; fi
cp "$test_dir/opencode-before" "$XDG_CONFIG_HOME/opencode/opencode.jsonc"
printf 'model = [\n' > "$CODEX_HOME/config.toml"
cp "$CODEX_HOME/config.toml" "$test_dir/bad-codex-before"
if printf 'must-not-publish\n' | context7-setup --stdin >/dev/null 2>&1; then exit 1; fi
cmp "$test_dir/key-before" "$key_file"
cmp "$test_dir/bad-codex-before" "$CODEX_HOME/config.toml"
cmp "$test_dir/opencode-before" "$XDG_CONFIG_HOME/opencode/opencode.jsonc"
cp "$test_dir/codex-before" "$CODEX_HOME/config.toml"
if printf 'must-not-publish\n' | sudo context7-setup --stdin >/dev/null 2>&1; then exit 1; fi
if printf ' \n' | context7-setup --stdin >/dev/null 2>&1; then exit 1; fi
printf '{}\n' > "$XDG_CONFIG_HOME/opencode/opencode.json"
if printf 'must-not-publish\n' | context7-setup --stdin >/dev/null 2>&1; then exit 1; fi
cmp "$test_dir/key-before" "$key_file"
rm "$XDG_CONFIG_HOME/opencode/opencode.json" "$XDG_CONFIG_HOME/opencode/opencode.jsonc" "$CODEX_HOME/config.toml"
# A fresh workspace should not require a pre-existing OpenCode config.
printf 'fresh-fixture-key\n' | context7-setup --stdin >/dev/null
codex mcp get context7 --json >/dev/null
opencode --pure debug config > "$test_dir/fresh.json"
jq -e '.mcp.context7.headers.Authorization == "***"' "$test_dir/fresh.json" >/dev/null
verify_key_loading fresh-fixture-key
# The global loader also accepts the older file names; update them in place.
for filename in config.json opencode.jsonc; do
    mv "$XDG_CONFIG_HOME/opencode/opencode.json" "$XDG_CONFIG_HOME/opencode/$filename"
    printf 'fresh-fixture-key\n' | context7-setup --stdin >/dev/null
    opencode --pure debug config > "$test_dir/legacy.json"
    jq -e '.mcp.context7.url == "https://mcp.context7.com/mcp"' "$test_dir/legacy.json" >/dev/null
    test ! -e "$XDG_CONFIG_HOME/opencode/opencode.json"
    mv "$XDG_CONFIG_HOME/opencode/$filename" "$XDG_CONFIG_HOME/opencode/opencode.json"
done
echo 'Context7 configuration, preservation, rotation, and failure checks passed.'
