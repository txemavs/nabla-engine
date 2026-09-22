# World cache and server preparation runbook

This records the deployed design checked on **22 September 2026**. It uses no
production hostname or credentials. `https://demo.example` is a placeholder;
server paths below describe the current layout and can be changed for another
installation. The public repository contains the service, not its private deployment
configuration, owner token, SSH keys, database or downloaded map data.

## How we got here

1. Browser-only OSM requests made the first visit slow and vulnerable to Overpass
   throttling. A private disk cache added reuse, request coordination and stale fallback.
2. `prefill.py` warmed those same OSM queries before a player arrived.
3. `bake.py` published validated, normalized OSM extracts as static JSON. Visitors
   could reuse these without access to a private query proxy.
4. This still left terrain sampling and mesh generation in the browser. The
   preparation worker now samples elevation and builds geometry on the server.
5. An authenticated, persistent queue lets exploration request preparation ahead
   of the player. Published results are reusable by visitors without queue access.
6. Geometry fixes, including roof generation and vertex colors, required versioned
   output. The current prepared format is **4**; baked OSM format remains **1**.

This is an incremental cache of explored regions, **not an offline copy of Spain**.
Ten GiB is a configured working budget, not a national coverage estimate.

## The layers and what each saves

| Layer                  | Stored content                                                                              | What still happens                                            |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Browser Cache Storage  | Normalized extracts (`nabla-world-v2`) and up to eight prepared zones (`nabla-prepared-v4`) | Revalidation, decoding, GPU upload and physics installation   |
| Private demand cache   | Exact OSM responses and Esri elevation tile bytes, hashed `.bin` files                      | Feature extraction and geometry unless prepared output exists |
| Static bake            | OSM features, origin and tile identity; placeholder elevation                               | Real elevation sampling and geometry generation               |
| Static prepared output | Scene entities, sampled terrain and base64 mesh buffers, including colors                   | Buffer decoding, renderer objects, GPU upload and physics     |
| SQLite queue           | Durable job identities, states, priorities, retries and timestamps                          | One worker processes pending jobs                             |

On zone loading, the browser first tries compatible prepared output, revalidating
its cached copy with ETags. If unavailable or incompatible it uses the ordinary
extract path: browser extract cache, revalidated static bake, then OSM and elevation
from the configured providers. Offline/error fallback can reuse previous data;
there is no guarantee for a region that has never been downloaded.

The current public build uses `/prepared`, `/baked` and `/prepare`. It does **not**
expose the private `/osm` or `/elevation` adapter: missing public artifacts may still
cause direct browser provider requests. The server worker itself uses the private
cache for OSM and elevation. A private installation can additionally configure
`VITE_WORLD_CACHE_URL` behind an authenticated proxy or development SSH tunnel.

Satellite/street imagery, distant horizon and OpenFreeMap water follow separate
pipelines. This service does not bulk-cache all those providers. User-authored
objects, portals and scene edits are not written into public prepared map files.

## Current server layout

