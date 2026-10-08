#!/bin/sh
set -eu

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/docker.env"

case "${1:-}" in
    amd64|arm64) architecture=$1 ;;
    *) echo "Unsupported architecture: ${1:-unset}. Use amd64 or arm64." >&2; exit 1 ;;
esac
test "$(dpkg --print-architecture)" = "$architecture"

install -d -m 0755 /etc/apt/keyrings
curl --fail --silent --show-error --location --retry 3 \
    https://download.docker.com/linux/debian/gpg --output /etc/apt/keyrings/docker.asc
printf '%s  %s\n' "$DOCKER_APT_KEY_SHA256" /etc/apt/keyrings/docker.asc \
    | sha256sum --check --strict
chmod 0644 /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: trixie
Components: stable
Architectures: $architecture
Signed-By: /etc/apt/keyrings/docker.asc
EOF

# Package scripts must not start services during the image build. Respect an
# existing policy (the Debian container image normally already supplies one).
created_policy=false
cleanup() {
    if [ "$created_policy" = true ]; then rm -f /usr/sbin/policy-rc.d; fi
}
trap cleanup EXIT HUP INT TERM
if [ ! -e /usr/sbin/policy-rc.d ]; then
    printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d
    chmod 0755 /usr/sbin/policy-rc.d
    created_policy=true
fi

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    "docker-ce=$DOCKER_ENGINE_VERSION" \
    "docker-ce-cli=$DOCKER_ENGINE_VERSION" \
    "containerd.io=$CONTAINERD_VERSION" \
    "docker-buildx-plugin=$BUILDX_VERSION" \
    "docker-compose-plugin=$COMPOSE_VERSION" \
    util-linux

for package in docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin; do
    dpkg-query -W -f='${Package} ${Version}\n' "$package"
done
