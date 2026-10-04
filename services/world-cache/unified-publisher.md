# Unified planetary publisher

The canonical generator lives in `nabla-engine/services/world-cache` and builds
against the same geometry sources used by Studio. `compose.planet.yaml` owns its
single `world-cache` service; `compose.dev.yaml` includes it. The Compose project
remains `nabla-development` so both launch commands address the same container.

- `http://127.0.0.1:8080`: Studio; `/prepare`, `/prepared` and `/world-cache` proxy to the publisher.
- `http://127.0.0.1:8787`: atlas status, `/map`, `/map/3d`, and the publisher API.
- `planet/prepare-planet.ts`: canonical TypeScript GLB publisher, roof imagery and photo pyramid.
- `world/`: atlas HTTP support, OSM extraction, durable queue, previews and optional archive, imported from Nabla World including its local changes on 2026-09-28.
- `server.py`: the single HTTP entry point. `cache/server.py` and old Python helpers remain legacy code for existing tests/tools; no supported Compose entry point runs them.

The old Nabla World checkout is retained as a historical source. Its Compose file
now includes this publisher and requires the sibling `nabla-engine` checkout.
Do not implement new tile generation in that older TypeScript tree.

## Run

From the engine checkout:

```sh
docker compose -f compose.dev.yaml up -d --build
```

Publisher alone (the same service and volumes):

```sh
docker compose -f compose.planet.yaml up -d --build
```

All older `services/world-cache/compose*.yaml` entry points redirect here.
The obsolete `nabla-world-atlas-1` was stopped, saved as Docker image
`nabla-world-atlas:backup-20260928`, and removed so it cannot reclaim port 8787. Do not run the old generator independently or use `down -v` for cleanup.

## Data and migration

Active named volumes are `nabla-planet_prepared`, `nabla-planet_cache` and
`nabla-planet_secrets`. The originals `nabla-world_*` and `nabla-development_*`
were retained. Both published trees were copied into an initially empty target.
For overlapping cells a complete engine revision wins; otherwise a complete World
revision is used. Each chosen GLB was verified against its declared size and SHA-256.
Other files and older revisions are retained in the copy. Queued jobs are not replayed;
the queue adopts existing current manifests when requested. Old geometry remains
readable and is refreshed on demand by the current generator.

On the migration host, code archives (including Git state and uncommitted edits),
image IDs and the copy report live in `/home/txema/backups/nabla-generator-20260928`.
The report records 1,087 complete cells: 709 engine cells and 378 additional World
cells, with 176 overlaps. Published files occupy about 10.73 GB. The active retention
budget is 16 GiB, above the merged initial store; the original volumes are untouched.

Photos use the engine's `photos/z/...jpg` when present and the atlas `preview.jpg`
as fallback. New publications create both. Atlas reads do not recolour GLBs or
rewrite manifests. Startup photo backfill is opt-in with `ATLAS_BACKFILL_PHOTOS=1`,
so opening the service does not launch a full-map conversion. S3 remains optional
and is disabled without explicit archive configuration; no cloud credentials were migrated.

The subsequent [performance laboratory](../../docs/architecture/performance-lab.md) adds offline Z14/Z13
mesh composition and simplification. Photo composition remains a separate pipeline.

## Verification

```sh
npm run build:prepare
npx vitest run services/world-cache/planet/planet-generator.test.ts services/world-cache/planet/compose-photo.test.ts
docker run --rm --network none -e CACHE_DIR=/tmp/test-cache \
  -v "$PWD/services/world-cache/atlas_tests:/app/atlas_tests:ro" \
  nabla-development-world-cache python3 -m unittest discover -s atlas_tests -t .
```

The Docker image supplies Node 22, Python and Pillow. Host tests require those dependencies.
