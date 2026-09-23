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
| Browser Cache Storage  | Normalized extracts (`nabla-world-v3`) and up to eight prepared zones (`nabla-prepared-v5`) | Revalidation, decoding, GPU upload and physics installation   |
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
- Prepared URL: `/prepared/5/43.329690/-1.819606/28.253/0_0.json`.
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
curl -I https://demo.example/prepared/5/43.329690/-1.819606/28.253/0_0.json
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

## Water, railway and place-name migration

The current normalizer writes bake version **3**, and prepared meshes use wire
version **5**. These versions include inland-water relations, visual railways and
OSM city/town/village labels. Older prepared meshes cannot contain these features.
Browser extracts now use `nabla-world-v3`; prepared buffers use `nabla-prepared-v5`.

Deploy the worker before the frontend. Re-run `bake.py` for the desired region;
`--skip-existing` validates the bake version and replaces incompatible files.
Publish baked JSON using the same extensionless copy procedure described above.
Queue the desired zones through `/prepare/zones`: versioned job identities cause
new meshes to be generated without deleting old public files. Keep old versions
until older clients have stopped requesting them, then reclaim disk deliberately.
This is an on-demand migration, not a bulk rebuild of every explored region.

The first visit to a previously uncooked zone can still wait for upstream OSM.
Preparing geometry removes that work from subsequent clients; it does not provide
terrain excavation, surveyed water levels or underground railway rendering.

## Main-thread installation and lean metadata

Streaming registers entity frames immediately, then materializes meshes once per
main render frame. The default soft budget is 4 ms and at most 24 entities per
slice, with terrain and road entities first. Geometry buffers retain their worker
ownership until consumed by a slice. Removed zones cancel their pending meshes;
placeholder frames do not enter rendering batches. GPU uploads consequently occur
across frames instead of all meshes being introduced in one frame. One large
mesh, a batch rebuild or a shader compilation can still exceed that soft budget.
`canvas.dataset.worldInstallPending` exposes the remaining entity count.

Streamed building collision shapes are deferred outside the collision neighborhood
of every actor, including two seconds of velocity look-ahead. Terrain collision is
installed immediately. Deferred buildings are checked at the normal collision
update interval and built before they enter the configured nearby collision range.
This avoids cooking distant city geometry simply because a tile finished loading;
it is not a hard frame budget for nearby physics or a replacement for GPU profiling.

`compactMapTags` retains classification and structural OSM tags in runtime scenes.
Addresses, contact information, descriptions and translated names remain in raw
OSM/baked extracts, rather than being repeated on every prepared scene fragment.
OSM IDs and displayed entity/place names are retained. Existing prepared version-5
files are compacted in the worker before transfer; newly prepared files are compact
on disk as well. The wire format stays compatible. Full metadata lookup in the
inspector is a future consumer of those stored IDs; this change adds no automatic
selection-time network request. Binary prepared geometry remains a separate future
migration: typed buffers already transfer between workers and the main thread,
while public prepared files still contain JSON and base64.

## Browser map cache: shared 100 MB budget

Options → Performance → **Caché de mapas · MB** controls a persistent browser-side
budget of 0 (disabled), 25, 50 or **100 MB**, defaulting to 100. One MB is 1,000,000
bytes. The panel shows retained response-body bytes and entry count; reopening it
refreshes the figures. **Vaciar caché de mapas** removes only cached map responses,
not saved scenes. It retains the selected budget.

Extracts (OSM features plus sampled elevation), prepared zone JSON/buffers and water
vector tiles share one IndexedDB database, `nabla-map-cache-v1`. Replacing an entry
counts only its new size. Reads update recency; writes evict least-recently-used
entries until the combined payload fits. A response larger than the selected budget
is used for the current request but not retained. IndexedDB read/write transactions
serialize changes across terrain and water workers, avoiding independent caches each
spending the entire budget. The old 32/8/96 entry-count caps are removed.

On first use, supported legacy Cache Storage entries are imported within the budget,
then the old map cache stores are removed. Unsupported old map-format namespaces are
removed without importing incompatible data. Concurrent migration uses a Web Lock
where available. Migration is best effort when the browser denies storage/quota;
some entries may be discarded and downloaded again. Unrelated app caches are untouched.

