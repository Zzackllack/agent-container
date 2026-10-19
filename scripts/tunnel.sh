#!/bin/sh
# Expose a local service through a Cloudflare tunnel.
#
# Without a token this starts a "quick tunnel": cloudflared picks a random
# trycloudflare.com hostname and no Cloudflare account is needed. Quick
# tunnels are for development and preview use; Cloudflare does not support
# them for production traffic. Set CLOUDFLARED_TUNNEL_TOKEN to run a named
# tunnel instead (see `cloudflared tunnel --help`).
set -eu

usage() {
    cat <<'EOF'
Usage: tunnel [PORT|URL] [options]

Publish a service that is listening inside the container and print its public
URL.

  tunnel 3000                 tunnel http://127.0.0.1:3000
  tunnel http://127.0.0.1:5173
  tunnel 3000 --detach        run in the background, print the public URL

Options:
  -d, --detach     run in the background and print the public URL
  -l, --log FILE   write the cloudflared output to FILE (default: stdout)
  -h, --help       show this help

Environment:
  CLOUDFLARED_TUNNEL_TOKEN  run this named tunnel instead of a quick tunnel
  TUNNEL_PROTOCOL           quic (default), http2, or auto
  TUNNEL_LOG_FILE           default log file for --detach
EOF
}

target=""
detach=0
log_file=${TUNNEL_LOG_FILE:-/tmp/cloudflared-tunnel.log}

while [ $# -gt 0 ]; do
    case "$1" in
        -d|--detach) detach=1; shift ;;
        -l|--log) log_file=${2:?--log needs a file}; shift 2 ;;
        -h|--help) usage; exit 0 ;;
        --) shift; break ;;
        -*) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
        *) target=$1; shift ;;
    esac
done

[ $# -eq 0 ] || target=${1:-}

# A bare port is the common case; anything else must already be a URL.
case "$target" in
    "") target=${TUNNEL_TARGET:-http://127.0.0.1:3000} ;;
    *[!0-9]*) case "$target" in *://*) ;; *) echo "Not a port or URL: $target" >&2; exit 2 ;; esac ;;
    *) target="http://127.0.0.1:$target" ;;
esac

set -- tunnel --no-autoupdate
if [ -n "${TUNNEL_PROTOCOL:-}" ]; then
    set -- "$@" --protocol "$TUNNEL_PROTOCOL"
fi
named=0
if [ -n "${CLOUDFLARED_TUNNEL_TOKEN:-}" ]; then
    named=1
    set -- "$@" run --token "$CLOUDFLARED_TUNNEL_TOKEN"
else
    set -- "$@" --url "$target"
fi

if [ "$detach" -eq 0 ]; then
    # Foreground: cloudflared prints the public URL itself once it is up.
    exec cloudflared "$@"
fi

: > "$log_file"
nohup cloudflared "$@" > "$log_file" 2>&1 &
pid=$!

# A named tunnel keeps the hostname from the Cloudflare configuration, so only
# a quick tunnel has a URL to wait for.
if [ "$named" -eq 1 ]; then
    echo "Named tunnel running (PID $pid); the public hostname comes from Cloudflare."
    echo "Log: $log_file"
    exit 0
fi

# Wait for the quick tunnel to publish its hostname.
url=""
attempt=0
while [ "$attempt" -lt 30 ]; do
    if ! kill -0 "$pid" 2>/dev/null; then
        echo "cloudflared exited early; see $log_file" >&2
        exit 1
    fi
    url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$log_file" | head -n 1 || true)
    [ -n "$url" ] && break
    attempt=$((attempt + 1))
    sleep 1
done

if [ -z "$url" ]; then
    echo "No public URL after 30s; see $log_file" >&2
    kill "$pid" 2>/dev/null || true
    exit 1
fi

echo "Public URL: $url"
echo "Target:     $target"
echo "PID:        $pid (stop with: kill $pid)"
echo "Log:        $log_file"
