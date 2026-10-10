#!/bin/bash
set -euo pipefail

case "${WORKSPACE_INSTRUCTIONS_ENABLED:-false}" in
    false) ;;
    true)
        if [[ $(id -u) == 0 ]]; then
            setpriv --reuid=agent --regid=agent --init-groups -- workspace-instructions
        else
            workspace-instructions
        fi
        ;;
    *) echo "WORKSPACE_INSTRUCTIONS_ENABLED must be true or false." >&2; exit 1 ;;
esac

case "${WORKSPACE_DOCKER_ENABLED:-false}" in
    false) exec "$@" ;;
    true) ;;
    *) echo "WORKSPACE_DOCKER_ENABLED must be true or false." >&2; exit 1 ;;
esac
if [[ $(id -u) != 0 ]]; then
    echo "Nested Docker needs the Sysbox Compose override (root startup)." >&2
    exit 1
fi

daemon_pid=
application_pid=

stop_process() {
    local pid=$1 timeout_seconds=$2 target=$3
    [[ -n $pid ]] || return 0
    local deadline=$((SECONDS + timeout_seconds))
    kill -TERM -- "$target" 2>/dev/null || true
    while kill -0 -- "$target" 2>/dev/null && (( SECONDS < deadline )); do sleep 1; done
    kill -KILL -- "$target" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
}

cleanup() {
    local status=$?
    trap - EXIT INT TERM
    # Stop agent tasks before their Docker daemon. The application's session
    # includes its children, so shutdown also reaches terminals and CLI agents.
    if [[ -n $application_pid ]]; then stop_process "$application_pid" 10 "-$application_pid"; fi
    if [[ -n $daemon_pid ]]; then stop_process "$daemon_pid" 20 "$daemon_pid"; fi
    exit "$status"
}
trap cleanup EXIT
trap 'exit 143' TERM
trap 'exit 130' INT

echo "Starting the workspace's internal Docker daemon." >&2
dockerd --config-file=/etc/docker/daemon.json &
daemon_pid=$!

ready=false
startup_deadline=$((SECONDS + 60))
while (( SECONDS < startup_deadline )); do
    if ! kill -0 "$daemon_pid" 2>/dev/null; then
        echo "Internal Docker exited during startup. Check the daemon logs above." >&2
        exit 1
    fi
    if timeout 2 docker --host unix:///var/run/docker.sock info >/dev/null 2>&1; then
        ready=true
        break
    fi
    sleep 1
done
if [[ $ready != true ]]; then
    echo "Internal Docker did not become ready. Check Sysbox and host compatibility." >&2
    exit 1
fi

# Sysbox maps container root into a host user namespace. Only the daemon and
# this launcher stay root; the web server and its agent processes use agent.
setsid setpriv --reuid=agent --regid=agent --init-groups -- "$@" &
application_pid=$!

# Poll liveness before collecting status: Bash wait -n can overlook a child
# that exited before the wait began (notably a very short custom command).
while kill -0 "$daemon_pid" 2>/dev/null && kill -0 "$application_pid" 2>/dev/null; do
    sleep 1
done
status=0
if ! kill -0 "$daemon_pid" 2>/dev/null; then
    wait "$daemon_pid" || status=$?
    echo "Internal Docker stopped; stopping the workspace application." >&2
    if (( status == 0 )); then status=1; fi
else
    wait "$application_pid" || status=$?
fi
exit "$status"
