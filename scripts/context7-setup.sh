#!/bin/bash
# Keys must never appear in shell tracing, arguments, or setup logs.
set +x
set -euo pipefail

usage() { echo 'Usage: context7-setup [--stdin]'; }
case "${1:-}" in
    '') input=prompt ;;
    --stdin) input=stdin ;;
    --help|-h) usage; exit 0 ;;
    *) usage >&2; exit 1 ;;
esac
if (( $# > 1 )); then usage >&2; exit 1; fi
if [[ $(id -u) == 0 ]]; then
    echo 'Run context7-setup as agent, not root (compose exec --user agent).' >&2
    exit 1
fi
for variable in OPENCODE_CONFIG OPENCODE_CONFIG_DIR OPENCODE_CONFIG_CONTENT; do
    if [[ -n ${!variable:-} ]]; then
        echo "Unset $variable before configuring the standard global OpenCode files." >&2
        exit 1
    fi
done
codex_dir=${CODEX_HOME:-$HOME/.codex}
config_home=${XDG_CONFIG_HOME:-$HOME/.config}
opencode_dir="$config_home/opencode"
key_dir="$config_home/agent-container"

# Update a single global file. Multiple layers can otherwise retain old Context7
# fields or override the entry we add; require the user to consolidate first.
configs=()
for filename in opencode.jsonc opencode.json config.json; do
    if [[ -e $opencode_dir/$filename ]]; then configs+=("$opencode_dir/$filename"); fi
done
if (( ${#configs[@]} > 1 )); then
    echo 'Consolidate the global OpenCode config.json/opencode.json/opencode.jsonc files first.' >&2
    exit 1
fi
opencode_config=${configs[0]:-$opencode_dir/opencode.json}
if [[ $opencode_config == "$opencode_dir/config.json" ]]; then
    echo 'OpenCode v2 ignores legacy config.json. Rename it to opencode.jsonc before setup.' >&2
    exit 1
fi
for path in "$codex_dir/config.toml" "$opencode_config" "$key_dir/context7.key"; do
    if [[ -L $path ]] || { [[ -e $path ]] && [[ ! -f $path ]]; }; then
        echo "Setup requires a regular file or an absent path: $path" >&2
        exit 1
    fi
done
if [[ $input == stdin ]]; then
    key=$(cat)
else
    IFS= read -r -s -p 'Context7 API key (hidden): ' key < /dev/tty
    printf '\n' > /dev/tty
fi
if [[ -z $key || $key =~ [[:space:]] ]]; then
    echo 'Supply one non-empty Context7 API key without whitespace.' >&2
    exit 1
fi

umask 077
if [[ -d $config_home && ! -w $config_home ]]; then
    echo 'The config directory is not writable. Check the home-volume ownership repair in docs/github.md.' >&2
    exit 1
fi
mkdir -p "$key_dir"
# Codex refuses helper aliases in /tmp. Keep staging private in the home volume.
stage=$(mktemp -d "$key_dir/.setup.XXXXXX")
stage_service=false
cleanup() {
    if [[ $stage_service == true ]]; then
        export_stage opencode service stop >/dev/null 2>&1 || true
    fi
    rm -rf "$stage"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$stage/codex" "$stage/config/opencode" "$stage/home"
if [[ -f $codex_dir/config.toml ]]; then cp "$codex_dir/config.toml" "$stage/codex/config.toml"; fi
# OpenCode's native JSONC editor preserves comments, even for a .json source.
if [[ -f $opencode_config ]]; then
    cp "$opencode_config" "$stage/config/opencode/opencode.jsonc"
else
    printf '{}\n' > "$stage/config/opencode/opencode.jsonc"
fi
export_stage() {
    env HOME="$stage/home" CODEX_HOME="$stage/codex" XDG_CONFIG_HOME="$stage/config" \
        XDG_DATA_HOME="$stage/data" XDG_STATE_HOME="$stage/state" XDG_CACHE_HOME="$stage/cache" \
        CONTEXT7_API_KEY=context7-configuration-check "$@"
}
# V2's editor repairs malformed JSONC instead of rejecting it. Check that its
# loader accepts the original first. Debug starts a managed service, so give
# this disposable home its own port and stop it before removing the stage.
port=$(shuf -i 30000-60000 -n 1)
while (echo > "/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1; do
    port=$(shuf -i 30000-60000 -n 1)
done
stage_service=true
if ! export_stage opencode service set port "$port" > "$stage/service.log" 2>&1 \
    || ! export_stage opencode debug config > "$stage/sources.json" 2> "$stage/validation.log" \
    || ! jq -e --arg path "$stage/config/opencode/opencode.jsonc" \
        'any(.[]; .type == "document" and .path == $path)' "$stage/sources.json" >/dev/null; then
    echo 'OpenCode configuration could not be parsed. Original files are unchanged.' >&2
    exit 1
fi
export_stage opencode service stop >/dev/null 2>&1
stage_service=false
# Work on copies first. Never echo CLI errors that might quote existing secrets.
if ! export_stage codex mcp add context7 --url https://mcp.context7.com/mcp \
    --bearer-token-env-var CONTEXT7_API_KEY > "$stage/codex.log" 2>&1; then
    echo 'Codex configuration could not be updated. Check its syntax; original files are unchanged.' >&2
    exit 1
fi
if ! export_stage opencode mcp add context7 --global --url https://mcp.context7.com/mcp \
    --header 'Authorization=Bearer {env:CONTEXT7_API_KEY}' > "$stage/opencode.log" 2>&1; then
    echo 'OpenCode configuration could not be updated/validated. Original files are unchanged.' >&2
    exit 1
fi

# Preserve originals before committing changes. These backups may contain other
# credentials, so keep them private alongside the workspace's existing state.
mkdir -p "$codex_dir" "$opencode_dir" "$key_dir/backups"
backup=$(mktemp -d "$key_dir/backups/setup.XXXXXX")
backup_file() {
    if [[ -f $1 ]]; then
        cp "$1" "$backup/$2"
        chmod 0600 "$backup/$2"
    fi
}
backup_file "$codex_dir/config.toml" codex.toml
backup_file "$opencode_config" opencode.config
backup_file "$key_dir/context7.key" context7.key
printf 'Private backups: %s\n' "$backup"
publish() {
    local source=$1 target=$2 pending
    pending=$(mktemp "${target}.XXXXXX")
    cp "$source" "$pending"
    chmod 0600 "$pending"
    mv -f "$pending" "$target"
}
printf '%s\n' "$key" > "$stage/context7.key"
unset key
publish "$stage/context7.key" "$key_dir/context7.key"
publish "$stage/codex/config.toml" "$codex_dir/config.toml"
publish "$stage/config/opencode/opencode.jsonc" "$opencode_config"
printf 'Context7 configured for Codex and OpenCode. Start fresh provider sessions.\n'
printf 'If the OpenCode background service is running, restart it with: opencode service restart\n'
