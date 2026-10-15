# Working on agent-container

Debian development workspace for Codex/OpenCode/T3, plus a separate React/Hono
configuration dashboard. Keep it portable across unrelated Docker hosts.

## Commands

- Dashboard: use pnpm; run `pnpm check`, `pnpm test`, and `pnpm build` in `dashboard/`.
- Python helpers/tests: use `uv run`; shell scripts follow their existing sh/Bash dialect.
- Compose: `docker compose config --quiet` and the Sysbox override equivalent.
- Finish with `git diff --check`. Use the [verification guide](docs/development.md#verification)
  for image, installer, architecture, mount, and nested-Docker changes.

## Constraints

- Preserve persistent volumes, loopback bindings, and upstream T3 pairing.
  Never replace Sysbox with privileged mode or a host Docker socket mount.
- Keep Codex/OpenCode image-managed. T3's selected runtime lives in the home
  volume; rebuilding must not overwrite it. See [updates](docs/updates.md).
- Verify downloaded packages and both architecture hashes; keep new build inputs
  in the `.dockerignore` allowlist. See [installer rules](docs/development.md#image-and-installer-changes).
- Manage instructions as local files in persistent volumes through the dashboard.
  Preserve existing files; reject symlinks and paths outside the allowlist.
- Keep dashboard file access allowlisted, with private backups and revision
  checks; do not expose auth stores, arbitrary files, or command execution.
  See [dashboard boundaries](docs/dashboard.md).
- Use fake credentials and disposable projects/volumes for tests. Report exactly
  what passed: local builds do not prove live Sysbox or authenticated agent tasks.
- Keep examples generic and credentials out of Git. Commit coherent changes with
  Conventional Commit messages; push, publish, or deploy only when requested.

Read [development details](docs/development.md) only as needed for the affected
component; [recorded validation](docs/validation.md) is historical evidence.
