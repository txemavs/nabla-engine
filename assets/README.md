# Asset provenance

Bundled artwork is kept separate from engine code and served by the reference
host. Do not regenerate or recolor original source files to adjust presentation.

| Files                            | Source                                                                                                                 | Use                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `brand/source.svg`               | [txemavs/nabla-hacs](https://github.com/txemavs/nabla-hacs/blob/main/custom_components/nabla_control/brand/source.svg) | Official metallic blue hollow Nabla mark; app header, favicon and README |
| `studio/cars/a3/a3.cabrio.glb`   | This repository, commit `6a22576`                                                                                      | Original body and interior                                               |
| `studio/cars/a3/a3.wheel.glb`    | This repository, commit `6a22576`                                                                                      | Four wheel instances                                                     |
| `studio/cars/a3/a3.steering.glb` | This repository, commit `6a22576`                                                                                      | Steering wheel                                                           |
| `world/ship.container.5x10.glb`  | This repository, commit `6a22576`                                                                                      | Carrier, cabin, garage and ramp                                          |
| `geography/agency-ground.jpg`    | Agency UI, commit `89b0907`, `src/assets/stage/ground.jpg`                                                             | Authored road/ground image                                               |
| `geography/earth.jpg`            | Agency UI, commit `89b0907`, `src/assets/stage/earth.jpg`                                                              | Local globe texture                                                      |

Vehicle files were recovered from branch
`cursor/drive-playground-boxcar-ship5x10-7b21` without changing their bytes.
Geographic images were copied unchanged from the local Agency source checkout.
The logo was retrieved unchanged from the user-specified source, revision
`f7856aa7709e1507c8905a5db4541fd88746ebbb`. Its Git blob is
`a106b37b4216c68fa25b107a459952ecbe6c822f`, matching the upstream file.

External satellite tiles come from Esri World Imagery; street tiles come from
CARTO/© OpenStreetMap. They are downloaded at runtime, not bundled. Attribution
links remain visible in the viewport. Refer to those providers for their data
terms. The repository's MIT code license does not transfer third-party trademark
or imagery rights.

## Stargate frame

`world/portal.frame.glb` is an unchanged copy of Agency UI's
`src/assets/stage/marco-garaje.glb` at revision
`89b090785f77efdd825c8fab69055a2f9106888c`. Its mesh accessor bounds are
X ±1.718034029 m, Y 0–2.200000048 m, Z ±0.039999999 m. The view uses an explicit
import scale to match the aperture and frame bars; this does not scale travellers.
The source artwork remains separate from generated collision boxes.

## Monitor avatar

`playground/avatar.ts` adapts the five procedural CRT parts from Agency UI's
`src/stage/gl/crtMesh.ts`, revision `89b090785f77efdd825c8fab69055a2f9106888c`.
Housing, bezel, screen and two knobs retain their original proportions and RGB
colors. The screen faces forward (−Z), matching Agency's original orientation.
The reference host uses a 0.825 exploration scale and adds
hover, travel banking and braking recovery. These are visual effects; the shared
walking collider remains available; the playground now selects the compact hover
controller described in `docs/controls.md`.

## Carrier-mounted frames

The carrier mouths reuse `Frame_Proa` and `Frame_Popa` in the existing
`ship.container.5x10.glb`. Accessor bounds are X ±2.5 m, Y 0.15–3.35 m,
with Z −5.102…−5.002 m and +5.002…+5.102 m respectively. Apertures are
4.71 × 2.91 m centred at Y 1.75 m (0.55 m above the carrier COM), Z ±5.05 m.
Their normals point into the carrier. No duplicate frame mesh is loaded for a
hosted mouth. Console housings and buttons are procedural host presentation.

## Billboard sprites

`sprites/tree.png` is original generated artwork created for this repository with
OpenAI's built-in `image_gen.imagegen` tool on 2026-09-21, saved without subsequent
image editing. Final prompt:

> Use case: stylized-concept. Asset type: transparent PNG billboard sprite for a 3D driving game. Create a single complete leafy Mediterranean street tree, upright front view, straight brown trunk and rounded irregular green canopy, softly shaded readable realistic game art. Entire tree visible with small transparent margins, trunk foot near bottom centre, square canvas. Genuine transparent alpha background including gaps between leaves. No ground, no backdrop, no shadow on ground, no text, no checkerboard painted into the image. This is a reusable distant tree sprite.

`sprites/target.png` is an original procedural bullseye icon with transparent
background, blue/white rings, orange centre and a grey stand. It was generated
from geometric shapes for the gallery, without an external image source.

## HK Compact 9mm

`studio/weapons/hk-compact/hk-compact.body.glb` and
`studio/weapons/hk-compact/hk-compact.slide.glb` were supplied by the user from
`A:\Descargas\hk_usp_compact_9` on 2026-09-21 and copied without modification.
They now sit next to `hk-compact.json`. The previous paths were
`weapons/hk_usp_compact_9mm.glb` and `weapons/hk_usp_compact_9mm_c.glb`.
Their shared authored coordinates are treated as millimetres, with a common
0.001 presentation scale. Original node transforms, alignment and materials are
preserved. A shared view offset places the barrel near the first-person anchor;
the slide root receives a temporary local Z offset during the visual shot cycle.
This animation does not change hit detection or simulate a real mechanism.

SHA-256:

- Body: `c271058012e43c69de7d827e391b6997b82310425a40b9ce3b1e1c95519e19fc`
- Slide: `4cd2e44690f32c96bd22e5e025e4a9f5f1e998022b2c23025017cd73eeb8eae0`

The existing procedural sidearm remains a loading/error fallback. Load failure is
exposed by `data-weapon="fallback"` on the reticle and its explanatory tooltip.

## Videotiro trees

`sprites/tree-1.png` through `tree-5.png` are unchanged copies of the user's
`D:\Virtual\dev\videotiro\Media\Fondos\Decorado\Vegetal\Arbol 1.png` through
`Arbol 5.png`, supplied on 2026-09-21. All five are 256 × 256 PNGs. The reference
circuit distributes twenty instances with varied heights and preserves each
image's square canvas proportions. The gallery uses the same five variants.
Sizing and placement are scene data; no artwork was regenerated or edited.
The earlier generated `tree.png` remains available for existing custom content.

The reference scene now mixes the generated tree with the five Videotiro trees.
Videotiro foliage uses 0.35 saturation in the material shader; source PNG bytes
remain unchanged. Optional flat black shadow copies reuse each tree's texture.
The CRT monitor is rendered at half its previous scale: 0.825 while exploring
and 0.5 at the driving seat. Physics and eye anchors are unchanged.

The original `portal.frame.glb` has inward-facing triangles on all four bars.
The asset loader repairs winding on an in-memory geometry copy and recomputes
flat face normals once per cached model. The original GLB remains byte-identical;
portal poses, apertures, collision geometry and traversal directions are unchanged.

## Irun Ventas real-world fixture

`geography/irun-ventas.json` contains a bounded OSM-derived feature database and a
sampled elevation grid. Its `source` object records retrieval time and endpoints.
OSM features are © OpenStreetMap contributors, available under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/), with
[OSM attribution and licensing](https://www.openstreetmap.org/copyright).
Elevations are derived from Esri WorldElevation3D/Terrain3D, level 12, column 2027,
rows 1499 and 1500; © Esri and its data providers. Elevation licensing remains
separate from OSM and the engine's MIT license. The on-screen Esri attribution link
remains available. This fixture contains no Google imagery or Streets GL artwork.

The preparation scripts and exact bounded requests are documented in
[Real-world driving](../docs/real-world.md). Geometry generation in Nabla is an
initial implementation of footprints, level/height estimates and terrain-draped
roads; it is not a copied or complete Streets GL rendering pipeline.

### Live world elevation decoder

The browser world worker bundles LERC 4.2.0 (Copyright 2015–2026 Esri), licensed
under Apache-2.0. The bundled license is [Lerc-Apache-2.0.txt](licenses/Lerc-Apache-2.0.txt).
See [Esri LERC](https://github.com/Esri/lerc) for source and notices. Network OSM and
Esri data retain the provider attribution described above; LERC's code license
does not relicense the elevation data.

### Carrier interior atlas

`world/room-skin.jpg` was supplied by the repository owner from Agency
(`agency-ui/src/assets/stage/room-skin.jpg`). It is copied unchanged. The demo
samples its metal panel regions with UVs for the floor, ceiling and walls.

## Jeep Wrangler

`world/car.jeep.wrangler.glb` and `world/car.jeep.wrangler.wheel.glb` are derived
from the user-provided `jeep_wrangler.glb`. Its embedded attribution identifies
[Nieve5677](https://sketchfab.com/niev),
[Jeep Wrangler](https://sketchfab.com/3d-models/jeep-wrangler-7577286d79954f9f85cfe0bd97e211a3),
CC BY 4.0. The original remains unchanged at the user's source location.

`scripts/prepare-wrangler.py` converts axes, recentres the body, separates the
wheel template, merges equal materials and removes unused UV channels. No
triangles are decimated. The body has 24,004 triangles and 24 material groups;
one shared wheel has 2,916 triangles and five groups. With four wheels the vehicle
has 35,668 triangles. Browser measurement including transparent passes is 46 draw
calls / 35,820 submitted triangles, excluding ground, shadows and other views.
The two runtime files total approximately 1.14 MiB. Windows use simple tinted
transparency in Engine; there are no dynamic mirror views or extra vehicle lights.

The retired Gladiator binaries and its special clearcoat/steering setup are
removed. The current catalogue creates the Wrangler directly; there is no
retired-model migration or filename-based replacement when loading scenes.

## Bilbao police Focus

`world/car.ford.focus.police.glb` and `world/car.ford.focus.wheel.glb` derive from
the user-supplied `2016_ford_focus_rs.glb`. Embedded attribution identifies
[Ddiaz Design](https://sketchfab.com/ddiaz-design),
[2016 Ford Focus RS](https://sketchfab.com/3d-models/2016-ford-focus-rs-27e25fcead154e62a1dd8e92ccedb691),
CC BY-NC-SA 4.0. Source attribution is preserved in both GLBs.

Run `node scripts/prepare-focus.mjs /path/to/2016_ford_focus_rs.glb` to reproduce
axis/scale conversion, material grouping and wheel extraction. The original
source remains unchanged. Prepared paint is white; retained materials/textures
preserve the interior and exterior detail. Four wheels share one template.

`src/render/entity/police.ts` adds vector/canvas lettering, projected stripes and
a rounded emissive lightbar inspired by the two user-provided Bilbao fleet
photographs. This is a Focus RS adaptation, not a scan of the pictured vehicles.
No photograph pixels are bundled. The lightbar flashes while occupied in play;
it adds no shadow lights, reflection passes or siren audio. The isolated browser
view measures 32 calls / 106,340 triangles including transparent passes and trim.
These counts exclude scene shadows, portals and other world objects.

Police markings sit 3 mm above the body and use alpha cutouts with depth writing,
avoiding coplanar blending with the logarithmic depth buffer. Lightbar feet are
ray-fitted to the roof at the rearward mounting position.

## A3 Nabla lightweight edition

The A3 body and steering files are derived from the recovered A3 sources above.
The wheel is now generated from a ten-spoke design inspired by the user’s reference photo. `scripts/prepare-a3.mjs` accepts a directory containing the three
untouched source GLBs; the local pre-edit copy is
`/home/txema/backups/nabla-a3-20260928/`. The original files also remain in Git
history at `b11cc97`. Rebuild with Node 22 and the repository dependencies.

The paint, glazing, lights and mirror-lens triangle positions are preserved
exactly (a source-derived SHA-256 regression guards 25,941 protected triangles).
Node transforms and functional names are retained. Meshoptimizer simplifies
other details with locked boundaries and absolute error limits of 1 mm for body
and steering detail. These are simplifier error settings,
not a measured physical manufacturing tolerance. Normals/UVs are compacted with
the selected vertices. No physics mass or collider settings change.

The assembled vehicle has 86,115 triangles, versus 215,865 before optimization.
The isolated browser fixture submits 91,070 triangles with the GPS lowered. This does
not predict FPS in a populated world. Both physics wheel animation and cockpit
mirror/instrument mount names remain available.

The front/rear ring components and central steering decoration are replaced by
silver chrome copies of the container's actual `Brand_Nabla_Proa` geometry. The
wheel cap texture with rings is removed, and each hub receives the same emblem.
The source logo SVG is unchanged. Thin inner floor and wheel-arch liners block
light through the open underside; the convertible cabin remains open. Runtime
paint explicitly renders/casts shadows from both faces, preserving thin panels
that disappeared when the old replacement paint reverted to front-face culling.
Newly inserted A3s use their defined grey paint rather than random colours;
previously authored colours remain editable.

The A3 underfloor is narrowed at both axles, with wider sections only between
and beyond the tires. Inboard wheel-well seals have a regression against the
tire steering envelope. Opaque, shaped headlamp back bowls and black housings
close the front optics while retaining the clear lenses and lit details.

### S3 monitor artwork

`monitors/s3-cluster.svg` and `monitors/red-needle.svg` are project-authored vector
artwork inspired by the user-provided instrument-layout reference. The reference
photograph is not embedded or redistributed. See [the monitor editing guide](../docs/monitors.md)
for the layered definition, preview page, retained HTML example and performance model.

### Photo-inspired chrome wheels

[`scripts/lib/a3-wheel.mjs`](../scripts/lib/a3-wheel.mjs) builds five V-shaped
pairs of bevelled spokes, a star-shaped hub, lug recesses, a dark centre cap and
the small container emblem. Chrome, rubber, recesses and the brake disc form four
merged material batches; all four vehicle wheels share the loaded geometries.
The tyre keeps its 0.315 m radius, rounded shoulders and two shallow grooves,
using 2,048 triangles instead of 5,916. The whole wheel uses 4,596 instead of
7,786 triangles and the GLB is 117,516 instead of 230,476 bytes. Physics is unchanged.

Regenerate only this asset with:

```sh
node scripts/prepare-a3.mjs /path/to/original-a3-backup --wheel-only
```

The previous wheel is also backed up locally at
`/home/txema/backups/nabla-wheel-20260929/car.audi.a3.wheel.glb`.
The reference photo is not embedded or redistributed as a texture.

## Honda VFR800FI 1999

`library/motorcycles/vfr800fi-1999/` contains the user-supplied Interceptor model, optimized and visually approved as a black 1999 VFR800FI on 2026-10-08. The original was supplied as `interceptor.glb`; its SHA-256 and the prepared GLB integrity are recorded in `asset.json`. Source artwork licensing was not supplied. This preparation retains the original wheel spoke designs, simplifies geometry, authors materials and separates mechanical pivots. The technical JSON links Honda brochure/service-manual sources and marks intermediate power-curve samples as simulation estimates. The asset requires future motorcycle support in Engine.
