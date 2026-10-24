# 26. Build, deployment, and services

[Manual contents](README.md)

The library and reference game have separate outputs. `npm run build` produces
`dist/` and declarations for package consumers. `npm run build:game` produces
`game-dist/` with the browser entries and asset finalization. Deploying a library
directory does not by itself provide a playable application.

## Build the reference game

For a host whose same-origin terrain route is `/tiles`, PowerShell setup is:

```powershell
$env:VITE_NABLA_TILES_URL = '/tiles'
npm run build:game
```

This selects the route at build time; it does not create a production proxy.
Atlas supports direct browser access with CORS, so `/tiles` is optional.
Serve `game-dist/` through the
application's web server, preserve resource paths and content types, and provide
the HTTPS origin used by the application.

## Optional production terrain proxy

The intended mapping preserves the suffix after `/tiles/`. A minimal nginx location
illustrating that mapping is:

```nginx
location /tiles/ {
    proxy_pass https://atlas.chained.world/euskadi/terraform/;
    proxy_set_header Host atlas.chained.world;
    proxy_ssl_server_name on;
}
```

This is a configuration fragment, not a complete deployment: place it in the
appropriate server block and validate it in your infrastructure. The trailing
slashes matter to URI replacement. Do not route tile failures to an HTML SPA
fallback, which hides the real HTTP/schema error. Preserve meaningful upstream
statuses and test a known published object using its actual filename.

## Supporting services

The optional Compose development stack supports cache/generation workflows.
Read `compose.dev.yaml` and the world-cache guide for its current volumes, endpoints,
and operational commands. It is distinct from consuming already published tiles.
Publication order should make a complete set of immutable resources available
before switching the metadata that references them; use the actual publisher's
contract rather than assuming a fixed `manifest.json` entry.

The relay is a separate Node service. Expose it through a `wss://` endpoint for an
HTTPS game, check `/health`, and configure room/rate/interest limits from the server's
current options. It does not replace terrain hosting or asset serving.

## Release validation

Test fresh page load, direct navigation to each supported entry, resource URLs,
workers, secure websocket connection, and failure reporting. Record build/version
and deployment configuration. Keep source/assets attribution with redistributed
content. Avoid claiming live-service compatibility solely from a static build.

## Source of truth

- [Vite build and development proxy](../../vite.game.config.ts).
- [Game asset finalizer](../../scripts/finalize-game-assets.mjs).
- [Development stack](../../compose.dev.yaml).
- [Cache operations](../world-cache-operations.md).
- [Relay implementation](../../services/relay/server.mjs).
