#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/node.env"

case "${1:-}" in
    amd64)
        architecture=x64
        checksum=$NODE_SHA256_AMD64
        ;;
    arm64)
        architecture=arm64
        checksum=$NODE_SHA256_ARM64
        ;;
    *)
        echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2
        exit 1
        ;;
esac

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM
archive="node-v${NODE_VERSION}-linux-${architecture}.tar.xz"

curl --fail --show-error --location --retry 3 \
    "https://nodejs.org/dist/v${NODE_VERSION}/${archive}" \
    --output "$download_dir/$archive"
printf '%s  %s\n' "$checksum" "$download_dir/$archive" | sha256sum --check --strict

# /opt keeps the image-managed runtime out of /usr/local/bin, matching the
# other toolchains here; PATH is set in the Dockerfile.
tar -xJf "$download_dir/$archive" -C "$download_dir"
install -d /opt/node
cp -R "$download_dir/node-v${NODE_VERSION}-linux-${architecture}/." /opt/node/

# npm verifies the registry's own integrity hashes for these packages.
export PATH="/opt/node/bin:$PATH"
npm install --global --no-fund --no-audit "pnpm@$PNPM_VERSION" "yarn@$YARN_VERSION"

test "$(node --version)" = "v$NODE_VERSION"
test "$(pnpm --version)" = "$PNPM_VERSION"
test "$(yarn --version)" = "$YARN_VERSION"
