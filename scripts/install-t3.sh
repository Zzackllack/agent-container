#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/t3.env"

case "${1:-}" in
    amd64)
        target=linux-x64
        checksum=$T3_SHA256_AMD64
        ;;
    arm64)
        target=linux-arm64
        checksum=$T3_SHA256_ARM64
        ;;
    *)
        echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2
        exit 1
        ;;
esac

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM
archive="$download_dir/t3.tar.gz"
release_url="https://github.com/pingdotgg/t3code/releases/download/v$T3_VERSION"
curl --fail --silent --show-error --location --retry 3 \
    "$release_url/t3-$T3_VERSION-$target.tar.gz" --output "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --strict

# Keep the complete runtime: the terminal and resource monitor use bundled files.
install -d /opt/t3
tar -xzf "$archive" -C /opt/t3 --strip-components=1
ln -s /opt/t3/t3 /usr/local/bin/t3

test "$(t3 --version)" = "t3 v$T3_VERSION"
