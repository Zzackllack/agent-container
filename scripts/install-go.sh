#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/go.env"

case "${1:-}" in
    amd64)
        architecture=amd64
        checksum=$GO_SHA256_AMD64
        ;;
    arm64)
        architecture=arm64
        checksum=$GO_SHA256_ARM64
        ;;
    *)
        echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2
        exit 1
        ;;
esac

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM
archive="go${GO_VERSION}.linux-${architecture}.tar.gz"

curl --fail --show-error --location --retry 3 \
    "https://go.dev/dl/${archive}" --output "$download_dir/$archive"
printf '%s  %s\n' "$checksum" "$download_dir/$archive" | sha256sum --check --strict

# The archive carries its own go/ directory, which is where the toolchain lives.
tar -xzf "$download_dir/$archive" -C /usr/local

/usr/local/go/bin/go version | grep -F " go${GO_VERSION} linux/${architecture}"
