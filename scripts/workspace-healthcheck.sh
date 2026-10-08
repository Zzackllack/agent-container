#!/bin/sh
set -eu

if [ "${WORKSPACE_DOCKER_ENABLED:-false}" = true ]; then
    timeout 5 docker --host unix:///var/run/docker.sock info >/dev/null
fi
curl --fail --silent http://127.0.0.1:3773/.well-known/t3/environment >/dev/null
