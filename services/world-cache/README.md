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

## Pre-filling the cache

The `prefill.py` script warms the cache for a region so users hit cache instead
of live Overpass. Run this on chained.world where the cache service is deployed.

```sh
# Default: 11×11 grid around Irun Ventas (121 zones, ~40 km coverage)
python3 prefill.py --cache-url http://127.0.0.1:8080

# Larger region: 21×21 grid (441 zones, ~50 km coverage)
python3 prefill.py --radius 10

# Custom location (Madrid)
python3 prefill.py --lat 40.4168 --lon -3.7038 --radius 5

# Dry run to see what would be fetched
python3 prefill.py --dry-run
```

The script respects the cache's 30-second Overpass pacing. A cold 11×11 grid takes
about 60 minutes to fill; subsequent runs are instant cache hits. Run periodically
(e.g., weekly cron) to keep the cache fresh.

**Storage estimate:** ~50-200 KB per zone × 121 zones ≈ 6-24 MB for Irun.

## Baking zones (pre-computed static data)

The `bake.py` script creates pre-computed zone JSON that bypasses Overpass entirely.
Baked zones are served with priority — the client checks baked data before falling
back to live Overpass.

**Important:** Baking pre-computes _OSM feature data_, not scene geometry. The browser
still fetches live elevation from Esri and builds the full scene (terrain heightfields,
building meshes, road geometry) at runtime. Baking eliminates Overpass network latency
and rate-limit delays, but does not skip the client-side geometry generation work.
For large/dense zones, there will still be a brief hitch as the browser constructs
the scene from the baked JSON.

### Baking on chained.world

```sh
# Bake Irun region (default 11×11 grid)
python3 bake.py --output /data/baked

# Use the running cache service for faster bake (optional)
python3 bake.py --output /data/baked --cache-url http://127.0.0.1:8080

# Bake a custom region
python3 bake.py --lat 40.4168 --lon -3.7038 --name "Madrid" --radius 10 --output /data/baked

# Skip zones that already exist (incremental bake)
python3 bake.py --output /data/baked --skip-existing
```

The baked files are placed in:

```
/data/baked/<lat>/<lon>/<x>_<z>.json
```

For example, Irun zone 0_0:

```
/data/baked/43.32969/-1.81961/0_0.json
```

### How baked zones are served

The cache server exposes baked zones at:

```
GET /baked/<lat>/<lon>/<key>
```

For example:

```
GET /baked/43.32969/-1.81961/0_0
```

Returns the baked JSON with `X-Nabla-Cache: BAKED` header, or 404 if not baked.

### Client behavior

The client (in `playground/world-provider.ts`) checks for baked zones before
hitting live Overpass:

1. Check browser Cache Storage (30-day freshness)
2. If CACHE_BASE is set, check `/baked/<lat>/<lon>/<key>`
3. If baked zone found, fetch fresh elevation from Esri (baked zones have stub heights)
4. Fall back to live Overpass if no baked zone

### Baked vs demand-cached

| Aspect      | Prefill (demand cache) | Bake (static)                  |
| ----------- | ---------------------- | ------------------------------ |
| Storage     | Cache hash files       | Named zone JSON                |
| Served from | `/osm` POST            | `/baked/<lat>/<lon>/<key>` GET |
| Elevation   | Included               | Stub (client fetches live)     |
| Priority    | Normal cache           | Checked first                  |
| Use case    | Warm cache faster      | Guaranteed instant hits        |

**Recommendation:** Use both. Bake for core regions (Irun), prefill for extended coverage.

## Tests

```sh
CACHE_DIR=/tmp/nabla-cache-test python3 test_cache.py
```

These tests mock upstream traffic and exercise persistent hits, incomplete data,
stale fallback and rate coordination.

### Safe publication and updates

Start with `--radius 1` (nine zones) through the existing cache. The Docker image
includes the tools: `docker compose exec world-cache python /app/bake.py --radius 1
--output /data/baked --cache-url http://127.0.0.1:8080` (one command).
Only OSM is warmed by prefill; neither tool precomputes mesh geometry or elevation.

Bakes now carry `source.bakeVersion: 1` and `source.tileKey`. The writer validates
and atomically replaces each file, preserving its predecessor on errors. Failed
runs exit nonzero. `--skip-existing` skips only valid files and is for resuming,
**not refreshing**. To refresh, rerun without it; cached upstream OSM still obeys
the service's TTL. Direct upstream baking defaults to 30 seconds between zones.

The private endpoint returns an ETag and supports `If-None-Match`/304. The browser
revalidates before using a warm extract, downloads changed versions and replaces
placeholder elevation with real samples. Offline fallback retains the previous
extract. Revalidation does not extend its original browser-cache lifetime. This
applies on a zone load; resident scene geometry is refreshed when reloaded, not
replaced underneath an active player.

For a public demo, do not expose the private `/osm` proxy. Publish only prepared
bake files under a read-only static route preserving `<lat>/<lon>/<key>` (without
`.json`), configure JSON MIME type, ETag and `Cache-Control: no-cache`, and set
`VITE_WORLD_BAKED_URL` to that route. This separate optional base overrides the
baked route only: elevation and live OSM continue using their configured providers.
`VITE_WORLD_CACHE_URL` remains the full private cache adapter. Keep deployment
addresses, credentials and private service configuration outside the repository.

Validation: `CACHE_DIR=/tmp/nabla-cache-tests python3 -m unittest discover -s
services/world-cache`. Browser/core tests additionally exercise fresh bake,
304 reuse, changed version, schema mismatch, offline fallback and cancellation.
