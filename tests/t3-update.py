# /// script
# dependencies = ["websockets>=15,<16"]
# ///
"""Exercise T3's persistent runtime on a disposable volume.

Run with: uv run tests/t3-update.py agent-container:check
Downloads the preceding nightly; never uses real provider credentials. Updates
in place when both runtimes share a launcher protocol, and verifies the local
selection a protocol bump requires otherwise. Set T3_UPDATE_FROM to an exact
older release to exercise a particular transition.
"""

import asyncio
import http.cookiejar
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import uuid
from typing import Any

import websockets

STATE_PATH = "/home/agent/.t3/runtime/service-state.json"

# Upstream exposes the launcher protocol only by rejecting every other value.
PROTOCOL = r"""
set -eu
runtime=$1
"$runtime/t3" __service-preflight --database-path "$runtime/.protocol-probe.sqlite" \
    --launcher-protocol 4 |
    jq -er 'if .status == "ready" then "4"
        else (.reason | capture("requires protocol (?<protocol>[0-9]+)").protocol) end'
"""


def docker(*args: str) -> str:
    return subprocess.check_output(["docker", *args], text=True).strip()


def protocol_of(image: str, entry: str) -> int:
    return int(
        docker("run", "--rm", image, "sh", "-ec", PROTOCOL, "probe", entry)
    )


def start(name: str, image: str, mount: str) -> str:
    docker(
        "run",
        "-d",
        "--init",
        "--name",
        name,
        "--mount",
        mount,
        "-p",
        "127.0.0.1::3773",
        image,
    )
    return "http://127.0.0.1:" + docker("port", name, "3773").rsplit(":", 1)[1]


def wait_for_server(base: str, version: str) -> dict[str, Any]:
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(
                base + "/.well-known/t3/environment", timeout=3
            ) as response:
                descriptor = json.load(response)
            if descriptor["serverVersion"] == version:
                assert descriptor["capabilities"]["serverSelfUpdate"] == "boot-service"
                return descriptor
        except (OSError, ValueError):
            pass
        time.sleep(1)
    raise AssertionError(f"T3 did not become ready on {version}")


async def update(base: str, name: str, version: str) -> None:
    opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar())
    )
    pairing = docker(
        "exec", name, "t3", "pair", "--ttl", "5m", "--label", "disposable-update-check"
    )
    # Keep the one-time credential and session ticket private, including on failure.
    match = re.search(r"#token=([^\s]+)", pairing)
    assert match is not None, "No pairing credential returned"
    request = urllib.request.Request(
        base + "/api/auth/browser-session",
        data=json.dumps({"credential": match[1]}).encode(),
        headers={"Content-Type": "application/json", "Origin": base},
    )
    with opener.open(request, timeout=10) as response:
        json.load(response)
    request = urllib.request.Request(
        base + "/api/auth/websocket-ticket", data=b"", headers={"Origin": base}
    )
    with opener.open(request, timeout=10) as response:
        ticket = json.load(response)["ticket"]
    url = (
        base.replace("http:", "ws:") + "/ws?orchestrationProtocol=2&wsTicket=" + ticket
    )
    async with websockets.connect(url, origin=base) as connection:
        await connection.send(
            json.dumps(
                {
                    "_tag": "Request",
                    "id": "1",
                    "tag": "server.updateServer",
                    "payload": {"targetVersion": version},
                    "headers": [],
                }
            )
        )
        while True:
            message = json.loads(await asyncio.wait_for(connection.recv(), timeout=120))
            if message.get("_tag") != "Exit":
                continue
            assert message["exit"]["_tag"] == "Success", "Update RPC failed"
            assert message["exit"]["value"]["targetVersion"] == version
            return


