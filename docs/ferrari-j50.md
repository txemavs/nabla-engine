# Ferrari J50 preparation

The user's untouched source is `2017_ferrari_j50.glb`. Its embedded attribution names
Ddiaz Design, the [Sketchfab source](https://sketchfab.com/3d-models/2017-ferrari-j50-75fa17b49980429685ca3b92c91ab73f)
and [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Preserve this attribution
when redistributing the derived files. Source hash and detailed per-mesh conversion
records are in `assets/library/cars/ferrari-j50/asset.json`.

Run `node scripts/prepare-ferrari-j50.mjs PATH_TO_SOURCE.glb`, then
`npm run rigs:generate` and `npm run assets:pack`. The script never writes to the
source. The catalog preset is `ferrari-j50.json` in the same asset directory.

The scene is flattened from the FBX/Sketchfab hierarchy, oriented to Y-up and -Z
forward, centred and scaled to a 4.7 m model length. This scale, cockpit anchors,
colliders, mass and powertrain are initial gameplay setup, not manufacturer measurements.
Inspect and tune the preset and script before claiming physical accuracy.

Geometry is organized by function and material. Bodywork, glass, interior, visible
engine cover/exhaust, lights, fixed brakes, mirrors and trim remain in the body GLB.
Four wheel GLBs contain tires, rims, discs and hub detail; calipers stay fixed on the
body. The steering assembly has its own GLB and anchor. Wheel, steering and cockpit
anchors are embedded in the body and extracted into `generated-rigs.ts`.

Hidden engine base, valve and detailed bay geometry is removed (32,141 source triangles); visible
exhausts remain, and a simple 12-triangle opaque liner closes the empty engine bay. No door, bonnet or boot animation has been
invented: the source panels are not independent articulated assemblies in this preparation.

The simplifier preserves UV and normal seams, keeps conservative geometric errors
on painted and optical surfaces, and uses stronger reduction on small mechanical
details. Exact duplicate embedded images are deduplicated per output. Unused materials,
textures, hierarchy and accessors are discarded. Painted body surfaces use one-sided
rendering and a less extreme roughness; original materials and textures otherwise remain.

The output has 111,715 triangles versus 440,478 in the source (74.6% fewer).
All six GLBs total approximately 12.71 MB versus the 45.43 MB source. These are raw
file sizes; the asset pack further applies lossless gzip compression.

Checks: catalog validation, wheel ordering, suspension settling, GLTFLoader loading
and Chromium rendering of the assembled vehicle. The browser test captures front
and rear views. The provided screenshot suggested overlapping surfaces, but no
identical paint triangles were found at the inspected tolerance; that cause remains
unconfirmed. The prepared front preview did not reproduce the screenshot's spots.

## Live cockpit placement

While seated, open Settings → Desarrollo → Vehículo → Conductor, volante y espejos.
Cabeza y vista has separate X/Y/forward sliders for the visible head and additional
camera offsets. Range is ±100 cm, step 1 cm, configured in `src/config/driver-pose.ts`.
Positive lateral is chassis right, positive height is up, positive forward is -Z.
The camera follows the adjusted head plus its own view offsets; view sliders do not
move the visible avatar. Motorcycle rider motion remains additive to these offsets.

Values persist by body-model URL in `nabla.driverPose`. Copiar valores exports metre
offsets and the model URL for review/baking; Restablecer clears this model only.
AJUSTES PREDETERMINADOS clears these settings with the other game preferences.
