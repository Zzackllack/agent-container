# T3 remote access

Direct pairing requires the client to reach the host's published port. Choose a
host interface reachable over your LAN or private VPN, then set `T3_BIND_ADDRESS`
and `T3_PUBLIC_URL` in `.env`. For example, if the host's LAN address is
`192.168.1.20`:

```dotenv
T3_BIND_ADDRESS=192.168.1.20
T3_PORT=3773
T3_PUBLIC_URL=http://192.168.1.20:3773
```

Replace that example address with your host's address. `T3_BIND_ADDRESS` is an IP
assigned to the Docker host; `T3_PUBLIC_URL` is the origin your client can reach.
If you change `T3_PORT`, include that port in the advertised URL as well. Recreate
the service and mint a fresh link:

```sh
docker compose up -d --wait
docker compose exec --user agent workspace t3-pair
# Or override the advertised origin for this link:
docker compose exec --user agent workspace t3-pair http://192.168.1.20:3773
```

`t3-pair` uses T3 to mint a five-minute, one-time grant and replaces the container's
internal address with the advertised origin. Use a separate fresh URL per device.
Open it in a browser, or paste it into the native client's environment settings
(**Settings → Connections → Add environment** on macOS;
**Settings → Environments** on iPhone).
Pairing links are credentials; do not share them in issues or screenshots.

Allow the published port through the host firewall and any network access rules.
VPN tools such as WireGuard, NetBird, or Tailscale are optional ways to provide
private reachability; this project does not require a particular VPN.

For HTTPS access, configure a reverse proxy with WebSocket forwarding and set
`T3_PUBLIC_URL` to its origin, for example `https://agent.example`. The hostname
must resolve from the client. A reverse proxy and TLS certificates are not
provided by this repository; keep the upstream port bound to an interface the
proxy can reach.

Use a native client compatible with the installed T3 nightly. If an app requests a
server upgrade or rejects the version, check the release's client compatibility
before changing the image, and recheck OpenCode compatibility too. The bundled
web UI matches its server version.

T3 Connect is an alternative to direct private-network access:

```sh
docker compose exec --user agent workspace t3 connect
# Complete the browser/code sign-in. Decline background service installation;
# Compose already owns the server process.
docker compose restart workspace
```

Sign in to the same T3 Connect account on your clients and select the environment.
This opt-in path contacts T3's service; it is not required for direct pairing.
The hosted `app.t3.codes` frontend requires an HTTPS backend. For a private HTTP
endpoint, use this container's web UI or direct pairing in a compatible native app.
For hosted-web access, configure HTTPS with WebSocket forwarding, or use T3 Connect.

See [T3 remote access](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)
for the supported connection and authorization flows.

For dashboard access, use the separate [dashboard guide](dashboard.md#storage-and-access).
