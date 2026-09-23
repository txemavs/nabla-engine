# Editable tile GLB pilot

This is an isolated visual experiment at `/tile-lab.html`, not a replacement for
Studio's world streaming or its project format. The pilot uses the existing
prepared Irún Ventas/Katea tile `0_0`, because no prepared Zamora artifacts were
available on the deployment when it was built.

## Reproduce the export

```sh
npm run build:prepare
node prepare-dist/services/world-cache/export-tile-glb.js /path/to/prepared.bin /path/to/output
```

The CLI reads an existing v5 prepared binary, without requesting OSM or elevation.
It writes `tile.glb`, an unchanged `source.bin` for comparison, and `report.json`.
Do not point the output directory at the production prepared cache. The pilot
artifacts are served separately under `/experiments/tile-glb/irun/`.

The same mesh-building function is used by the exporter and the prepared-format
viewer. No building simplification, new compression codec, or LOD is introduced
in this comparison. The GLB is self-contained, with one named mesh per entity,
organized into Terrain, Roads, Surfaces and Buildings. Source IDs, entity IDs,
labels, tile key, geographic origin and local offset are stored in glTF extras.
Coordinates are tile-local metres, +Y up and -Z north. No gameplay objects,
sprite trees, external models or collision shapes are included.

## Blender workflow

1. Download the GLB from the pilot page and import it into Blender.
2. Keep its scale, tile placement and object names when comparing with the map.
3. Edit geometry or apply Boolean cuts. Assign materials as desired. These source
   meshes have vertex colors but no generated UV layout; unwrap surfaces in
   Blender when adding image textures.
4. Export a self-contained GLB with its images embedded. Retain custom properties
   where the editor supports doing so, to preserve Nabla extras.
5. Open the edited file using the pilot's local file input. It is previewed in the
   browser, not uploaded or saved over the world.

This pilot does not automatically install edited tiles into Studio. A subsequent
import feature must validate bounds and coordinates, retain an immutable base and
an authored override, rebuild collision geometry, resolve entity identity and
handle tile-edge changes. A visible hole alone is not yet a driveable hole in the
physics world. Road/land depth bias is a Nabla rendering convention restored from
extras in this viewer; it is not a portable glTF material property.

## Measurements

The exported tile has 1,085 meshes and 176,987 triangles.

| Measure                        | Prepared binary |        GLB |
| ------------------------------ | --------------: | ---------: |
| File bytes                     |      15,644,448 | 13,434,420 |
| gzip bytes, same local encoder |       5,023,934 |  4,209,236 |

A single local headless Chromium run measured roughly 39 ms to decode/build the
prepared scene and 63 ms for GLB. First-presentation measurements were about
241/252 ms respectively. These are illustrative observations, not a reliable
performance ranking: network cache, warm shaders and software rendering affect
results. The page reports fresh measurements on the user's device for each load.

Both formats use the same camera and lighting and expose layer visibility. The
viewer intentionally retains individually editable meshes and does not apply
Studio's runtime draw-call batching. It therefore cannot establish that switching
the production renderer to GLB would increase FPS. Index compression, spatial
batches, multiple LODs are later experiments. Separate terrain/building files are now available below.

## Validation

- The GLB loads through Three.js GLTFLoader and reopens through the local-file path.
- Both pilot formats report the same visible triangle count in the comparison view.
- The automated round-trip checks a non-origin tile's bounds, local offset, entity
  identity, vertex colors and triangle vertices after export and import.
- The combined pilot remains available; the optional split-layer runtime path is described below.

Coplanar transport surfaces use distinct depth priorities: paths, roads, ballast,
then rails, above land cover. The viewer restores these from glTF extras (including
older pilot exports); no collision heights or bridge geometry are changed.

## Split-layer runtime experiment

The exporter now also writes `terrain.glb`, `buildings-osm.glb`, and
`manifest.json`. Terrain includes elevation, land cover, water, roads and railways.
Buildings are separate meshes with their original entity IDs. Authored scene
objects remain outside both generated files and retain the existing scene-edit
and map override lifecycle.

Identity is `nabla-local-v1/1200/<latitude>/<longitude>/<altitude>/<x>_<z>`.
Coordinates use the same 6/6/3 decimal precision as the prepared cache. Each cell
is 1,200 metres on each side (1.44 square kilometres). This is explicitly a local
anchored grid, not a globally unique ground partition: two different origins can
cover overlapping ground. A bare `0_0` is never a global identity. The prefix is
versioned so a future global grid can coexist without silently changing saves.
OGC 3D Tiles is the target interoperability model for geographic bounds,
transforms, multiple contents and LOD; these manifests do not claim conformance.

Place the three files beside a prepared tile in `<key>.glb-tile/`, e.g.
`/prepared/5/43.329690/-1.819606/28.253/0_0.glb-tile/`. Publish the manifest
last. SHA-256 hashes tie its entity metadata to exact layer revisions; mixed
revisions fall back safely. The map worker tries this manifest first and uses the
existing binary/JSON/provider chain when absent or invalid. Destination-only
portal queries retain the original provider path.

This experiment reads GLB geometry in the worker and hands its vertex buffers to
the existing renderer. It retains runtime batching, entity selection, source
metadata and physics instead of adding a duplicate GLB scene. It does **not**
replace runtime materials with arbitrary GLB materials or support publishing
edited geometry with stale physics. GLB transforms, textures and collision edits
need a separate authored-asset import contract; the existing tile-lab import is
still a visual preview only. Both generated layers are currently fetched before
a tile is installed; independent deferred building installation is future work.
HTTP caching applies to GLBs; the existing budgeted prepared-file disk cache is
unchanged. This is an A/B transport experiment, not a promised FPS improvement:
manifest overhead and GLB parsing must be counted along with geometry bytes.
