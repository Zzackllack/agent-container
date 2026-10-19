#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/cloudflared.env"

case "${1:-}" in
    amd64|arm64) architecture=$1 ;;
    *) echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2; exit 1 ;;
esac
test "$(dpkg --print-architecture)" = "$architecture"

# Cloudflare ships cloudflared in a signed apt repository. Pin the key by
# checksum like the Docker packages, and let apt verify the package hash from
# the signed index.
install -d -m 0755 /etc/apt/keyrings
curl --fail --silent --show-error --location --retry 3 \
    https://pkg.cloudflare.com/cloudflare-main.gpg --output /etc/apt/keyrings/cloudflare-main.gpg
printf '%s  %s\n' "$CLOUDFLARED_APT_KEY_SHA256" /etc/apt/keyrings/cloudflare-main.gpg \
    | sha256sum --check --strict
chmod 0644 /etc/apt/keyrings/cloudflare-main.gpg
cat > /etc/apt/sources.list.d/cloudflared.list <<EOF
deb [signed-by=/etc/apt/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main
EOF

# Only the cloudflared index is needed here; the Debian lists were removed by
# earlier layers and the full index is not required for a single package.
apt-get update \
    -o Dir::Etc::sourcelist=/etc/apt/sources.list.d/cloudflared.list \
    -o Dir::Etc::sourceparts=- \
    -o APT::Get::List-Cleanup=0

# The package has no service unit, so nothing tries to start during the build.
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    "cloudflared=$CLOUDFLARED_VERSION"

# The package links /usr/local/bin/cloudflared to /usr/bin/cloudflared.
cloudflared --version | grep -F "cloudflared version $CLOUDFLARED_VERSION "