| Host path                              | Purpose                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/home/nabla/world-cache/compose.yaml` | Private worker-enabled Compose deployment                                                               |
| `/home/nabla/world-cache/.prepare.env` | Owner token; keep private and back up securely                                                          |
| `/home/nabla/world-cache/data/`        | Mounted as `/data`: upstream `.bin` cache, `prepare.sqlite`, intermediate input, optional private bakes |
| `/home/nabla/releases/world-prepare/`  | Source/build context for `Dockerfile.prepare`                                                           |
| `/srv/nabla/www/baked/`                | Published normalized extracts, with extensionless tile filenames                                        |
| `/srv/nabla/www/prepared/`             | Mounted as `/publish`: prepared geometry, partitioned by format version                                 |
| `/srv/nabla/www/`                      | Frontend and static artifacts; preserve sibling apps and inspection assets                              |
| `/home/nabla/stack/nginx-site.conf`    | Static server and restricted preparation proxy routes                                                   |

The `world-cache` service maps host **127.0.0.1:8787** to container **8080**.
The static web container mounts the web root read-only and reaches `world-cache`
on a private Docker network. The outer reverse proxy terminates HTTPS.

The deployed worker runs as UID/GID **1001:1001**, with a read-only container
filesystem, writable bind mounts, a 64 MiB temporary filesystem, one CPU and 1 GiB
memory. Adjust ownership for a different host rather than assuming these IDs.
The repository's portable template is
[`compose.prepare.yaml`](../services/world-cache/compose.prepare.yaml).

Configured budgets are **5 GiB upstream cache + 5 GiB prepared output**. Each
uses oldest-file eviction, not permanent archival. Static bakes and the rest of
the web root are outside these budgets. Old prepared version directories also
consume the prepared budget until removed or evicted. Budgets can temporarily
overshoot during writes; keep free disk space beyond the nominal allocation.

At inspection, upstream data occupied about **143 MiB**, published bakes **3.2 MiB**,
and all prepared versions **531 MiB**. Versions 1–4 remained on disk, with ten
version-4 zone files. Queue history contained 65 ready jobs and one failed job,
with no pending/running work. These are a dated snapshot, not a coverage promise:
ready history includes old versions and may outlive evicted files.

## Coordinates, identity and freshness

- A zone is a **1.2 km square**, keyed `x_z` relative to an origin. The OSM query
  includes a margin. A radius-5 grid has 11×11 zones, roughly 13.2 km per side;
  radius 10 has 21×21 zones, roughly 25.2 km per side.
- The Irún Ventas origin used by the tools is latitude `43.32969`, longitude
  `-1.819606`, altitude `28.253`. Reuse the same origin as the browser. Changing
  origins changes cache identities, even for overlapping geographical coverage.
- Private baked path: `/data/baked/43.32969/-1.81961/0_0.json` (five decimals).
  Public URL: `/baked/43.32969/-1.81961/0_0` (no `.json`).
- Prepared URL: `/prepared/4/43.329690/-1.819606/28.253/0_0.json`.
  Prepared identities include origin altitude and format version.
- Upstream cache TTL is **30 days**. Failed refreshes can serve stale data;
  failed or incomplete new OSM responses are not saved.
- Cold OSM queries are serialized, spaced 30 seconds apart, with a 60-second
  cooldown after failures. Hits bypass this upstream queue.
- Ready preparation jobs become refreshable after 24 hours **when requested
  again**. There is no automatic nightly or weekly refresh scheduler installed
  by this feature. Refreshing geometry does not bypass the upstream 30-day TTL.
- Static bakes have no automatic regeneration. `--skip-existing` resumes missing
  work; it does **not** refresh valid existing extracts.
- Loaded scene geometry is not swapped under an active player when a file changes.
  Reload or revisit the zone to consume updated output.

## Daily checks

On the server:

```sh
cd /home/nabla/world-cache
docker compose ps
curl --fail http://127.0.0.1:8787/health
docker compose logs --tail=100 world-cache
du -sh data /srv/nabla/www/baked /srv/nabla/www/prepared
```

Inspect queue counts without printing coordinates or secrets:

```sh
docker compose exec -T world-cache python3 -c '
import sqlite3
with sqlite3.connect("/data/prepare.sqlite") as db:
    print(db.execute("SELECT state, count(*) FROM jobs GROUP BY state").fetchall())
'
```

Public artifact checks (a 404 simply means this particular zone is not published):

```sh
curl -I https://demo.example/baked/43.32969/-1.81961/0_0
curl -I https://demo.example/prepared/4/43.329690/-1.819606/28.253/0_0.json
```

Expect JSON, an ETag, `Cache-Control: no-cache` and `X-Nabla-Cache: BAKED` or
`PREPARED`. Repeat with `If-None-Match: <returned-etag>` to verify 304. `no-cache`
means revalidate before reuse, not “never store”. Private query responses instead
report `HIT`, `MISS` or `STALE`.

## Warm OSM or rebuild static bakes

Run inside the deployed container so paths and port numbers are unambiguous:

```sh
cd /home/nabla/world-cache
# List nine zones without downloading.
docker compose exec -T world-cache python3 /app/prefill.py --radius 1 --dry-run
# Warm OSM only, through the coordinated cache.
docker compose exec -T world-cache python3 /app/prefill.py \
  --radius 1 --cache-url http://127.0.0.1:8080
