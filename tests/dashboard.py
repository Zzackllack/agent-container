#!/usr/bin/env python3
"""Exercise the packaged dashboard with disposable Docker volumes, without credentials."""

import http.cookiejar
import json
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


def docker(*args: str) -> str:
    return subprocess.check_output(["docker", *args], text=True).strip()


def main() -> None:
    image = sys.argv[1] if len(sys.argv) > 1 else "agent-container-dashboard:check"
    prefix = f"agent-dashboard-test-{uuid.uuid4().hex[:10]}"
    volumes = {name: f"{prefix}-{name}" for name in ("home", "workspace", "state")}
    paths = {
        "home": "/home/agent",
        "workspace": "/workspace",
        "state": "/var/lib/agent-dashboard",
    }
    mounts = [
        arg
        for name, volume in volumes.items()
        for arg in ("-v", f"{volume}:{paths[name]}")
    ]
    password = "disposable-dashboard-password-123"
    jar = http.cookiejar.CookieJar()
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    base = ""

    def request(
        path: str, method: str = "GET", body: object = None, expected: int = 200
    ) -> object:
        headers = {"Content-Type": "application/json", "X-Agent-Dashboard": "1"}
        payload = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            base + path, data=payload, headers=headers, method=method
        )
        try:
            response = client.open(req, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            data = response.read()
            assert response.status == expected, (path, response.status, data)
            return json.loads(data)

    def start(port: str = "") -> str:
        docker(
            "run",
            "-d",
            "--name",
            prefix,
            "--init",
            "--read-only",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges:true",
            "--tmpfs",
            "/tmp:size=16m,mode=1777",
            "-p",
            f"127.0.0.1:{port}:3780",
            *mounts,
            image,
        )
        published = docker("port", prefix, "3780").rsplit(":", 1)[1]
        origin = f"http://127.0.0.1:{published}"
        for _ in range(60):
            try:
                with urllib.request.urlopen(origin + "/healthz", timeout=1) as response:
                    assert response.read() == b"ok"
                    return origin
            except (OSError, urllib.error.URLError):
                time.sleep(0.25)
        raise RuntimeError("Dashboard failed to start")

    try:
        for volume in volumes.values():
            docker("volume", "create", volume)
        # Volume copy-up gives UID 1000 ownership; /workspace is initialized like
        # the workspace image does, rather than loosening permissions in production.
        docker(
            "run",
            "--rm",
            "--user",
            "0:0",
            *mounts,
            "--entrypoint",
            "sh",
            image,
            "-ec",
            "chown 1000:1000 /workspace",
        )
        docker(
            "run",
            "--rm",
            *mounts,
            "--entrypoint",
            "sh",
            image,
            "-ec",
            "umask 077; mkdir -p /home/agent/.codex /workspace/demo/.git; "
            "printf '# Before\\n' > /home/agent/.codex/AGENTS.md; "
            f"printf '{password}\\n' > /var/lib/agent-dashboard/password",
        )
        base = start()
        request("/api/documents", expected=401)
        request("/api/session", "POST", {"password": "wrong"}, expected=401)
        request("/api/session", "POST", {"password": password})
        with client.open(base + "/", timeout=5) as response:
            assert b'<div id="root"' in response.read()
        path = "/api/document?id=" + urllib.parse.quote("codex:instructions")
        before = request(path)
        content = "# After\n\nRun integration tests.\n"
        saved = request(
            "/api/document",
            "PUT",
            {
                "id": before["id"],
                "content": content,
                "revision": before["revision"],
            },
        )
        assert saved["content"] == content
        request(
            "/api/document",
            "PUT",
            {
                "id": before["id"],
                "content": "stale",
                "revision": before["revision"],
            },
            expected=409,
        )
        # A second container sees the same file immediately, like the agent service.
        assert (
            docker(
                "run",
                "--rm",
                *mounts,
                "--entrypoint",
                "cat",
                image,
                "/home/agent/.codex/AGENTS.md",
            )
            == content.strip()
        )
        history_path = "/api/history?id=codex%3Ainstructions"
        history = request(history_path)
        assert len(history) == 1
        backup = request(
            history_path + "&backup=" + urllib.parse.quote(history[0]["id"])
        )
        assert backup["content"] == "# Before\n"
        port = base.rsplit(":", 1)[1]
        docker("rm", "-f", prefix)
        base = start(port)
        # Same signed cookie, content, and backup survive complete recreation.
        assert request(path)["content"] == content
        assert request(history_path) == history
        request("/api/session", "DELETE", {})
        request(path, expected=401)
        print(
            "Packaged dashboard: auth, shared writes, conflicts, backups, recreation, and logout passed."
        )
    finally:
        subprocess.run(["docker", "rm", "-f", prefix], capture_output=True, check=False)
        for volume in volumes.values():
            subprocess.run(
                ["docker", "volume", "rm", volume], capture_output=True, check=False
            )


if __name__ == "__main__":
    main()
