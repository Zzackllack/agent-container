#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/gh.env"
case "${1:-}" in
    amd64) architecture=amd64; checksum=$GH_SHA256_AMD64 ;;
    arm64) architecture=arm64; checksum=$GH_SHA256_ARM64 ;;
    *) echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2; exit 1 ;;
esac
download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM
package="gh_${GH_VERSION}_linux_${architecture}"
curl --fail --silent --show-error --location --retry 3 \
    "https://github.com/cli/cli/releases/download/v${GH_VERSION}/${package}.tar.gz" \
    --output "$download_dir/gh.tar.gz"
printf '%s  %s\n' "$checksum" "$download_dir/gh.tar.gz" | sha256sum --check --strict
tar -xzf "$download_dir/gh.tar.gz" -C "$download_dir"
install -m 0755 "$download_dir/$package/bin/gh" /usr/local/bin/gh
install -d /usr/local/share/man/man1
cp "$download_dir/$package/share/man/man1/"* /usr/local/share/man/man1/
gh --version | head -n 1 | grep -F "gh version $GH_VERSION "
