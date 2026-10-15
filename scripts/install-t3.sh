#!/bin/sh
set -eu

case "${1:-}" in
    amd64)
        target=linux-x64
        ;;
    arm64)
        target=linux-arm64
        ;;
    *)
        echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2
        exit 1
        ;;
esac

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM
archive="$download_dir/t3.tar.gz"
curl --fail --silent --show-error --location --retry 3 \
    'https://api.github.com/repos/pingdotgg/t3code/releases?per_page=100' \
    --output "$download_dir/releases.json"
# Resolve the train when building; no exact nightly is committed to this repo.
version=$(jq -er '[.[] | select(.draft == false) | .tag_name |
    select(test("^v[0-9]+\\.[0-9]+\\.[0-9]+-nightly\\.[0-9]+\\.[0-9]+$"))][0] | ltrimstr("v")' \
    "$download_dir/releases.json")
package="t3-$version-$target.tar.gz"
release_url="https://github.com/pingdotgg/t3code/releases/download/v$version"
curl --fail --silent --show-error --location --retry 3 \
    "$release_url/SHA256SUMS" --output "$download_dir/SHA256SUMS"
checksum=$(awk -v package="$package" '$2 == package || $2 == "*" package {print $1}' "$download_dir/SHA256SUMS")
test "${#checksum}" = 64
curl --fail --silent --show-error --location --retry 3 \
    "$release_url/$package" --output "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check --strict

# Keep the complete runtime: the terminal and resource monitor use bundled files.
install -d /opt/t3
tar -xzf "$archive" -C /opt/t3 --strip-components=1
printf '%s\n' "$version" > /opt/t3/.install-complete
test "$(/opt/t3/t3 --version)" = "t3 v$version"