# Normalize and write those zones; retain old valid files if a request fails.
docker compose exec -T world-cache python3 /app/bake.py \
  --radius 1 --output /data/baked --cache-url http://127.0.0.1:8080
```

Use `--lat`, `--lon`, `--alt` and `--radius` for another region. Start small; a
cold radius-5 grid can take an hour or longer. Neither tool precomputes elevation
or meshes. To resume a bake add `--skip-existing`; to rebuild omit it. If you need
new OSM before the TTL expires, invalidate only the relevant upstream cache entry
(the filename is SHA-256 of the request cache key; see `server.cached`). Do not
wipe the whole cache merely to correct a geometry algorithm.

Private bake output is **not automatically copied** into the public web directory.
Publish extensionless copies after a successful bake. For example, one region:

```sh
python3 - <<'PY'
from pathlib import Path
import os
source = Path('/home/nabla/world-cache/data/baked/43.32969/-1.81961')
target = Path('/srv/nabla/www/baked/43.32969/-1.81961')
target.mkdir(parents=True, exist_ok=True)
for path in source.glob('*.json'):
    destination = target / path.stem
    temporary = destination.with_suffix('.tmp')
    temporary.write_bytes(path.read_bytes())
    os.replace(temporary, destination)
PY
```

This preserves the previous published file until its replacement is complete.
The private HTTP bake endpoint validates its files and supports ETags; public
static serving relies on publishing validated outputs from `bake.py`.

## Automatically prepare places visited by the ship

The owner activates a session using a private `#prepare=<token>` link on the demo.
The frontend removes the fragment, exchanges the token at `/prepare/session`,
and receives a 30-day HttpOnly, Secure, SameSite=Strict cookie scoped to `/prepare`.
Never commit or share that activation link, and never put `PREPARE_TOKEN` in a
`VITE_` variable. Token rotation invalidates existing sessions after service restart.

While exploring, the planner requests the current zone and needed neighbors/ahead
corridor. Above the streaming altitude threshold it requests the ground footprint.
Accepted work stays in the queue after the ship moves away or the tab closes.
Unauthenticated visitors can read published artifacts but cannot enqueue jobs.

The API accepts up to 24 keys per request and at most 256 pending/running jobs.
Jobs are deduplicated and prioritized; one worker retries failures up to three
attempts with backoff. Interrupted jobs recover after restart. Evicted ready
artifacts can be queued again. A fast flight can outrun preparation; instant
coverage everywhere is not guaranteed.

To request a specific zone from the browser console on your own demo **after
activating the owner session**:

```js
await fetch('/prepare/zones', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    origin: { latitude: 43.32969, longitude: -1.819606, altitude: 28.253 },
    keys: ['0_0', '1_0'],
  }),
}).then((r) => r.json())
await fetch('/prepare/status').then((r) => r.json())
```

The worker regenerates its normalized input through the demand cache; it does not
read the public bake directory. It decodes Esri elevation, samples a 121×121 lattice,
runs the same scene/geometry builders as the client, and atomically publishes output.
Each Node job has a 512 MiB heap, 180-second timeout and 48 MiB output limit.

## Force one prepared zone to recalculate

Normally revisit after the refresh interval. For an immediate geometry-only rebuild,
keep the upstream cache and the old published artifact. Stop the worker, back up the
database, mark the exact existing job queued, then restart. Example for Irún `0_0`:

