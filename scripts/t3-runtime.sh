#!/bin/sh
set -eu

# shellcheck source=scripts/t3-protocol.sh
. /usr/local/lib/agent-container/t3-protocol

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
        # The seed and this wrapper ship in the same image, so ask the seed
        # which launcher protocol it speaks instead of pinning the number here.
        protocol=$(t3_runtime_protocol "$target/t3" "$runtime/.bootstrap-preflight.sqlite") || {
            echo "Could not determine the launcher protocol of the T3 seed $version." >&2
            exit 1
        }
        jq -n --argjson protocol "$protocol" --arg version "$version" \
            '{protocol: $protocol, activeVersion: $version}' > "$pending"
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
