# Generalization candidates

Observation list from the October 2026 review. **Nothing here has been changed**; each item
says what is ad hoc, why it matters, a recommendation and a rough effort (S ≤ ½ day, M 1–3 days,
L > 3 days). Rule for all of them: default production behaviour must not change; a dev-only
toggle that lets you compare old and new is fine.

## A. Per-vehicle attachments (mounts)

### Today: where positions come from

| Element                        | Position comes from                                                                                                                       | Editable without Blender? |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| Lamp lenses / emissive parts   | Meshes in the GLB, bound to a light channel by **material name** `nabla.light.<role>` (deprecated fallback: `extras.vehicleLightChannel`) | No                        |
| Lamp anchors / light nodes     | GLB nodes (`extras.nabla.anchor`, KHR punctual lights) read by `authored-lights.ts`                                                       | No                        |
| Ground/rear wash of lamps      | The `light.tail.brake` anchor + `vehicle.lights.tuning` (data); S3-style cars still use constants in `light-rig.ts` (`groundGlow`)        | Yes (JSON)                |
| Mirrors                        | GLB lens meshes (+ `vehicle.mirrors` for models without lens), aim in `vehicle.mirrorAim`/`mirrorTilt`                                    | Aim yes, position no      |
| Instruments, wheel, rider head | Named GLB anchors + presentation adapter (`src/catalog/presentation/*-mounts.ts`)                                                         | Partly                    |
| Weapons                        | Avatar hand/pose, independent of vehicle                                                                                                  | n/a                       |

Result: the same job — "put a thing on a vehicle" — has four mechanisms (GLB mesh, GLB
anchor, JSON field, code constant), and they are created in different places and disposed
independently.

### Proposal (a): one `attachments` list in the vehicle JSON

