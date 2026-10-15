#!/bin/sh
set -eu

# Sysbox starts as root for dockerd; Docker exec inherits that user too. Keep
# interactive logins in the same account as T3, with readable private auth files.
if [ "$(id -u)" = 0 ]; then
    exec setpriv --reuid=agent --regid=agent --init-groups -- "$0" "$@"
fi

# Each new CLI process reads the persisted key, including T3's provider children
# and compose exec shells. No startup-only environment export is needed.
key_file=${XDG_CONFIG_HOME:-$HOME/.config}/agent-container/context7.key
if [ -z "${CONTEXT7_API_KEY:-}" ] && [ -f "$key_file" ]; then
    if [ ! -r "$key_file" ]; then
        echo "Context7 key file is unreadable by this workspace user." >&2
        exit 1
    fi
    IFS= read -r CONTEXT7_API_KEY < "$key_file"
    export CONTEXT7_API_KEY
fi
case "${0##*/}" in
    codex) exec /opt/codex/bin/codex "$@" ;;
    opencode) exec /opt/opencode/opencode "$@" ;;
    *) echo "Invoke this launcher as codex or opencode." >&2; exit 1 ;;
esac
