#!/bin/bash
set -euo pipefail
# Run as agent inside the built image with the repository mounted read-only.
# Checks the preinstalled toolchains against the pins in versions/, proves the
# image-managed trees are not user-writable, and confirms the caches agents
# write to live in the home volume rather than the image.
versions_dir=${TOOLCHAIN_VERSIONS_DIR:-/tests/versions}
if [[ ! -d $versions_dir ]]; then
    versions_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/versions"
fi

load_versions() {
    # shellcheck disable=SC1090 # variable name comes from the caller
    . "$versions_dir/$1"
}
load_versions node.env
load_versions uv.env
load_versions go.env
load_versions rust.env
load_versions java.env
load_versions maven.env
load_versions cloudflared.env

check() {
    local description=$1 expected=$2 actual
    shift 2
    actual=$("$@")
    if [[ $actual != "$expected" ]]; then
        echo "FAIL $description: expected '$expected', got '$actual'" >&2
        exit 1
    fi
    printf 'ok   %-28s %s\n' "$description" "$actual"
}

present() {
    printf 'ok   %-28s %s\n' "$1" "$(command -v "$1" || true)"
    command -v "$1" >/dev/null || {
        echo "FAIL missing command: $1" >&2
        exit 1
    }
}

# Go and Rust can be left out of an image with WITH_GO=0 / WITH_RUST=0. When the
# binary is absent the check is skipped; a wrong version still fails.
optional() {
    if ! command -v "$1" >/dev/null; then
        printf 'skip %-28s not installed in this image\n' "$1"
        return
    fi
    shift
    check "$@"
}

check node "v$NODE_VERSION" node --version
check pnpm "$PNPM_VERSION" pnpm --version
check yarn "$YARN_VERSION" yarn --version
# uv prints the resolved target too, e.g. "uv 0.13.1 (x86_64-unknown-linux-gnu)".
check uv "uv $UV_VERSION" bash -c 'uv --version | cut -d" " -f1,2'
# cloudflared appends the build date, so compare the prefix.
check cloudflared "cloudflared version $CLOUDFLARED_VERSION" bash -c 'cloudflared --version | cut -d" " -f1,2,3'
optional go "go" "go version go$GO_VERSION linux/$(dpkg --print-architecture)" go version
# rustc and cargo append the commit hash and build date, so compare the prefix.
optional rustc "rustc" "rustc $RUST_TOOLCHAIN_VERSION" bash -c 'rustc --version | cut -d" " -f1,2'
optional cargo "cargo" "cargo $RUST_TOOLCHAIN_VERSION" bash -c 'cargo --version | cut -d" " -f1,2'

# Java ships as a Debian package, so only the LTS major is pinned; Debian moves
# the patch version inside that major.
if command -v java >/dev/null; then
    java_line=$(java -version 2>&1 | head -1)
    case $java_line in
        "openjdk version \"$JAVA_MAJOR_VERSION."*) ;;
        *)
            echo "FAIL java: expected major $JAVA_MAJOR_VERSION, got '$java_line'" >&2
            exit 1
            ;;
    esac
    printf 'ok   %-28s %s\n' java "$java_line"
    javac_line=$(javac -version 2>&1)
    case $javac_line in
        "javac $JAVA_MAJOR_VERSION."*) ;;
        *)
            echo "FAIL javac: expected major $JAVA_MAJOR_VERSION, got '$javac_line'" >&2
            exit 1
            ;;
    esac
    printf 'ok   %-28s %s\n' javac "$javac_line"
    if [[ $JAVA_HOME != /opt/java || ! -x $JAVA_HOME/bin/javac ]]; then
        echo "FAIL JAVA_HOME does not point at the JDK: ${JAVA_HOME:-unset}" >&2
        exit 1
    fi
    printf 'ok   %-28s %s\n' JAVA_HOME "$JAVA_HOME"
else
    printf 'skip %-28s not installed in this image\n' java
fi
optional mvn maven "Apache Maven $MAVEN_VERSION" bash -c 'mvn --version | head -1 | cut -d" " -f1,2,3'
if command -v mvn >/dev/null; then
    # No absolute localRepository in the configuration: maven keeps its cache in
    # ~/.m2, inside the home volume, like the other package caches.
    ! grep -qE '^[[:space:]]*<localRepository>' /opt/maven/conf/settings.xml
    printf 'ok   %-28s %s\n' "maven cache" "~/.m2 inside the home volume"
fi

for tool in fd bat delta direnv fzf git gh jq just less nano pnpm protoc psql python3 rg rsync shellcheck sqlite3 sudo tmux tree uv uvx wget xz zoxide zstd node npm npx cloudflared tunnel; do
    present "$tool"
done
for tool in cargo go rustc rustfmt cargo-clippy java javac mvn; do
    command -v "$tool" >/dev/null && present "$tool"
done
# Debian ships fd as fdfind and bat as batcat; the image adds the upstream names.
test "$(readlink -f "$(command -v fd)")" = "$(readlink -f /usr/bin/fdfind)"
test "$(readlink -f "$(command -v bat)")" = "$(readlink -f /usr/bin/batcat)"

# Image-managed toolchains stay root-owned, like Codex, OpenCode, gh and Docker.
for tree in /opt/node /opt/rustup /opt/cargo /usr/local/go /opt/java /opt/maven; do
    [[ -e $tree ]] || continue
    if [[ -w $tree ]]; then
        echo "FAIL $tree is writable by $(id -un); versions must stay image-managed" >&2
        exit 1
    fi
    printf 'ok   %-28s root-owned\n' "$tree"
done

# Per-user caches belong in the home volume so they survive recreation.
cache_root=$(mktemp -d "$HOME/toolchain-check.XXXXXX")
trap 'rm -rf "$cache_root"' EXIT
export HOME="$cache_root/home" XDG_CACHE_HOME="$cache_root/cache" \
    XDG_DATA_HOME="$cache_root/data" GOPATH="$cache_root/go"
mkdir -p "$HOME"
caches=("$(npm config get cache)" "$(pnpm store path)" "$(uv cache dir)")
command -v go >/dev/null && caches+=("$(go env GOMODCACHE)")
for path in "${caches[@]}"; do
    case $path in
        "$cache_root"/*) ;;
        *)
            echo "FAIL cache outside the home volume: $path" >&2
            exit 1
            ;;
    esac
    printf 'ok   %-28s %s\n' "cache" "$path"
done
# CARGO_HOME must stay unset so cargo writes per-user installs into the home.
test -z "${CARGO_HOME:-}"
mkdir -p "$HOME/.cargo" && touch "$HOME/.cargo/probe" && rm "$HOME/.cargo/probe"

# A venv works without sudo, which is what agents actually need from python3.
python3 -m venv "$cache_root/venv"
"$cache_root/venv/bin/python" -c 'import ssl, sqlite3, venv'

echo 'Toolchain version, ownership, and cache checks passed.'
