# Context7 MCP for Codex and OpenCode

`context7-setup` configures both installed CLIs to use the hosted MCP endpoint
`https://mcp.context7.com/mcp`. It uses the existing native CLI configuration
commands; no Node.js, npm, or separate MCP daemon is required. See
[Context7's client configurations](https://context7.com/docs/resources/all-clients)
and [official OpenAI MCP documentation](https://learn.chatgpt.com/docs/extend/mcp).

## Configure with your API key

Create a key in the [Context7 dashboard](https://context7.com/dashboard). After
rebuilding the image, run the helper as the workspace user:

```sh
docker compose exec --user agent workspace context7-setup
```

Paste the key at the hidden terminal prompt. Do not put it in chat, command
arguments, or a checked-in `.env`. The same command can be run directly from a
container shell. Use your configured `COMPOSE_FILE` or both Sysbox files when
working in that mode.

For a home volume created by an earlier image, apply the
[one-time config-directory ownership repair](github.md#install-and-log-in)
before setup if `~/.config` is still root-owned.

For automation, `context7-setup --stdin` reads a key from standard input. For
example, a host secret file can be passed without exposing it in arguments:

```sh
docker compose exec -T --user agent workspace context7-setup --stdin < /path/to/private/context7.key
```

The helper configures:

- Codex's `$CODEX_HOME/config.toml`: a remote `context7` server using
  `bearer_token_env_var = "CONTEXT7_API_KEY"`.
- OpenCode's global config: a remote `context7` server with
  `Authorization: Bearer {env:CONTEXT7_API_KEY}`.
- One key file at `~/.config/agent-container/context7.key`, mode `0600`.

The image's `codex` and `opencode` launchers read this key for each new CLI
process and pass it to the native executable. This works for manual commands
and T3's provider processes. An explicitly supplied `CONTEXT7_API_KEY` takes
precedence; unset it if you intend to use the stored key. Invoke the normal
`/usr/local/bin` CLI paths so the launcher runs.

The key and global configs persist in `agent-home`. They are runtime data,
excluded from image builds. Other code running as this workspace user can read
these credentials; keep the volume and backups private.

## Existing configuration and updates

Existing settings and other MCP entries are preserved using each CLI's editor,
including OpenCode JSONC comments. The helper replaces the entry named
`context7`; use another name for a different server you want to retain. It first
updates and validates temporary copies. Invalid configuration stops setup before
publishing either config or a new key. Private pre-change backups are placed
under `~/.config/agent-container/backups/` and the helper prints their location.

Supported OpenCode files are `opencode.jsonc`, `opencode.json`, or legacy
`config.json` in its global config directory. If more than one exists, consolidate
those global layers first so an old entry cannot override the new one. The helper
also rejects `OPENCODE_CONFIG`, `OPENCODE_CONFIG_DIR`, and
`OPENCODE_CONFIG_CONTENT` overrides; unset them before using this global setup.
`CODEX_HOME` and `XDG_CONFIG_HOME` paths are respected. Project-level MCP settings
can still override global configuration.

Rerun the helper to rotate the key. Each output file is replaced atomically;
backups retain the preceding key/configs. This is not a multi-file transaction:
if a disk or permission error interrupts publication, restore the printed backup
or rerun setup after fixing the error. Start fresh agent/provider sessions after
configuration changes; restart T3 providers/server if an existing process keeps
its earlier MCP configuration.

## Verify and use

```sh
docker compose exec --user agent workspace codex mcp list
docker compose exec --user agent workspace opencode mcp list
```

Codex's list confirms registration; OpenCode's list attempts server connections.
Avoid sharing raw config/debug output, which can contain resolved headers or
other credentials. These checks differ from completing an authenticated tool
call. In a fresh Codex/OpenCode session, ask:

```text
Use Context7 to find the documentation for the library and version used by this project.
```

For automatic use, add a preference to your shared global `AGENTS.md`, for
example: “Use Context7 for current library documentation.” Setup does not modify
instruction files. The same provider configuration applies when T3 launches the
CLI for a fresh session; verify a real task there separately.

If the key is rejected, check its validity/quota in Context7 and rerun setup.
The workspace needs outbound HTTPS to `mcp.context7.com`. This MCP connection
belongs to the CLI/provider process; it does not require disabling Codex's
command filesystem sandbox or publishing an inbound port.

## Remove

```sh
codex mcp remove context7
```

Remove the `mcp.context7` entry from OpenCode's global config and delete the
stored key file if neither tool needs it. Revoke the key in Context7 if needed;
private setup backups still contain previous key material until removed.

## Recorded validation

The setup tests use fake keys and verify configuration parsing by the pinned
CLIs, preserved settings/comments, rotation, private file permissions, and
failure behavior. They do not establish real-key authentication, a Context7
query, or an authenticated agent task through T3.

Image builds and those setup tests passed on native arm64 and emulated amd64.
A separate local mock MCP handshake on arm64 verified that OpenCode sent the
expected fake bearer token.
