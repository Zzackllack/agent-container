#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/opencode.env"

case "${1:-}" in
    amd64)
        # The baseline build also works on x86 servers without AVX2.
        target=linux-x64-baseline
        checksum=$OPENCODE_SHA256_AMD64
        ;;
    arm64)
        target=linux-arm64
        checksum=$OPENCODE_SHA256_ARM64
        ;;
    *)
        echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2
        exit 1
        ;;
esac

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM
archive="$download_dir/opencode.tgz"
# V2 distributes native platform packages through npm; no Node runtime is needed.
package="cli-$target"
curl --fail --silent --show-error --location --retry 3 \
    "https://registry.npmjs.org/@opencode/$package/-/$package-$OPENCODE_VERSION.tgz" --output "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --strict
tar -xzf "$archive" -C "$download_dir"
install -d /opt/opencode
install -m 0755 "$download_dir/package/bin/opencode" /opt/opencode/opencode
ln -s /opt/opencode/opencode /usr/local/bin/opencode

test "$(opencode --version)" = "opencode v$OPENCODE_VERSION"
