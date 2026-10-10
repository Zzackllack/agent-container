# GitHub CLI

GitHub CLI (`gh`) is included in the image for repositories, issues, pull
requests, Actions, and API calls. Version **2.102.0** is pinned in
`versions/gh.env`; the amd64/arm64 upstream archives are checksum-verified during
the image build. See the [release](https://github.com/cli/cli/releases/tag/v2.102.0)
and [upstream installation options](https://github.com/cli/cli/blob/trunk/docs/install_linux.md).

## Install and log in

For this workspace, installation happens during the image build. Rebuild an
existing deployment to include it:

```sh
docker compose up -d --build --wait
docker compose exec --user agent workspace gh --version
docker compose exec --user agent workspace gh auth login --hostname github.com --git-protocol https --web
```

When upgrading an existing home volume, check that `~/.config` is writable by
`agent`. Earlier images created that parent directory as root. Repair it once
before login if necessary (the new image already has the correct owner):

```sh
docker compose exec --user agent workspace sudo chown agent:agent /home/agent/.config
```

Use both Compose overrides or your configured `COMPOSE_FILE` if applicable.
The CLI prints a one-time code and browser URL. Open that URL on your Mac or
phone and authorize the account; the container does not need a browser or an
OAuth callback port. Complete login, then configure Git's HTTPS credential helper:

```sh
docker compose exec --user agent workspace gh auth setup-git
docker compose exec --user agent workspace gh auth status
```

The container normally has no desktop credential keyring. GitHub CLI may fall
back to storing its token in `~/.config/gh/hosts.yml`. This directory and the Git
credential-helper configuration persist in `agent-home`. Treat the home volume
and backups as private. Installation does not grant access until you log in.
Agents using this workspace have the account's configured GitHub permissions.

For token-based automation, `GH_TOKEN` is supported; inject it through your
runtime secret mechanism. `GH_TOKEN` takes precedence over stored login. Use a
fine-grained token limited to the intended repositories and operations where
appropriate. Do not bake tokens into the Dockerfile or put them in repository
files. See [gh auth login](https://cli.github.com/manual/gh_auth_login) and
[environment variables](https://cli.github.com/manual/gh_help_environment).

## Use and verify

From a repository inside the workspace:

```sh
gh repo view
gh issue list
gh pr list
gh api user --jq .login
```

`gh auth status` establishes credential presence; an actual API call verifies
that GitHub accepts them. A Git operation such as `git ls-remote` against an
intended private repository verifies Git access separately. HTTPS repositories
use `gh auth setup-git`; SSH repositories need their own SSH keys/agent access.
GitHub Enterprise can use a different hostname in the same auth commands.

The container's login does not configure a host-side instruction-sync cron
account. That account's credentials remain separate, as described in the
[instruction sync guide](instructions.md).

To remove the stored login:

```sh
gh auth logout --hostname github.com
```

Logging out removes local credentials; revoke a token/account authorization in
GitHub settings if you also want to invalidate it. If `GH_TOKEN` is injected,
remove that runtime injection separately.
