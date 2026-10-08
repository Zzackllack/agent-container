#!/bin/bash
set -euo pipefail

# Run in the disposable image as root: real setpriv verifies application UID and
# Docker is mocked, so these lifecycle checks need neither Sysbox nor privileges.
[[ $(id -u) == 0 ]] || { echo "Run this test inside the image as root." >&2; exit 1; }
entrypoint=/usr/local/bin/workspace-entrypoint
test_dir=$(mktemp -d)
supervisor_pid=
cleanup() {
    if [[ -n $supervisor_pid ]]; then
        kill -TERM "$supervisor_pid" 2>/dev/null || true
        wait "$supervisor_pid" 2>/dev/null || true
    fi
    rm -rf "$test_dir"
}
trap cleanup EXIT
chmod 0755 "$test_dir"
mkdir "$test_dir/bin" "$test_dir/state"
chmod 0777 "$test_dir/state"
export MOCK_STATE="$test_dir/state" PATH="$test_dir/bin:$PATH"

cat > "$test_dir/bin/dockerd" <<'MOCK'
#!/bin/bash
set -eu
echo "$BASHPID" > "$MOCK_STATE/daemon-pid"
if [[ ${MOCK_DAEMON_FAIL:-false} == true ]]; then exit 12; fi
trap 'echo stopped > "$MOCK_STATE/daemon-stopped"; exit 0' TERM
sleep 0.2
touch "$MOCK_STATE/ready"
while :; do
    if [[ ${MOCK_DAEMON_CRASH:-false} == true && -f $MOCK_STATE/app-started ]]; then exit 19; fi
    sleep 0.1
done
MOCK
cat > "$test_dir/bin/docker" <<'MOCK'
#!/bin/sh
test -f "$MOCK_STATE/ready"
MOCK
cat > "$test_dir/bin/application" <<'MOCK'
#!/bin/bash
set -eu
test -f "$MOCK_STATE/ready"
test "$(id -un)" = agent
echo "$BASHPID" > "$MOCK_STATE/app-started"
if [[ ${MOCK_APPLICATION_EXIT:-false} == true ]]; then exit 7; fi
trap 'echo stopped > "$MOCK_STATE/app-stopped"; exit 0' TERM
while :; do sleep 0.1; done
MOCK
chmod 0755 "$test_dir/bin/"*

expect_status() {
    local expected=$1 status=0
    shift
    "$@" > "$test_dir/output" 2>&1 || status=$?
    if [[ $status != "$expected" ]]; then
        cat "$test_dir/output" >&2
        echo "Expected status $expected, got $status." >&2
        exit 1
    fi
}

result=$(WORKSPACE_DOCKER_ENABLED=false bash "$entrypoint" printf '%s' passthrough)
[[ $result == passthrough ]]
expect_status 1 env WORKSPACE_DOCKER_ENABLED=invalid bash "$entrypoint" true
expect_status 1 env WORKSPACE_DOCKER_ENABLED=true setpriv \
    --reuid=agent --regid=agent --init-groups -- bash "$entrypoint" true

export WORKSPACE_DOCKER_ENABLED=true
expect_status 1 env MOCK_DAEMON_FAIL=true bash "$entrypoint" application
[[ ! -f $MOCK_STATE/app-started ]]

rm -f "$MOCK_STATE/"*
expect_status 7 env MOCK_APPLICATION_EXIT=true bash "$entrypoint" application
test -f "$MOCK_STATE/daemon-stopped"

rm -f "$MOCK_STATE/"*
expect_status 19 env MOCK_DAEMON_CRASH=true bash "$entrypoint" application
test -f "$MOCK_STATE/app-stopped"

rm -f "$MOCK_STATE/"*
bash "$entrypoint" application > "$test_dir/output" 2>&1 &
supervisor_pid=$!
for ((attempt = 0; attempt < 100; attempt++)); do
    [[ -f $MOCK_STATE/app-started ]] && break
    sleep 0.1
done
test -f "$MOCK_STATE/app-started"
kill -TERM "$supervisor_pid"
expect_status 143 wait "$supervisor_pid"
supervisor_pid=
test -f "$MOCK_STATE/app-stopped"
test -f "$MOCK_STATE/daemon-stopped"
for pid_file in daemon-pid app-started; do
    if kill -0 "$(cat "$MOCK_STATE/$pid_file")" 2>/dev/null; then
        echo "A managed process survived shutdown: $pid_file" >&2
        exit 1
    fi
done
echo "Workspace startup and shutdown checks passed."