Prepared hits younger than five minutes load without a network round trip. Older
ones revalidate using their ETag. Last-known prepared data and water responses remain
usable if the server/network is unavailable. Existing extract/water normal freshness
periods remain 30 days / 7 days. These rules do not guarantee a cold location is
available offline.

A lower budget trims immediately. Disabling empties the cache and prevents new
retention. On quota failure, the cache makes room in a separate transaction and retries
once; if storage is still unavailable, the caller continues using downloaded data.
The browser can impose a smaller quota or reclaim storage. The 100 MB ceiling counts
response bodies, **not** IndexedDB metadata, HTTP image/asset cache, saved scenes,
resident meshes, GPU memory or server disk. More disk cache does not itself increase
world draw distance or keep more collision bodies active.

This implements the storage-budget part of issue #20. Existing draw/road/collision
quality controls are unchanged; expanding streaming/preparation radii is separate
work, and the issue remains open for that scope.

### Predictive downloads and binary preparation

Streaming now separates the immediate scene from speculative disk downloads:

- The existing 15-second corridor (maximum 4.8 km) and current 3×3 neighborhood remain the installation policy, with three demand requests. Drawing/entity budgets are unchanged.
- A second corridor looks up to 45 seconds ahead (maximum 12 km, 24 requested keys). It follows horizontal velocity, including at flight altitude. Above 12 km altitude, speculative downloads stop.
- One separate worker downloads prepared artifacts for that longer corridor without parsing entities, creating meshes, transferring geometry to the main thread or calling Overpass. Missing prepared zones retry after one minute; successful downloads wait five minutes. Changing origin or leaving the corridor cancels obsolete speculation.
- The server preparation request includes the longer corridor. Server preparation still requires the existing private session; public clients can read already published artifacts but cannot enqueue arbitrary jobs.
- Speculative cache writes cannot evict existing entries, even when workers race. They pause when less than 1 MB is free. Demand loads retain normal LRU eviction. Disabling cache also disables speculative downloads.

Scene installation retains terrain/road/building priority. Creation of placeholder objects now shares the mesh installation budget (4 ms / 24 entities per frame). Streamed road and building colliders are queued near actors; noncritical cooking has a soft 2 ms / four-body allowance per frame. Terrain and immediate safety colliders remain synchronous. A single large mesh, terrain collider, GPU upload, scene graph update or validation can still exceed a frame budget; this is not a hard real-time guarantee.

New prepared jobs write both the version-5 JSON and a `.bin` sidecar at the same path. The client prefers binary and falls back to JSON, then the ordinary map provider. The binary envelope is `NBZ1`, followed by a little-endian 32-bit manifest length, a UTF-8 JSON manifest padded to a four-byte boundary, and geometry buffers. Ranges are aligned, contiguous and bounds-checked; scene version, origin, key and geometry values receive the same validation as JSON. The artifact limit is 64 MiB. Entity descriptions remain JSON so authored geometry and editing semantics are preserved; mesh buffers no longer use base64. Worker-to-main delivery still uses transferable arrays.

To add binary files to existing prepared JSON **without downloading OSM or elevation again**:

```sh
npm ci
npm run build:prepare
# Use the prepared directory mounted by your cache service; adjust the path.
find /data/prepared/5 -type f -name '*.json' -exec \
  node prepare-dist/services/world-cache/convert-prepared.js {} \;
```

Run conversion with the service's filesystem ownership. It preserves JSON and atomically replaces each binary sidecar. Check available disk space first: keeping both formats uses more server storage. The preparation worker's existing output budget now counts both extensions. Rebuild/restart the preparation image to make future jobs produce both files; deploy the client afterward. Keep JSON for older clients and rollback. For a rollback, restore the previous frontend and worker image; existing JSON remains usable.

A local check on one existing zone measured 21.2 MB JSON versus 16.9 MB binary before HTTP compression (about 20% smaller). This is one sample, not a frame-rate or network-compression benchmark. Retained browser data still shares the 100 MB budget.
