# Terrain publication contract

Verified on 2026-10-23 against the public Atlas origin and the current engine consumer.
This document supersedes the earlier claim that this deployment has no `manifest.json`.

## Observed Z15 publication

Base: `https://atlas.chained.world/euskadi/terraform`.

| Cell                | Entry response            | Package named by `z15Package.file` |
| ------------------- | ------------------------- | ---------------------------------- |
| `z/15/16223/11999/` | `manifest.json`, HTTP 200 | `z15-5d9b31c8b7394388.json`        |
| `z/15/16224/11999/` | `manifest.json`, HTTP 200 | `z15-15fd70b76bea6c8a.json`        |

Both entry documents use `format: nabla-planet-tile-v1`, `cellVersion: 4` and
`geometryRevision: native-surfaces-v5`. Their package pointers declare schema
`nabla-z15-package/1`, byte length and SHA-256. Both package downloads matched those
lengths and hashes. A deliberately absent object in the first cell returned 403.
The entry responses had no `Access-Control-Allow-Origin` header.

Exact metadata response bytes and URLs, status codes, timestamps and hashes are in
[`provenance.json`](../test/planet/fixtures/atlas-publication-2026-10-23/provenance.json).
These observations cover two cells at that time, not every published cell or future availability.

## Consumer sequence and compatibility

1. `fetchTileManifest` requests `base/z/z/x/y/manifest.json` (the first `z` is literal).
   `manifestFiles` optionally tries other entry filenames in order; a pinned publication
   uses its exact URL and the existing Z16 revision check instead.
2. The entry is validated by `validatePlanetManifest`. For Z15, `atlas: {}` enables
   following its `z15Package` pointer. A plain engine manifest without that pointer
   remains valid and does not require an Atlas package.
3. The package loader verifies bytes and SHA-256 before validating the package schema
   and cell identity. The adapter checks terrain/building references and cell version
   agreement with the entry.
4. Version 2+ cells select the package's unified `terrain.lidar` ground, even when
   relief is omitted or set to `engine`. Imagery, roads and instances are mapped to
   the standard engine manifest. The captured version 4 cells exercise this behavior.
5. Subsequent geometry/imagery loading is separate. This audit verified metadata and
   adaptation; it did not download every referenced asset or certify rendered output.

No reader or publisher format change is required by these observations. Do not replace
the entry request with a guessed package hash. A raw package is not an engine entry
manifest; changing only `manifestFiles` does not provide schema adaptation or discovery.
Existing plain manifests, Atlas Z15 adaptation, compressed-entry fallback and Z16
publications retain their current contracts.

## Proxy and failure semantics

Browser clients use `/tiles` on the same origin, with Vite/nginx preserving the `z/`
suffix and forwarding to the base above. Build the host with `VITE_NABLA_TILES_URL=/tiles`.
The proxy's identifying User-Agent is not an authorization mechanism.

`PlanetWorld` passes `missingStatuses: [403, 404]` for entry requests. The generic
loader defaults to `[404]`; callers must choose a policy appropriate to their origin.
A missing entry is treated as an unpublished cell. A missing package **referenced by
an existing entry** is a publication error and is not silently converted into a hole.
Hash, size, cell or schema mismatches remain errors. Do not repair a missing Atlas
object by changing authentication or inventing an index endpoint.

## Repeatable verification and future changes

### Optional availability index (publisher contract)

Static clients now request `<base>/index.json` before manifest discovery, through
the same-origin proxy (`/tiles/index.json` for Atlas). The publisher may generate:

```json
{
  "schema": "nabla-tile-availability/1",
  "revision": "2026-10-23-001",
  "complete": true,
  "zooms": {
    "15": [
      [16223, 11999],
      [16224, 11999]
    ]
  }
}
```

- `schema` and `complete: true` are required. `revision` is a nonempty string;
  generate a new revision for every changed snapshot.
- `zooms` maps canonical integer zoom strings (0–30) to arrays of `[x, y]` integer
  pairs, each coordinate in `[0, 2^z)`. XYZ coordinates, not TMS. Duplicates are
  harmless but should be omitted. Unknown extra metadata fields are ignored.
- Each included zoom is exhaustive for this base URL: an omitted cell is absent.
  An empty array means no cells exist at that zoom. Omitted zooms remain unknown
  and use ordinary manifest discovery. Partial snapshots (`complete: false`) and
  any malformed row invalidate the whole index; they must never hide terrain.
- List only fully published cells. Upload assets and packages first, then their
  `z/<z>/<x>/<y>/manifest.json`, and finally replace the complete index in one PUT.
  Serialize concurrent publisher updates (or use conditional writes with retry)
  to avoid losing another publisher's cells. The client never lists S3.
- Before deleting cells, remove them from the index first. Clients may retain
  older snapshots, so keep a retention window for their files. Availability is
  discovery metadata, not a guarantee against later missing objects.
- Serve `Content-Type: application/json`. Gzip is optional; compressed bytes must
  have `Content-Encoding: gzip`, which the browser decodes transparently. The URL
  remains **index.json**, not index.json.gz. Preserve these headers in the proxy.
  Recommended `Cache-Control: no-cache` and an ETag for HTTP revalidation.

The client revalidates at most once per minute while streaming, including when
every candidate is absent. The first request waits up to five seconds. Requests
are coalesced per source within a world; alternate tile bases have separate indices.
A valid index filters cells before batching. Existing manifests and `z15Package`
resolution are unchanged. Explicit live Z16 publications override an older index.
On first load and when a cell newly appears, its remembered HTTP miss is cleared.
Index exclusions are not persisted as fictional 403 responses.

Missing, malformed, timed-out or failed indices preserve the last valid snapshot
in this session. If none exists, the client retains the existing 403/404 handling
and negative cache. There is no persisted index across reloads. A missing index
can therefore still produce one failed **index** request per minute; it does not
disable terrain. `PlanetSourceOptions.availabilityIndex: false` disables discovery
for hosts that deliberately do not provide the index. No publisher implementation
or upload is included in this client change.

```sh
npx vitest run test/planet/atlas-publication-contract.test.ts test/planet/atlas-z15.test.ts test/planet/atlas-z16.test.ts test/planet/atlas-package-loader.test.ts test/planet/static-tiles.test.ts test/render/static-tiles-manifest-files.test.ts
```

The tests run offline. To refresh evidence, GET each entry above, follow its exact
`z15Package.file`, verify byte length and SHA-256, and save the original response
bytes with updated provenance in a new dated fixture directory. Do not pretty-print
package fixtures: their original bytes are part of the integrity contract. Compare
old and new fixtures through the same consumer before changing production defaults.

If a future publisher removes stable entries, first agree a discovery API or registry
and an explicit adapter with the publisher. Roll that out alongside the existing
entries, verify parity, then schedule removal. There is no evidence that this migration
is currently necessary.
