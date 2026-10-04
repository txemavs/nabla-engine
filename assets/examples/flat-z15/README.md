# Flat planetary vehicle test

Four adjacent WebMercatorQuad Z15 tiles surround longitude 0°, latitude 0°:

| Northwest                    | Northeast                    |
| ---------------------------- | ---------------------------- |
| `15/16383/16383`             | `15/16384/16383`             |
| `15/16383/16384` (southwest) | `15/16384/16384` (southeast) |

The playable area is approximately 2.44 × 2.44 km. The vehicle starts at the
shared corner, `(0°, 0°)`, with all four tiles loaded before simulation begins.
Each vertex is at planetary altitude 0 m. The mesh has no relief, but follows
Earth's curvature in each tile's local frame. Adjacent tiles meet within GLB
float32 precision. The initial ground probe tolerates a 1 mm seam; it never
invents missing ground.

This is original synthetic test geometry, not cartography or a claim of actual
land at Null Island. No remote data, preparation service or map API is needed.
The visible sea sheet is disabled in this example to avoid a coplanar surface;
the world remains planetary with sky, sun and geographic coordinates.

Run `npm run build`, then `npm run dev:game` and open `/?example=flat`.
Use WASD, Space to brake, C to cycle cameras and R to recover the vehicle.
Add `&vehicle=<preset-id>` to use another installed stock preset. The reference
vehicle is currently the car; the white-truck prototype still needs its adapter.

Regenerate with `npm run build:fixture`. The generator uses a fixed timestamp,
32 subdivisions per tile, standard manifest validation and SHA-256 hashes.
All four terrain files and their empty building layers total about 159 KB.

External consumers can import `createFlatTestScene`, `FLAT_TEST_TILES` and
`FLAT_TEST_BASE` from `@nabla/engine/examples/flat-tile` and serve this directory
from the package's assets. No Studio application files are required.
