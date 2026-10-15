#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/uv.env"

case "${1:-}" in
    amd64)
        target=x86_64-unknown-linux-gnu
        checksum=$UV_SHA256_AMD64
        ;;
    arm64)
        target=aarch64-unknown-linux-gnu
        checksum=$UV_SHA256_ARM64
        ;;
    *)
        echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2
        exit 1
        ;;
esac

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM
archive="uv-${target}.tar.gz"

curl --fail --show-error --location --retry 3 \
    "https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${archive}" \
    --output "$download_dir/$archive"
printf '%s  %s\n' "$checksum" "$download_dir/$archive" | sha256sum --check --strict
tar -xzf "$download_dir/$archive" -C "$download_dir"

install -m 0755 "$download_dir/uv-$target/uv" /usr/local/bin/uv
install -m 0755 "$download_dir/uv-$target/uvx" /usr/local/bin/uvx

# uv prints the resolved target too, e.g. "uv 0.13.1 (x86_64-unknown-linux-gnu)".
uv --version | grep -F "uv $UV_VERSION "
