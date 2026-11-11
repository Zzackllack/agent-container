#!/bin/sh
set -eu

# Select the T3 runtime a later workspace start should run.
#
# The in-app updater cannot cross a service-launcher protocol change: the
# running launcher validates the staged runtime with its own protocol and
# refuses it before committing. Rebuilding the image does not replace an
# existing home's selection, so that bump needs one explicit local selection.

# shellcheck source=scripts/t3-protocol.sh
. /usr/local/lib/agent-container/t3-protocol

usage() {
    printf 'Usage: %s seed|<version> [--allow-downgrade]\n' "${0##*/}" >&2
    printf 'Select the T3 runtime for the next workspace start. "seed" uses the\n' >&2
    printf 'runtime baked into this image. Restart the workspace afterwards.\n' >&2
    exit "${1:-2}"
}

fail() {
    printf 't3-runtime-select: %s\n' "$1" >&2
    exit 1
}

version_at_least() {
    [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]
}

allow_downgrade=false
version=
for argument in "$@"; do
    case "$argument" in
        --allow-downgrade) allow_downgrade=true ;;
        -h | --help) usage 0 ;;
        -*) usage ;;
        *)
            [ -z "$version" ] || usage
            version=$argument
            ;;
    esac
done
[ -n "$version" ] || usage
[ -r /opt/t3/.install-complete ] || fail 'the image has no T3 seed runtime'
seed_version=$(cat /opt/t3/.install-complete)
[ "$version" = seed ] && version=$seed_version
printf '%s\n' "$version" | grep -Eq '^[0-9][0-9A-Za-z.+-]*$' ||
    fail "invalid T3 version: $version"

home=${T3CODE_HOME:-$HOME/.t3}
runtime=$home/runtime
state=$runtime/service-state.json
[ "$(id -u)" != 0 ] ||
    fail 'run as the agent user: docker compose exec --user agent workspace t3-runtime-select ...'
mkdir -p "$runtime/versions"

(
    flock 9

    if [ -e "$state" ]; then
        jq -e 'type == "object"' "$state" >/dev/null 2>&1 || fail "cannot read $state"
        if jq -e '.update.status == "pending"' "$state" >/dev/null 2>&1; then
            fail 'a pending update must be recovered first; see docs/updates.md'
        fi
        active=$(jq -er '.activeVersion | select(type == "string")' "$state" 2>/dev/null) ||
            fail "cannot read the selected version from $state"
        if [ "$active" != "$version" ] && [ "$allow_downgrade" != true ] &&
            ! version_at_least "$version" "$active"; then
            fail "refusing to replace $active with the older $version; pass --allow-downgrade if its database is compatible"
        fi
    fi

    target=$runtime/versions/$version
    if [ ! -x "$target/t3" ] ||
        [ "$(cat "$target/.install-complete" 2>/dev/null || true)" != "$version" ]; then
        [ "$version" = "$seed_version" ] ||
            fail "t3@$version is not installed under $runtime/versions and is not the image seed"
        rm -rf "$target"
        stage=$(mktemp -d "$runtime/versions/.seed.XXXXXX")
        trap 'rm -rf "$stage"' EXIT HUP INT TERM
        cp -R /opt/t3/. "$stage/"
        mv "$stage" "$target"
        trap - EXIT HUP INT TERM
    fi
    [ "$(cat "$target/.install-complete")" = "$version" ] ||
        fail "t3@$version is incomplete under $runtime/versions"

    # The real database makes an incompatible downgrade fail here rather than
    # in a crash loop after the restart.
    protocol=$(t3_runtime_protocol "$target/t3" "$home/userdata/statev2.sqlite") ||
        fail "t3@$version cannot run on this home"

    pending=$(mktemp "$runtime/.service-state.XXXXXX")
    trap 'rm -f "$pending"' EXIT HUP INT TERM
    jq -n --argjson protocol "$protocol" --arg version "$version" \
        '{protocol: $protocol, activeVersion: $version}' > "$pending"
    mv "$pending" "$state"
    trap - EXIT HUP INT TERM
) 9> "$runtime/.workspace-bootstrap.lock"

printf 'Selected t3@%s. Restart the workspace to start it.\n' "$version"
