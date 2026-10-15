#!/bin/sh
set -eu

export T3CODE_HOME="${T3CODE_HOME:-$HOME/.t3}"
runtime="$T3CODE_HOME/runtime"
state="$runtime/service-state.json"
mkdir -p "$runtime/versions"

# The upstream launcher owns this file after bootstrap. Never reset its chosen
# version or a pending update when the container or image is replaced.
(
    flock 9
    if [ ! -e "$state" ]; then
        version=$(cat /opt/t3/.install-complete)
        target="$runtime/versions/$version"
        if [ ! -e "$target" ]; then
            stage=$(mktemp -d "$runtime/versions/.bootstrap.XXXXXX")
            trap 'rm -rf "$stage"' EXIT HUP INT TERM
            cp -R /opt/t3/. "$stage/"
            mv "$stage" "$target"
            trap - EXIT HUP INT TERM
        fi
        test "$(cat "$target/.install-complete")" = "$version"
        pending=$(mktemp "$runtime/.service-state.XXXXXX")
        # Protocol 3 is the upstream standalone-runtime layout. Its launcher
        # validates the complete state and handles migrations/update rollback.
        jq -n --arg version "$version" '{protocol: 3, activeVersion: $version}' > "$pending"
        mv "$pending" "$state"
    fi
) 9> "$runtime/.workspace-bootstrap.lock"

version=$(jq -er '.activeVersion | select(type == "string" and test("^[0-9][0-9A-Za-z.+-]*$"))' "$state")
entry="$runtime/versions/$version/t3"
if [ ! -x "$entry" ] || [ "$(cat "$runtime/versions/$version/.install-complete")" != "$version" ]; then
    echo "The selected T3 runtime is missing or incomplete: $version" >&2
    exit 1
fi
case "${0##*/}" in
    t3) exec "$entry" "$@" ;;
    workspace-t3) exec "$entry" __service-launcher "$@" ;;
    *) echo 'Invoke this helper as t3 or workspace-t3.' >&2; exit 1 ;;
esac
