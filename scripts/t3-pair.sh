#!/bin/sh
set -eu

public_url=${1:-${T3_PUBLIC_URL:-http://localhost:3773}}
case "$public_url" in
    http://*|https://*) ;;
    *)
        echo "Use an HTTP(S) origin reachable from your device." >&2
        exit 1
        ;;
esac
public_url=${public_url%/}
authority=${public_url#*://}
case "$authority" in
    ""|*/*|*@*|*[[:space:]]*)
        echo "Use an origin without a path, credentials, or whitespace." >&2
        exit 1
        ;;
esac
case "$public_url" in
    *\?*|*\#*)
        echo "The origin must not include query parameters or a fragment." >&2
        exit 1
        ;;
esac

# Docker's internal address is not the published address. Mint with T3, then
# replace only the origin; the one-time credential remains in the URL fragment.
pair_output=$(t3 pair --ttl 5m --label remote-client)
pairing_url=$(printf '%s\n' "$pair_output" | sed -n 's/^Pairing URL: //p')
case "$pairing_url" in
    *\#token=*) ;;
    *)
        echo "T3 did not return a recognized pairing URL." >&2
        exit 1
        ;;
esac

printf 'Pairing URL: %s/pair#%s\n' "$public_url" "${pairing_url#*#}"
printf 'Expires in 5 minutes. Use a fresh link for each device.\n'