> Naming note: `visual.attachments` already exists (cargo / equipment GLBs composed onto the chassis). The per-vehicle mounts proposed here must use another name, for example `vehicle.mounts`. The part of the proposal that is already real is [`vehicle.lights`](vehicle-definition.md#5-lights) (tuning defaults and lens glow) and the `nabla.*` names of [vehicle-definition.md](vehicle-definition.md#3-naming-convention-nabla).

```jsonc
// assets/library/motorcycles/vfr800fi-1999/vfr800.json
"vehicle": {
  "attachments": [
    { "id": "tail",        "type": "tail-light",  "parent": "body",        "position": [0, 0.88, 0.99],  "rotation": [0, 0, 0] },
    { "id": "brake",       "type": "brake-light", "parent": "tail",        "position": [0, 0, 0] },
    { "id": "mirror.left", "type": "mirror",      "parent": "mirror_L",    "side": "left" },
    { "id": "head.low",    "type": "headlamp",    "parent": "body",        "position": [0, 0.82, -0.9], "beam": "low" },
    { "id": "cluster",     "type": "instrument",  "parent": "body",        "position": [0, 1.02, -0.45] }
  ]
}
```

- Schema: add `attachments` to `src/entity/vehicle/field.ts` (id, type enum, `parent` = GLB node
  name or another attachment id or `body`, local `position`/`rotation`, optional per-type
  fields). Optional and empty by default, so every existing vehicle is unchanged.
- Resolution: GLB anchors keep working as the default; an attachment with the same `id`/anchor
  name **overrides** the GLB value. This keeps assets as the source of truth and gives JSON the
  last word.
- Ownership: one `VehicleAttachments` group created by the entity view when the vehicle is
  built (and per seat on enter), which creates lamps/mirrors/instruments from the list, owns
  their Three.js objects and the light-rig registration, and disposes all of them together on
  exit/destroy. Today `CarLights`, `CarMirrors`, `CarInstruments`, `vehicleLights.*Glow` and
  the adapters each do this separately in `render/entity/view.ts`.
- Colour/lighting/material values are not part of attachments (positions and orientation only).
- Effort: schema + resolver + group **M**; migrating mirrors, instruments, lamps one type at a
  time **S–M each**; test: round-trip the JSON and assert overrides.

### Proposal (b): make the VFR rear light movable (minimal)

What was found (VFR800FI 1999, `vfr800fi-1999.glb`):

- The GLB has a node `light.tail.brake` at `(0, 0.878, 0.992)` with
  `extras.nabla = { anchor: "light.tail.brake", lightMount: true }` and the red lens material
  `Tail and brake red lens` (`vehicleLightChannel: Tail_Stop`).
- **No code reads `lightMount`**, and nothing in `src/` looks up `light.tail.brake` by name
  (searched `src/`, `game/`, `scripts/`): the anchor is informational. The visible red glow on the lens is the lens mesh itself, fixed in the GLB.
- The red wash on the road behind the bike comes from `rearGroundGlow` in
  `light-rig.ts`: a point light at `(0, -0.25, length / 2 - 0.2)` in vehicle space, with
  `length = size[2]` = 2.095 m → z ≈ 0.85 m, hard-coded, while the GLB tail anchor/lens is at
  z ≈ 0.99 m (in model space; the two spaces share an origin only if `visual.body` has no
  offset, to be confirmed in game). A ≈ 14 cm gap is the most likely "misaligned rear light".
- `vfr800.json` has no field for any of this (`visual` only has `body`).

Smallest fix, data-only after one tiny code change:

1. Add an optional `vehicle.lightOffsets` (or the first slice of `attachments`) to
   `field.ts`:
   ```jsonc
   "vehicle": { "lightOffsets": { "tail": [0, 0, 0.14] } }   // metres, vehicle-local, +Z backwards
   ```
2. In `light-rig.ts`, add this offset to the `rearGroundGlow` position; in
   `authored-lights.ts`, add it to the tail/brake emitter position. No other behaviour changes
   when the field is absent.
3. For a lens that is geometry, the only way to move the _mesh_ is to edit the GLB (Blender) or
   to apply the same offset to the meshes of the `Tail and brake red lens` material: do that in
   the presentation adapter for the vehicle (one `lensNodes.forEach(n => n.position.add(offset))`).

Debug nudge (dev only, «Desarrollo» tab, hidden by default): four number inputs (x/y/z, step
1 cm) for the current vehicle's `lightOffsets.tail`, applied live, with a «Copy JSON» button that
prints `"lightOffsets": { "tail": [x, y, z] }` ready to paste into the recipe. The same panel is
reusable for any attachment id once (a) exists. Effort: field + wiring **S**, panel **S**,
lens-mesh offset **S**.

Until then, Txema can move the lamp **today** only by editing the GLB node/mesh; the JSON has no
supported field.

## B. Duplicated or parallel systems

| Candidate                                       | Observation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Recommendation                                                                 | Effort |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| Streetlights vs. signage/traffic lights physics | **Done.** Step 1 (`SceneryPoles` into the engine as `SceneryPhysics`, `runtime.sceneryPhysics`) and step 2: lamp posts and tree trunks are a _world layer_ (`field-lights`) of the same service instead of `Simulation.setPoles` → `PlanetCollisions`. It keeps the old behaviour: 65 m around any actor, no cap, 3 ms per refresh, own half sizes (0.07 m lamp, tree hull radius), planet static surface. Differences to know: poles no longer delay the planet-collision `ready` flag, and they are created when the actor crosses an 8 m cell or the lamp set changes. The light budget (`Streetlights`) is rendering and stays separate. | Next: expose layer diagnostics in the Desarrollo tab.                          | S      |
| Physics radius setting                          | The editable physics radius (`data-sign-physics-radius`, `euskadi.irun-signs`) is host-local.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Make it an engine setting (Desarrollo or Mundo) shared by all scenery classes. | S      |

## C. Implemented for one specific piece

| Candidate                | Where                                                                                                                                                                                 | Recommendation                                                                                                                                                       | Effort |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Motorcycle special cases | `twoWheeled` runtime (lean/wheelie/stoppie/burnout), `motorcycle-instruments.ts`, `render/vehicle-presentation/mirror-parts.ts`, `rearGroundGlow` (one- vs two-lamp branch) for bikes | Express as flags/params in the vehicle JSON (`hooligan` limits, glow offsets) rather than `if (twoWheeled)` branches; fold mirrors/instruments into attachments (A). | M      |
| S3 presentation          | `src/catalog/presentation/a3-*.ts` (lamp selectors, display mounts)                                                                                                                   | Fine as an adapter, but its measured mounts are exactly the `attachments` shape: migrate to JSON so other cars can use the same mechanism.                           | M      |
| Carrier interior         | `render/entity/carrier-interior.ts` hidden until shadow maps exist (shader-mismatch workaround)                                                                                       | General "reveal after first shadow pass" helper for any interior group.                                                                                              | S      |
| Hard-coded positions     | `rearGroundGlow`, bike glow offsets, `LAMP_HEIGHT` constants in `field-lights.ts`                                                                                                     | Move to `src/config/` or the vehicle JSON.                                                                                                                           | S      |

## D. Misplaced controls

| Candidate          | Observation                                                                                                                                                                                                                                                                                                    | Recommendation                                                                                            | Effort |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------ |
| Car light settings | **Done** (`feat/vehicle-definition-lights`): the lamp sliders list only the lamp groups the occupied vehicle can light (`runtime.occupiedVehicle.lamps`), and every per-vehicle option sits in one group of the «Objetos» tab titled with the vehicle's name. Global and world lighting stays in «Desarrollo». | Next: mount the other per-vehicle options (mirrors, sounds) behind the same group when they get settings. | done   |

## E. Documentation debt noticed

- `settings-menu.md` is written in Spanish; its tab names now match the code. Translating it to English is open (project rule: all docs in English).
- Euskadi `GAME.md` describes an older HUD layout; it should only point here.
- Several architecture documents carry a date in the title ("phase 3", "review 2026-10-04");
  prefer stable names plus a changelog entry.
