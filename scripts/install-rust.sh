#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/rust.env"

case "${1:-}" in
    amd64)
        target=x86_64-unknown-linux-gnu
        checksum=$RUSTUP_SHA256_AMD64
        ;;
    arm64)
        target=aarch64-unknown-linux-gnu
        checksum=$RUSTUP_SHA256_ARM64
        ;;
    *)
        echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2
        exit 1
        ;;
esac

download_dir=$(mktemp -d)
trap 'rm -rf "$download_dir"' EXIT HUP INT TERM

curl --fail --show-error --location --retry 3 \
    "https://static.rust-lang.org/rustup/archive/${RUSTUP_VERSION}/${target}/rustup-init" \
    --output "$download_dir/rustup-init"
printf '%s  %s\n' "$checksum" "$download_dir/rustup-init" | sha256sum --check --strict
chmod 0755 "$download_dir/rustup-init"

# Toolchains stay image-managed under /opt, like every other tool here. CARGO_HOME
# is only set for this step so the rustup proxies land next to them; leaving it
# unset at runtime keeps `cargo install` and the registry cache in the home volume.
# The toolchains stay under /opt, so rustup's own self-update cannot replace
# them; RUSTUP_AUTO_SELF_UPDATE=0 keeps it from even asking.
RUSTUP_AUTO_SELF_UPDATE=0 RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo \
    "$download_dir/rustup-init" \
    --yes --no-modify-path \
    --profile minimal \
    --default-toolchain "$RUST_TOOLCHAIN_VERSION" \
    --component rustfmt,clippy

# The proxies resolve toolchains through RUSTUP_HOME; the image sets it in ENV.
RUSTUP_HOME=/opt/rustup /opt/cargo/bin/rustc --version \
    | grep -F "rustc $RUST_TOOLCHAIN_VERSION "
RUSTUP_HOME=/opt/rustup /opt/cargo/bin/cargo --version \
    | grep -F "cargo $RUST_TOOLCHAIN_VERSION "