# Seed an older runtime without changing the image or committing a nightly pin.
PREPARE = r"""
set -eu
old=$1
arch=$(dpkg --print-architecture)
case "$arch" in amd64) target=linux-x64 ;; arm64) target=linux-arm64 ;; *) exit 1 ;; esac
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
package=t3-$old-$target.tar.gz
base=https://github.com/pingdotgg/t3code/releases/download/v$old
curl -fsSL --retry 3 "$base/SHA256SUMS" > "$stage/SHA256SUMS"
curl -fsSL --retry 3 "$base/$package" > "$stage/$package"
(cd "$stage"; awk -v package="$package" '$2 == package || $2 == "*" package' SHA256SUMS | sha256sum -c)
destination=$T3CODE_HOME/runtime/versions/$old
mkdir -p "$destination"
tar -xzf "$stage/$package" -C "$destination" --strip-components=1
printf '%s\n' "$old" > "$destination/.install-complete"
protocol=$("$destination/t3" __service-preflight --database-path "$destination/.protocol-probe.sqlite" \
    --launcher-protocol 4 |
    jq -er 'if .status == "ready" then "4"
        else (.reason | capture("requires protocol (?<protocol>[0-9]+)").protocol) end')
jq -n --argjson protocol "$protocol" --arg old "$old" \
    '{protocol:$protocol,activeVersion:$old}' > "$T3CODE_HOME/runtime/service-state.json"
printf 'PROTOCOL=%s\n' "$protocol"
"""


def main() -> None:
    image = sys.argv[1] if len(sys.argv) > 1 else "agent-container:check"
    target = docker("run", "--rm", image, "cat", "/opt/t3/.install-complete")
    with urllib.request.urlopen(
        "https://api.github.com/repos/pingdotgg/t3code/releases?per_page=100"
    ) as response:
        nightlies = [
            release["tag_name"][1:]
            for release in json.load(response)
            if re.fullmatch(r"v\d+\.\d+\.\d+-nightly\.\d+\.\d+", release["tag_name"])
        ]
    previous = os.environ.get("T3_UPDATE_FROM") or nightlies[
        nightlies.index(target) + 1
    ]
    target_protocol = protocol_of(image, "/opt/t3")
    name = "agent-t3-update-" + uuid.uuid4().hex[:10]
    volume = name + "-home"
    mount = f"type=volume,source={volume},target=/home/agent"
    try:
        prepared = docker(
            "run",
            "--rm",
            "--init",
            "--mount",
            mount,
            image,
            "sh",
            "-ec",
            PREPARE,
            "fixture",
            previous,
        )
        previous_protocol = int(re.search(r"PROTOCOL=(\d+)", prepared).group(1))
        base = start(name, image, mount)
        wait_for_server(base, previous)

        if previous_protocol == target_protocol:
            asyncio.run(update(base, name, target))
            wait_for_server(base, target)
            expected = json.loads(docker("exec", name, "cat", STATE_PATH))
            assert expected["update"]["status"] == "committed"
            summary = f"in-app update {previous} -> {target}"
        else:
            # The running launcher validates the staged runtime with its own
            # protocol and refuses before committing; this is the user's toast.
            blocked = json.loads(
                docker(
                    "exec",
                    name,
                    "sh",
                    "-ec",
                    "/opt/t3/t3 __service-preflight "
                    "--database-path /home/agent/.t3/userdata/statev2.sqlite "
                    f"--launcher-protocol {previous_protocol}",
                )
            )
            assert blocked["status"] == "blocked", blocked
            assert (
                f"requires protocol {target_protocol}" in blocked["reason"]
            ), blocked
            unchanged = json.loads(docker("exec", name, "cat", STATE_PATH))
            assert unchanged["activeVersion"] == previous, unchanged
            assert "update" not in unchanged, unchanged
            docker("exec", name, "t3-runtime-select", "seed")
            expected = {"protocol": target_protocol, "activeVersion": target}
            assert json.loads(docker("exec", name, "cat", STATE_PATH)) == expected
            summary = (
                f"launcher protocol {previous_protocol} -> {target_protocol} "
                f"local selection {previous} -> {target}"
            )

        docker("restart", "-t", "20", name)
        base = "http://127.0.0.1:" + docker("port", name, "3773").rsplit(":", 1)[1]
        wait_for_server(base, target)
        assert json.loads(docker("exec", name, "cat", STATE_PATH)) == expected
        docker("stop", "-t", "20", name)
        docker("rm", name)
        # A new container has no writable-layer files from the preceding one.
        base = start(name, image, mount)
        wait_for_server(base, target)
        assert json.loads(docker("exec", name, "cat", STATE_PATH)) == expected
        assert docker("exec", name, "t3", "--version") == "t3 v" + target
        print(f"T3 {summary}, restart, and recreation checks passed.")
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True, check=False)
        subprocess.run(
            ["docker", "volume", "rm", volume], capture_output=True, check=False
        )


if __name__ == "__main__":
    main()
