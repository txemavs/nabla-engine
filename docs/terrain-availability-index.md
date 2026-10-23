# Optional availability index (publisher contract)

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