```sh
cd /home/nabla/world-cache
docker compose stop world-cache
cp data/prepare.sqlite "data/prepare.sqlite.backup-$(date +%Y%m%d-%H%M%S)"
python3 - <<'PY'
import sqlite3
path = '4/43.329690/-1.819606/28.253/0_0.json'
with sqlite3.connect('data/prepare.sqlite') as db:
    result = db.execute(
        "UPDATE jobs SET state='queued', attempts=0, next=0, priority=0, updated=0 WHERE path=?",
        (path,),
    )
    print('Requeued jobs:', result.rowcount)
PY
docker compose up -d
```

A count of zero means no job with that identity exists: enqueue through the owner
API instead. Always restart the service even if the maintenance command fails.
Keep a previous artifact until the replacement succeeds; reload the scene afterward.
A failed job is otherwise eligible for a new request after its cooldown (one hour).

## Deploy changes and invalidate incompatible geometry

Copy the intended source revision into the configured build context, then:

```sh
cd /home/nabla/world-cache
docker compose build world-cache
docker compose up -d world-cache
curl --fail http://127.0.0.1:8787/health
```

Bind-mounted cache, queue and prepared files survive image replacement. A frontend
release alone does not update the worker's bundled geometry code. Keep both builds
on compatible revisions. For an incompatible geometry change update together:

- `VERSION` in `services/world-cache/queue_store.py`;
- `PREPARED_VERSION` and browser cache namespace in `playground/prepared-world.ts`;
- the emitted wire version in `services/world-cache/prepare.ts`.

Build the frontend with the existing public routes:

```sh
VITE_WORLD_BAKED_URL=/baked \
VITE_WORLD_PREPARED_URL=/prepared \
VITE_WORLD_PREPARE_API=/prepare npm run build:demo
```

Upload assets first and replace `index.html` last. Preserve `baked/`, `prepared/`,
other applications, inspection files and previous hashed assets for rollback.
New format directories fill on demand; do not rename old files into a new version.
Keep old versions during rollback testing, then remove only explicitly retired
version directories if space is needed.

The static proxy serves only files for `/baked/` and `/prepared/` (missing files
must be 404, not the app HTML). It proxies only `/prepare/session`, `/prepare/zones`
and `/prepare/status`, limits request bodies to 8 KiB, and suppresses access logs
for those authentication/queue routes. The private query service is not itself a
public authentication boundary. Do not expose port 8787 or publish the private
Compose/env files. OSM attribution and provider terms still apply to cached data.

## Recovery, limits and next work

Back up private configuration and owner credentials securely. Back up SQLite while
the worker is stopped (or with SQLite's backup API); copy artifacts independently,
since published files are atomically replaced. Map caches can be rebuilt, but
losing them means cold provider requests again. Authored scenes require their own
backup; they are outside this system.

If exploration stalls, distinguish provider/network misses from main-thread work.
Check 401 (owner session), 404 (not prepared), 429/provider cooldown, queue failures,
disk space, and matching origin/version. A ready row alone does not prove a usable
artifact is present. The browser's fallback keeps exploration possible but can
still be slow in a dense cold region.

Remaining improvements include canonical global tile identities across origins,
better queue/error visibility, measured coverage/storage planning, and further
browser decoding/physics/GPU-upload budgeting. Prepared JSON is not a zero-cost
scene load, and this service is not yet a global vector-tile distribution system.
For regional bulk coverage, plan an extract-based pipeline instead of assuming
public Overpass will sustain unrestricted bulk downloading.

Implementation and tests: [service README](../services/world-cache/README.md),
[streaming investigation](streaming-investigation.md), and
[performance guide](performance.md). Useful checks after code changes:

```sh
npm run build:prepare
CACHE_DIR=/tmp/nabla-cache-tests python3 -m unittest discover -s services/world-cache
```

Also verify a real cold/warm zone and HTTP 200/304 behavior before publishing a
worker change; unit checks do not measure browser frame pacing.
