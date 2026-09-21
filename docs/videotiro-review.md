# Videotiro content review

Reviewed the user's `D:\Virtual\dev\videotiro` directory on 2026-09-21, including
`Capitas.jpg`, representative XML definitions and the supplied plasma frame.
This is a content review, not an importer or a change to the current gallery.

## What is present

The directory contains 12,317 files, including 12,059 PNGs, 21 `.sml` stage files,
17 `.bml` backgrounds, 24 `.tml` target definitions, 27 `.ani` files and audio.
Counts include duplicate content under `Media/Escenarios GTS`. `Fondos.zip` and
`Media.zip` contain content archives; no application source was identified in the
reviewed directory or their file listings. Runtime details therefore cannot be
established from the original implementation here.

| Format/example                             | Observed content                                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Media/Donosti.sml`                        | A `stage` references backgrounds and targets. A timed `scene` places targets with x/y/z, scale, rotation and initial state; events select later states at specified seconds. |
| `Media/Fondos/Donosti.bml`                 | A main plane at z=0 and nested planes at z=10 and z=30, each referencing an image layer.                                                                                     |
| `Media/Fondos/Camiones.bml`                | A photograph plus separately positioned, scaled vehicle cutouts at different depths.                                                                                         |
| `Media/Objetivos/Dianas/Anillos/diana.tml` | Ten images with scores 1–10: distinct scoring regions, not one score for the entire target.                                                                                  |
| `Media/Objetivos/Animados/Chandal.tml`     | Named state transitions referencing animation folders, normal/reverse/cycle types, mode changes and audio tied to a frame. Exact playback semantics require validation.      |

The inspected Donosti images are all 1500 × 1000. The base photograph is RGB;
the two cutout layers are RGBA. Keeping their full image canvases preserves pixel
alignment. `Capitas.jpg` shows the assembled image, false-colour layer silhouettes
and oblique views of separated planes: the scenery is fixed planar artwork at
different depths, not a collection of camera-facing billboards.

`Media/Fondos/Decorado/Imagen/Plasma_Marco_GTS.png` is a 1024 × 768 RGBA monitor
frame. Its centre pixel has alpha zero; the dark centre visible in some previews
is not an opaque screen. It can frame a live portal window. It has not been copied
into Nabla or substituted for the Stargate without deciding the gallery design.

## Proposed reuse boundary

Keep two explicit rendering behaviours: fixed textured planes for photographic
scenery, and camera-facing sprites for trees or actors that actually need them.
Changing a scenery plane into a billboard would rotate walls toward the viewer
and break the assembled photograph. For a moving viewer, separated fixed planes
provide parallax and occlude actors at the corresponding depth.

A future importer should first convert a single background, preserving canvas
alignment, hierarchy and relative paths. Define an explicit pixel-to-metre scale,
axis convention, depth mapping and reference eye before converting all scenarios.
The historical z values are not proven to be metres, and rotation/scale defaults
and nested transforms must be checked against the screenshots rather than guessed.

Keep background composition, actor state machines, scoring regions and scenario
timelines as separate data. Numbered PNG sequences can later become atlases or
streamed clips; do not load twelve thousand images into GPU memory at once.
Opaque foreground pixels should occlude both imagery and shots, while transparent
pixels reveal and allow hits on deeper layers. Validate scoring overlap/order and
animation timing with one known target before implementing the entire format.

The existing window-portal camera and alpha-aware shot path provide a starting
point. The current timed billboard gallery is only a demonstration; it does not
yet import Videotiro stages, fixed photographic layers or actor transitions.
