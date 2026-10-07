#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/codex.env"

case "${1:-}" in
    amd64)
        target=x86_64-unknown-linux-musl
        checksum=$CODEX_SHA256_AMD64
        ;;
    arm64)
        target=aarch64-unknown-linux-musl
        checksum=$CODEX_SHA256_ARM64
        ;;
    *)
        echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2
        exit 1
        ;;
esac

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM
archive="codex-package-$target.tar.gz"
release_url="https://github.com/openai/codex/releases/download/rust-v$CODEX_VERSION"

curl --fail --show-error --location --retry 3 \
    "$release_url/$archive" --output "$download_dir/$archive"
printf '%s  %s\n' "$checksum" "$download_dir/$archive" | sha256sum --check --strict

# Preserve the package layout: Codex also needs its code-mode host, rg, and bwrap.
install -d /opt/codex
tar -xzf "$download_dir/$archive" -C /opt/codex
chmod 0755 /opt/codex/bin/codex /opt/codex/bin/codex-code-mode-host \
    /opt/codex/codex-path/rg /opt/codex/codex-resources/bwrap
ln -s bin/codex /opt/codex/codex
ln -s /opt/codex/bin/codex /usr/local/bin/codex

test "$(codex --version)" = "codex-cli $CODEX_VERSION"
