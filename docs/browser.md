# T3 browser on Ubuntu hosts

T3 downloads its own Chrome headless shell into the persistent home volume on
first use. The image already includes its shared libraries and fonts. On Ubuntu
23.10+ hosts, AppArmor can block Chrome's sandbox with
`kernel.apparmor_restrict_unprivileged_userns=1`, including inside a Debian
container. T3 then reports:

```text
This host blocks the sandbox T3's browser runs in (AppArmor on Ubuntu 23.10+).
```

## Why setup inside the container fails

`sudo env "PATH=$PATH" t3 browser setup` configures the machine where it runs.
Inside this image it fails to write `/etc/apparmor.d/t3-chrome-headless-shell`
because that directory is absent. Creating the directory is insufficient: the
policy needs to be loaded into the **Docker host's kernel**, outside the
container. Sysbox also [ignores Docker's AppArmor profiles](https://github.com/nestybox/sysbox/blob/master/docs/user-guide/security.md#apparmor),
so setting `security_opt: apparmor=...` is not a substitute.

T3's [startup check](https://github.com/pingdotgg/t3code/blob/main/apps/server/src/preview/PreviewBrowserHost.ts)
looks for the profile file in the server's filesystem. The host must load the
policy, and the container must see the file. Merely creating an empty file would
pass that check without allowing Chrome's sandbox.

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

If that host file already exists, inspect and back it up before replacing it,
especially if a host T3 installation manages it. The profile allows user
namespaces for executables matching
`/**/tools/chrome-headless-shell/*/*/chrome-headless-shell`, covering T3's
platform/version directories and future browser updates. This is a host-wide
allowance for that path pattern, including user-writable paths; it is not scoped
to this Compose project. It keeps the global restriction and Chrome's sandbox
enabled. Keep the installed host policy under administrator control.

## Make the profile visible to T3

Add `compose.browser.yaml` to your existing Compose files and recreate the
workspace. For Sysbox:

```sh
docker compose -f compose.yaml -f compose.sysbox.yaml -f compose.browser.yaml up -d --wait
```

For the base stack:

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
It refuses to create a missing host path. The default stack stays portable to
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

## Remove the exception

Remove the browser override and recreate the workspace first. If no other T3
installation on the host uses the policy, unload and remove it on the host:

```sh
sudo apparmor_parser --remove /etc/apparmor.d/t3-chrome-headless-shell
sudo rm /etc/apparmor.d/t3-chrome-headless-shell
```
