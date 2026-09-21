# Asset provenance

Bundled artwork is kept separate from engine code and served by the reference
host. Do not regenerate or recolor original source files to adjust presentation.

| Files                            | Source                                                                                                                 | Use                                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `brand/source.svg`               | [txemavs/nabla-hacs](https://github.com/txemavs/nabla-hacs/blob/main/custom_components/nabla_control/brand/source.svg) | Official metallic blue hollow Nabla mark; app header, favicon and README |
| `world/car.audi.a3.cabrio.glb`   | This repository, commit `6a22576`                                                                                      | Original body and interior                                               |
| `world/car.audi.a3.wheel.glb`    | This repository, commit `6a22576`                                                                                      | Four wheel instances                                                     |
| `world/car.audi.a3.steering.glb` | This repository, commit `6a22576`                                                                                      | Steering wheel                                                           |
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
The reference host enlarges the monitor by 1.65 for readability and adds
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

## User-supplied HK USP Compact

`weapons/hk_usp_compact_9mm.glb` (body) and
`weapons/hk_usp_compact_9mm_c.glb` (slide) were supplied by the user from
`A:\Descargas\hk_usp_compact_9` on 2026-09-21 and copied without modification.
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
