# 10. Geographic terrain and streaming

[Manual contents](README.md)

`PlanetWorld` manages the visible geographic world around the player. It selects
cells, requests data through a provider, prepares geometry and imagery, installs
presentation, and retires distant content. Physics collision streaming has its own
installation work and budgets. Rendering distance, photo detail, and collision
distance are related settings, not aliases for one radius.

## Verified publication contract

On 2026-10-23, live GET requests to both example cells returned HTTP 200 for
`manifest.json`, with a verified `z15Package` pointer to a hash-named package:

```text
https://atlas.chained.world/euskadi/terraform/
  z/15/<x>/<y>/manifest.json       # nabla-planet-tile-v1 entry
  z/15/<x>/<y>/z15-<hash>.json     # nabla-z15-package/1 package
  z/15/<x>/<y>/<files named by that package>
```

The earlier operational claim that no `manifest.json` existed was stale. The
current reader accepts both captured publications, verifies package bytes/hash
and adapts their version 4 cells, including unified LiDAR ground for version 2+.
See [publication evidence, limits and refresh procedure](../terrain-publication-contract.md).

Keep the `z/` prefix and follow the entry's exact package pointer; do not guess
hashes or list the bucket. A raw Z15 package is not an entry manifest. The
`manifestFiles` option changes filenames, not schema or discovery behavior.
Plain engine manifests and the separate Z16 publication path remain supported.
This check covers metadata loading and adaptation, not a visual certification of
all published terrain assets.

## Proxy and errors

The Atlas origin sends no CORS headers according to `AGENTS.md`. Browser requests
must use the same-origin `/tiles` proxy. Vite removes `/tiles` and forwards to the
configured upstream; production needs the equivalent proxy. Build the reference
game with `VITE_NABLA_TILES_URL=/tiles` when that is the deployed route.

The generic static provider defaults to `[404]` as missing statuses and accepts
an explicit `missingStatuses` list. Account for Atlas's 403 behavior at the provider
integration. Do not globally reinterpret every service's 403 as absence.
Separate an absent object from network/CORS failure, timeout, invalid JSON, schema
mismatch, and size/hash verification failure.

## Streaming lifecycle

Startup modes distinguish usable spawn ground, nearby startup coverage, and an
explicit finite area. After reveal, the normal streaming radius expands. Asset
download and decode can run in workers, but scene installation, GPU upload, and
shader compilation still have costs on other execution paths.

The current engine cell-version contract accepts versions 1–4. Later unified
ground versions incorporate roads into the terrain, so separately overlaying old
road surfaces can produce duplicate asphalt. Schema identifiers, cell versions,
geometry revisions, zoom levels, and package hashes answer different compatibility
questions. Validate each rather than comparing only a package version string.

For development independent of Atlas, use the flat box scene from chapter 3.
The bundled flat Z15 resources are a separate test fixture; do not confuse them
with a claim that a real geographic cell is published.

## Source of truth

- [Operational publication instructions](../../AGENTS.md).
- [Static loader](../../src/render/planet/static-tiles.ts).
- [Atlas Z15 adapter](../../src/planet/atlas-z15.ts) and [cell contract](../../src/planet/contract.ts).
- [World streaming](../../src/render/planet/world.ts).
- [Reference terrain entry](../../game/terrain-main.ts).
- [Development proxy](../../vite.game.config.ts).
