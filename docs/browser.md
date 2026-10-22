# T3 browser on Linux hosts

T3 downloads its own Chrome headless shell into the persistent home volume on
first use. The image already includes its shared libraries and fonts. The
preview browser starts Chrome with its sandbox, which Linux can block. T3 then
reports:

```text
This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+).
```

That message has two unrelated causes and its advice only covers the first one.

| Workspace | Cause | Fix |
| --- | --- | --- |
| Base stack on Ubuntu 23.10+ | AppArmor restricts unprivileged user namespaces | Load the host policy and add `compose.browser.yaml` |
| Sysbox | The container user cannot map a nested user namespace | Use `compose.browser-unsandboxed.yaml`, or leave previews unused |

## Decide which cause applies

```sh
sysctl kernel.apparmor_restrict_unprivileged_userns
```

`1` means the host restricts user namespaces, but that value alone does not
separate the rows above: it is also `1` under Sysbox, where the host policy
cannot help. The reliable check runs inside the workspace:

```sh
docker compose exec --user agent workspace unshare -U --map-root-user true
```

- `unshare: unshare failed: Operation not permitted` means namespace creation is
  blocked: the AppArmor restriction is the cause and the policy route applies.
- `unshare: write failed /proc/self/uid_map: Operation not permitted` means
  creation works but the ID mapping does not: the container blocks it, and host
  policy cannot change that. Skip to [Sysbox workspaces](#sysbox-workspaces).
- Success means Chrome's sandbox already has what it needs; check T3's launch
  error instead.

## Sysbox workspaces

Sysbox gives the workspace its own user namespace and [does not apply Docker
AppArmor profiles](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/security.md#apparmor).
The `agent` user has no capabilities in that namespace, so a
nested ID mapping stays impossible even when a profile would allow the namespace
itself:

```sh
docker compose exec --user agent workspace unshare -U --map-root-user true
# unshare: write failed /proc/self/uid_map: Operation not permitted
docker compose exec --user agent workspace sh -c \
    'unshare -U sh -c "echo deny > /proc/self/setgroups"'
# sh: 1: cannot create /proc/self/setgroups: Permission denied
```

Chrome's sandbox needs that mapping to drop the renderer into a namespace with
no filesystem access. An AppArmor profile grants the `userns` permission; it
cannot grant `CAP_SETUID` or `CAP_SETGID`, so loading the host policy does not
change the result. Chrome also refuses to run sandboxed as root, so there is no
user to fall back to. `t3 browser setup` reports "This host is ready" once the
profile is visible, which is misleading here.

Use the unsandboxed override instead:

```sh
docker compose -f compose.yaml -f compose.sysbox.yaml -f compose.browser-unsandboxed.yaml up -d --wait
```

It sets `T3CODE_SERVER_BROWSER_SANDBOX=0`, which makes T3 pass `--no-sandbox`
to its headless browser. For Coolify Raw Compose, add the
`workspace.environment` entry from that file to the deployed definition.

The trade-off is real: without Chrome's sandbox, a renderer exploit in a page
the browser opens runs as `agent` inside the workspace, with access to `~/.t3`,
provider credentials, the project volumes, and — under Sysbox — the inner Docker
socket. The container boundary still keeps that code off the host, but it no
longer protects the workspace's own secrets. Prefer local HTML previews and
pages you control, and keep the T3 runtime updated. Prompt injection from page
content is a separate risk that no browser sandbox addresses.

Leaving the override out is a valid choice: `html_preview` and browser tabs then
fail, and everything else works.

## Why setup inside the container fails

`sudo env "PATH=$PATH" t3 browser setup` configures the machine where it runs.
Inside this image the container cannot load policy into the host kernel: the
image has no `/etc/apparmor.d`, policy management needs privileges the workspace
does not have, and the enforced policy is the host's. Writing a file inside the
container only satisfies the container-side check.

T3's [startup check](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/preview/PreviewBrowserHost.ts)
tests whether the profile path exists, not whether a policy is loaded. That is
also why an empty file or an empty directory silences the check without
enabling anything; see [Troubleshoot the mount](#troubleshoot-the-mount).

## Load the policy on the Docker host

Run these commands in a checkout on the **Ubuntu Docker host**, outside the
workspace container. No host installation of T3 is needed. First inspect the
restriction and any recent denials:

```sh
sysctl kernel.apparmor_restrict_unprivileged_userns
sudo journalctl -k --since '10 minutes ago' | rg 'apparmor|unprivileged_userns'
```

The supplied profile follows T3's upstream policy and requires AppArmor ABI 4.
If `apparmor_parser` is missing, install the host's `apparmor` package. Validate,
install, and load it:

```sh
sudo apparmor_parser --skip-kernel-load config/apparmor-t3-chrome-headless-shell
sudo install -m 0644 config/apparmor-t3-chrome-headless-shell /etc/apparmor.d/t3-chrome-headless-shell
sudo apparmor_parser --replace /etc/apparmor.d/t3-chrome-headless-shell
sudo aa-status | rg t3-chrome-headless-shell
```

If that host path already exists, inspect it before replacing it. A directory at
this path is not a profile: `install` then nests the file inside it and
`apparmor_parser` fails or loads the wrong path. Back up a real file first,
especially if a host T3 installation manages it.

The profile allows user namespaces for executables matching
`/**/tools/chrome-headless-shell/*/*/chrome-headless-shell`, covering T3's
platform/version directories and future browser updates. This is a host-wide
allowance for that path pattern, including user-writable paths; it is not scoped
to this Compose project. It keeps the global restriction and Chrome's sandbox
enabled. Keep the installed host policy under administrator control.

## Make the profile visible to T3

Add `compose.browser.yaml` to your existing Compose files and recreate the
workspace:

```sh
docker compose -f compose.yaml -f compose.browser.yaml up -d --wait
```

Keep any other overrides, such as `compose.images.yaml`, and use the same
Compose project name so the existing volumes are retained. Include the browser
override in subsequent commands, for example by adding it to `COMPOSE_FILE` in
`.env`. For Coolify Raw Compose, add the `workspace.volumes` entry from
`compose.browser.yaml` to the deployed definition after installing the policy
on its Docker host.

The override mounts only the host profile file, read-only, at T3's expected path.
It sets `create_host_path: false` so Compose fails instead of inventing a
directory when the host path is missing. The default stack stays portable to
hosts without AppArmor. No image rebuild is required.

Retry opening a T3 browser tab, then take a snapshot. With the same Compose
overrides, this checks file visibility and T3's setup diagnostics:

```sh
docker compose exec --user agent workspace test -f /etc/apparmor.d/t3-chrome-headless-shell
docker compose exec --user agent workspace t3 browser setup
```

Run the diagnostic as `agent`, without sudo; the root wrapper can otherwise
bootstrap a separate T3 runtime under `/root/.t3`. The loaded policy and mounted
file address the AppArmor error; a successful browser open and snapshot are
still needed to verify the host's remaining sandbox support. If startup still
fails, inspect the host's kernel denials and T3's launch error. Do not mount the
host's security filesystem or grant the container policy-management access.

## Troubleshoot the mount

`test -f` above distinguishes the failure modes. If it fails while the path
exists, the mount is wrong:

```sh
# inside the workspace: directory instead of the profile file
ls -ld /etc/apparmor.d/t3-chrome-headless-shell
# outside: the bind source Docker created for a missing host path
ls -ld /etc/apparmor.d/t3-chrome-headless-shell
```

`compose.browser.yaml` prevents this with `create_host_path: false`, but
hand-written volume entries and some orchestrators (including Coolify Raw
Compose) create the missing source as a directory. In that state T3's existence
check passes, the profile is absent, and the browser still fails with the
AppArmor message. Recover on the host, then recreate the container so the bind
target is a file:

```sh
sudo rmdir /etc/apparmor.d/t3-chrome-headless-shell
sudo install -m 0644 config/apparmor-t3-chrome-headless-shell /etc/apparmor.d/t3-chrome-headless-shell
sudo apparmor_parser --replace /etc/apparmor.d/t3-chrome-headless-shell
sudo aa-status | rg t3-chrome-headless-shell
docker compose -f compose.yaml -f compose.sysbox.yaml -f compose.browser.yaml up -d --force-recreate --wait
```

Under Sysbox this still will not enable the sandbox; fix the mount only if you
intend to run the base stack or want the check to report accurately.

## Remove the exception

Remove the browser override and recreate the workspace first. If no other T3
installation on the host uses the policy, unload and remove it on the host:

```sh
sudo apparmor_parser --remove /etc/apparmor.d/t3-chrome-headless-shell
sudo rm /etc/apparmor.d/t3-chrome-headless-shell
```
