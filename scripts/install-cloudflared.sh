#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/cloudflared.env"

case "${1:-}" in
    amd64) architecture=amd64; checksum=$CLOUDFLARED_SHA256_AMD64 ;;
    arm64) architecture=arm64; checksum=$CLOUDFLARED_SHA256_ARM64 ;;
    *) echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2; exit 1 ;;
esac
test "$(dpkg --print-architecture)" = "$architecture"

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM
package="cloudflared-linux-${architecture}.deb"
curl --fail --silent --show-error --location --retry 3 \
    "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/${package}" \
    --output "$download_dir/$package"
printf '%s  %s\n' "$checksum" "$download_dir/$package" | sha256sum --check --strict

# The package is the static binary, its man page, and the /usr/local/bin
# symlink; it declares no dependencies. Installing the local file also avoids
# adding Cloudflare's apt repository, whose index only keeps the newest build.
dpkg --install "$download_dir/$package"

cloudflared --version | grep -F "cloudflared version $CLOUDFLARED_VERSION "
