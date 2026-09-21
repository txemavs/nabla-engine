# Private shared world cache

This service caches exact OSM queries and Esri elevation tiles on disk. It is a
shared demand cache, not a pre-generated national map archive. Source OSM data
remains ODbL; provider elevation terms still apply. It does not fetch satellite imagery.

## Install

Requires Docker Compose. Run from this directory:

```sh
mkdir -p data
printf 'CACHE_UID=%s\nCACHE_GID=%s\n' "$(id -u)" "$(id -g)" > .env
docker compose up -d --build
```

The service listens on **127.0.0.1:8787 only**. It deliberately has no public
route or bundled credentials. Access it through an authorized SSH tunnel or a
private network. If publishing behind a reverse proxy later, add authentication
and request limits before exposing it; the service itself is not an authentication
boundary. Do not publish the development Vite proxy to untrusted networks.

```sh
ssh -N -L 127.0.0.1:18787:127.0.0.1:8787 your-user@your-server
```

For local development, put this in the repository-root `.env.local`:

```ini
NABLA_CACHE_UPSTREAM=http://127.0.0.1:18787
```

Put this in `playground/.env.local`:

```ini
VITE_WORLD_CACHE_URL=/world-cache
```

Both files are ignored by Git. Restart Vite after changing configuration. The
public repository contains no installed domain, account, private key or data.
Other installations choose their own local disk or private server. The SSH tunnel
must be running; it needs restarting after a machine reboot or lost connection.
A production frontend must configure its own authenticated `/world-cache` route;
the Vite proxy is development-only.

## Storage and provider behavior

- `./data` is persistent across container replacement. Default budget: **10 GiB**;
  periodic pruning removes oldest entries above budget (transient overshoot is possible).
- Successful OSM JSON and elevation bytes are cached for 30 days. Identical requests
  share a lock, preventing duplicate upstream downloads. Failures and incomplete OSM
  responses are not cached. Stale data is served if an upstream refresh fails.
- Cold OSM requests are serialized and spaced 30 seconds apart. Failures introduce
  a 60-second cooldown. Cache hits bypass that queue. Elevation has per-key locking.
- `X-Nabla-Cache` reports `HIT`, `MISS` or `STALE`. `/health` is a local health check.
- The service only fetches its fixed OSM/Esri providers; it is not an arbitrary URL
  proxy. Request bodies and responses have size limits; no location/query logs are kept.
- Public Overpass may still fail for a region that has never been cached. A prepared
  regional extract/tile archive is the next step for guaranteed regional coverage.

## Tests

```sh
CACHE_DIR=/tmp/nabla-cache-test python3 test_cache.py
```

These tests mock upstream traffic and exercise persistent hits, incomplete data,
stale fallback and rate coordination.
