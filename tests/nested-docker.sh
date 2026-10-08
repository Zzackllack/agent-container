#!/bin/sh
set -eu

# Run as agent inside a Sysbox workspace. All Docker resources belong to this
# daemon and to a unique test project; the host daemon is never contacted.
if [ "${WORKSPACE_DOCKER_ENABLED:-false}" != true ]; then
    echo "Run this test inside the workspace with the Sysbox override enabled." >&2
    exit 1
fi
test_dir=$(mktemp -d /workspace/.nested-docker-test.XXXXXX)
project="agent-container-check-$(date +%s)-$$"
export DOCKER_HOST=unix:///var/run/docker.sock
# Buildx writes client state. Keep it in the test's writable directory, including
# when the test runs through Codex; no existing Docker credentials are needed.
export DOCKER_CONFIG="$test_dir/docker-client"
mkdir "$DOCKER_CONFIG"
# DOCKER_CONTEXT takes precedence over DOCKER_HOST; inherited remote settings
# must not redirect a smoke test to a different daemon.
unset DOCKER_CONTEXT DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export TEST_IMAGE="$project:dev"
compose() {
    docker compose --project-name "$project" --file "$test_dir/compose.yaml" "$@"
}
cleanup() {
    compose down --volumes --remove-orphans >/dev/null 2>&1 || true
    docker image rm "$TEST_IMAGE" >/dev/null 2>&1 || true
    rm -rf "$test_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker info >/dev/null
mkdir "$test_dir/www"
printf 'built-inside-workspace\n' > "$test_dir/baked.txt"
printf 'nested-http-ok\n' > "$test_dir/www/index.html"
cat > "$test_dir/Dockerfile" <<'DOCKERFILE'
FROM busybox:1.37.0
COPY baked.txt /baked.txt
RUN test "$(cat /baked.txt)" = built-inside-workspace
DOCKERFILE
cat > "$test_dir/compose.yaml" <<'COMPOSE'
services:
  web:
    build: .
    image: ${TEST_IMAGE:?}
    command: ["httpd", "-f", "-p", "8080", "-h", "/www"]
    ports:
      - "127.0.0.1::8080"
    volumes:
      - ./www:/www:ro
      - state:/state
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:8080"]
      interval: 1s
      timeout: 2s
      retries: 30
  client:
    image: ${TEST_IMAGE:?}
    command: ["wget", "-q", "-O", "-", "http://web:8080"]
    profiles: ["check"]
volumes:
  state:
COMPOSE

compose up -d --build --wait web
test "$(compose run --rm --no-deps --interactive=false -T client)" = nested-http-ok
address=$(compose port web 8080)
test "$(curl --fail --silent --show-error "http://$address")" = nested-http-ok
compose exec -T --interactive=false web sh -ec 'printf "persisted\n" > /state/marker'
compose up -d --force-recreate --wait web
test "$(compose exec -T --interactive=false web cat /state/marker)" = persisted
echo "Nested image build, Compose networking, bind mount, and volume checks passed."
