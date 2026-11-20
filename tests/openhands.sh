#!/bin/bash
set -euo pipefail

image=${1:?Workspace image required}
backend=

cleanup() {
    if [[ -n "$backend" ]]; then
        docker rm -f "$backend" >/dev/null
    fi
}
trap cleanup EXIT

wait_for_http() {
    local container=$1 path=$2 address deadline
    address=$(docker port "$container" 8000/tcp)
    deadline=$((SECONDS + 240))
    until curl --fail --silent --max-time 5 "http://$address$path" >/dev/null; do
        if (( SECONDS >= deadline )) || [[ $(docker inspect --format '{{.State.Running}}' "$container") != true ]]; then
            docker logs "$container" >&2
            echo "OpenHands did not serve $path." >&2
            return 1
        fi
        sleep 2
    done
}

backend=$(docker run -d --init -p 127.0.0.1::8000 \
    -e LOCAL_BACKEND_API_KEY=openhands-ci-test-key \
    -e GH_TOKEN=openhands-ci-fake-token \
    -e AGENT_CANVAS_DISABLE_TELEMETRY=1 \
    "$image" agent-canvas --backend-only --public --host 0.0.0.0)

wait_for_http "$backend" /ready
wait_for_http "$backend" /api/automation/health

# Confirm the real backend shell gets the workspace and the job's gh identity.
backend_address=$(docker port "$backend" 8000/tcp)
# The command substitutions run in the backend shell.
# shellcheck disable=SC2016
curl --fail --silent --show-error --max-time 30 \
    -H 'X-Session-API-Key: openhands-ci-test-key' \
    -H 'Content-Type: application/json' \
    --data '{"command":"test \"$(id -u)\" = 1000 && test \"$(gh auth token)\" = openhands-ci-fake-token","cwd":"/workspace","timeout":10}' \
    "http://$backend_address/api/bash/execute_bash_command" |
    jq -e '.exit_code == 0' >/dev/null
