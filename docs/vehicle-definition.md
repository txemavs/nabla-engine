# Defining a vehicle

This is the manual for describing a vehicle to the engine: **one JSON file plus one or more GLB
models**. The goal is that the vehicles shipped with the engine could be deleted and rebuilt from
this document alone, and that a new car is made by copying the JSON of an existing one, pointing it
at a new model and changing parameters.

It is verified against the real code and the real JSON of the Honda VFR800FI 1999
(`assets/library/motorcycles/vfr800fi-1999/vfr800.json`), the S3
(`assets/library/cars/a3/s3.json`) and the Ferrari J50
(`assets/library/cars/ferrari-j50/ferrari-j50.json`). Where an element **cannot be defined by data
yet**, the section says so and it is collected in [What cannot be defined by data
yet](#9-what-cannot-be-defined-by-data-yet).

Related: [Create a vehicle](creating-a-vehicle.md) (hosts and physics wiring),
[Vehicle rigs](vehicle-rigs.md) (anchors extracted from the GLB), [Motorcycles](motorcycles.md),
[Ferrari J50](ferrari-j50.md), [UI/UX pattern](ui-ux-pattern.md) (where per-vehicle settings
live) and the generated [module reference](reference/README.md). The JSON schema is
`src/entity/vehicle/field.ts` (zod, **strict**: an unknown field is an error).

## 1. Principles

1. **The model says where, the JSON says how much.** A GLB carries geometry, named anchors and
   named materials. Numbers that are not geometry (power, beam cutoff, glow colour…) are JSON.
2. **Anchor = where the lamp is; adjustment = where its light lands.** The rear lamp of the VFR
   is anchored on the tail unit (`extras.nabla.anchor = "light.tail.brake"`). That tells the
   engine where the lamp is. The red wash the lamp throws on the road is a separate, adjustable
   thing: it must land almost on the road, otherwise it lights the bike itself. So the vehicle
   JSON carries `rearX/rearY/rearZ` (metres, relative to the anchor), `rearIntensity` and
   `rearReach` (multipliers). Moving the lamp means moving the anchor in the model; moving its
   light means changing these numbers.
3. **An adjustment found on one vehicle is a common parameter for all vehicles.** The VFR needed
   its tail wash moved down and back and made stronger and shorter. That did not become a
   motorcycle switch: `rearY`, `rearZ`, `rearIntensity` and `rearReach` are in the common
   `nabla.vehicle-lights/1` schema, with engine defaults (`vehicleLightDefaults`), overridden by
   the vehicle JSON (`vehicle.lights.tuning`), overridden by the player's saved choice. Every
   vehicle that gets the rear wash uses the same four numbers.
4. **Prefer common, data-driven parameters over per-vehicle code.** No `if (model is the VFR)`.
   The VFR's white headlamp lens is `vehicle.lights.lensEmissive.low = "#ffffff"`, a field every
   vehicle has; the lens material is found by its name (rule 5), not by the model.
5. **Names are the contract.** Everything in a GLB that the engine must recognise is named
   with the `nabla.*` convention of [section 3](#3-naming-convention-nabla). The engine
   resolves lamp roles **only** by these names (plus the deprecated fallbacks listed there) and
   never by a model-specific material or node name.
6. **No colour, lighting or material exceptions per vehicle.** All PBR materials use the same
   lighting path. A per-lamp lens colour is data (rule 4), not a special case in the renderer.
7. **Everything is English** (code, comments, docs, material and node names).

## 2. Anatomy of a vehicle

| Part                              | Where                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------ |
| Vehicle JSON                      | `assets/library/<family>/<vehicle>/<vehicle>.json` (validated by `vehicleField` + `visualField`) |
| Body, wheels, steering wheel GLBs | `visual.body`, `visual.wheel` / `visual.wheels`, `visual.steering`                               |
| Rig (hubs, driver seat, eyes)     | `"rig": "glb"`: extracted from anchors embedded in the body GLB into `generated-rigs.ts`         |
| Physics                           | `vehicle.colliders`, `wheelRadius`, `suspension*`, `stiffness`, `powertrain`, `twoWheeled`…      |
| Lights, mirrors, instruments      | GLB names + `vehicle.lights`, `mirrors`, `mirrorTilt`, `mirrorAim`, `cluster`, `clusterOffset`   |
| Sound                             | `vehicle.audio`                                                                                  |
| Smoke                             | exhaust outlets (see [section 7](#7-exhaust-and-smoke))                                          |
| Library entry                     | `asset.json` / README next to the files                                                          |

`hubs` and `driver` are not written by hand in a `"rig": "glb"` vehicle: they come from the
anchors of the body GLB (wheel anchors, `driver.seat`, `driver.eyes`; see
[Vehicle rigs](vehicle-rigs.md)). The S3 and VFR files above therefore contain no `hubs`.

### Top-level fields (library JSON)

| Field                             | Meaning                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `label`, `name`             | Machine id, menu label, and the **name shown to the player**. This name is the title of the vehicle's group in Settings → Objetos. |
| `color`                           | Default body colour (used by the paint path of the presentation).                                                                  |
| `size` `[w, h, l]`, `mass` (kg)   | Chassis box in metres and mass.                                                                                                    |
| `clearance`, `placement`, `order` | Spawn height, default position in the garage scene, list order.                                                                    |
| `rig`                             | `"glb"` = rig from GLB anchors.                                                                                                    |
| `vehicle` / `visual`              | The two blocks below.                                                                                                              |

### `vehicle` block (physics, equipment data)

| Field                                                                                                           | Meaning                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `controls`                                                                                                      | Control profile id (`road`, `flight`, `none`, host profile). See [vehicle-controls](vehicle-controls.md).                                       |
| `colliders` (1–32)                                                                                              | Box colliders `{ size, transform }`, chassis-local metres.                                                                                      |
| `wheelRadius`, `suspensionRest`, `suspensionTravel`, `stiffness`                                                | Wheel and suspension. `wheelRadius` is the front radius on a two-wheeler.                                                                       |
| `engineForce`, `brakeForce`, `drivenWheels`                                                                     | Drive (`front`, `rear`, `all`) and brakes.                                                                                                      |
| `powertrain`                                                                                                    | `powerCv`, `torqueNm`, `ratios`, `finalDrive`, `grip`, `idleRpm`, `maxRpm`, `speedLimiter`, `shift`, `modes` (`normal`/`beast`), `defaultMode`. |
| `twoWheeled`                                                                                                    | Single-track controller (lean, rider, `pegLean`, brakes, `cbs`, hooligan limits). Requires two hubs.                                            |
| `cameraDistance`, `headOffset`, `headRotation`, `rideSmoothing`                                                 | Camera and eye.                                                                                                                                 |
| `mirrors`, `mirrorTilt`, `mirrorAim`                                                                            | Mirrors (section 6).                                                                                                                            |
| `cluster`, `clusterOffset`                                                                                      | Instruments (section 8).                                                                                                                        |
| `lights`                                                                                                        | Lamps (section 5).                                                                                                                              |
| `audio`                                                                                                         | Sound (section 8).                                                                                                                              |
| `paintFinish`, `reverseAlarm`, `monitorMounts`                                                                  | Body finish, reverse beeper, extra display surfaces.                                                                                            |
| `tow`, `hitch`, `towAnchor`, `passive`, `interior`, `garage`, `flight`, `plane`, `aircraft`, `boat`, `forklift` | Towing, trailers, interiors, aircraft, boats: see [creating-a-vehicle.md](creating-a-vehicle.md).                                               |

### `visual` block

| Field                                | Meaning                                                                                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `body` `{ url, transform, lowUrl? }` | Body GLB. `lowUrl` is a light copy (Quest) with **identical anchors and names**.                                                                                          |
| `wheel` / `wheels[]`, `steering`     | One shared wheel GLB, or one per hub; steering wheel GLB (`axis` optional).                                                                                               |
| `wheelRotations`                     | Per-wheel rotation fix.                                                                                                                                                   |
| `presentation`                       | Id of a registered presentation adapter (code). **Omit it for a plain data-driven vehicle.**                                                                              |
| `attachments`                        | Cargo / equipment GLBs composed on the chassis at spawn (this name is taken; see [section 9](#9-what-cannot-be-defined-by-data-yet) for the per-vehicle mounts proposal). |
| `ramp`                               | Garage ramp nodes.                                                                                                                                                        |

## 3. Naming convention (`nabla.*`)

### Lamp materials

The engine finds out what an emissive material lights **from its name**. The pattern is
`nabla.light.<role>[.l|.r][.<free suffix>]`. `.l` / `.r` give the side (indicators, per-side
lamps); a free suffix lets a model keep several materials of one role (`nabla.light.tail.l.lens`).

| Material name           | Lights when…                           | Engine channel |
| ----------------------- | -------------------------------------- | -------------- |
| `nabla.light.position`  | position (parking) lights are on       | `position`     |
| `nabla.light.low`       | dipped beam is on                      | `low`          |
| `nabla.light.high`      | high beam is on                        | `high`         |
| `nabla.light.fog`       | fog lamps are on                       | `fog`          |
| `nabla.light.tail`      | tail lamp, brighter when braking       | `tail-stop`    |
| `nabla.light.brake`     | separate brake lamp                    | `brake`        |
| `nabla.light.reverse`   | reverse gear                           | `reverse`      |
| `nabla.light.indicator` | turn indicator (`.l` / `.r`), flashing | `signal`       |
| `nabla.light.marker`    | side / roof marker lamps               | `marker`       |
| `nabla.light.cabin`     | interior light                         | `cabin`        |

The material must be a `MeshStandardMaterial` whose `emissive` and `emissiveIntensity` are the
**lit** look. The engine stores the authored intensity and drives it to zero while the lamp is
off. Resolution lives in `lampFromMaterialName` (`authored-lights.ts`).

**Deprecated fallback** (still works, do not use in new models): a material with
`extras.vehicleLightChannel` (`LowBeam`, `HighBeam`, `Fog`, `Brake`, `Tail_Stop`, `Reverse`,
`Indicator`, `Marker`, `Cabin`) and `extras.vehicleLightSide` (`L` / `R`), or a mesh node with
`extras.role = "vehicle-emitter"`. A name in the convention wins over the extras.

### Anchors and parts (node `extras`)

Nodes are tagged with `extras.nabla.<kind> = <name>`. Node names themselves are free; only the
extras are read.

| Extras                                                                                                             | Used for                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `nabla.anchor`: `wheel.fl`, `wheel.fr`, `wheel.rl`, `wheel.rr` (`wheel.r2l`, `wheel.r2r` for six wheels)           | Hubs (rig extraction)                                       |
| `nabla.anchor`: `steering`, `driver.seat`, `driver.eyes`                                                           | Steering wheel, seat, eye                                   |
| `nabla.anchor`: `tow.hitch`, `tow.anchor`                                                                          | Towing                                                      |
| `nabla.anchor`: `light.tail.brake`                                                                                 | Where the rear lamp is (road wash is placed relative to it) |
| `nabla.anchor`: `exhaust`                                                                                          | Exhaust outlet of a two-wheeler (smoke socket)              |
| `nabla.mirror`: `left`, `right`, …                                                                                 | Mirror lens mesh of that side (aim keys of `mirrorAim`)     |
| `nabla.mount`: `instrument.cluster`, `instrument.menu.N`, `instrument.navigator.N`                                 | Display mounts of a car cluster                             |
| `nabla.gauge`: `speedometer`, `tachometer`, `lcd`; `nabla.lamp`: `signal-left`, `signal-right`, `warning` (`slot`) | Motorcycle cluster                                          |

KHR punctual lights of a model are bound by their node `extras`: `role: "vehicle-light"`,
`channel` (the same channel names as in the deprecated fallback), `side`, `onIntensity` and
optionally `beamPattern: "low-beam"`.

## 4. The vehicle JSON of the VFR, annotated

`assets/library/motorcycles/vfr800fi-1999/vfr800.json` (abridged to what each section covers):

```json
{
  "id": "vfr800",
  "name": "Honda VFR800FI 1999",
  "color": "#b3121b",
  "size": [0.735, 1.19, 2.095],
  "mass": 310,
  "vehicle": {
    "controls": "road",
    "mirrorAim": { "left": { "yaw": -1.5, "tilt": 8.5 }, "right": { "yaw": 9, "tilt": 8.5 } },
    "lights": {
      "tuning": {
        "low": 0,
        "high": 1,
        "frontX": 0,
        "frontY": 0,
        "frontZ": 0,
        "rearX": 0,
        "rearY": -0.2,
        "rearZ": 0.99,
        "rearIntensity": 2.2,
        "rearReach": 0.5
      },
      "lensEmissive": { "low": "#ffffff" }
    },
    "colliders": [
      {
        "size": [0.28, 0.3, 1.0],
        "transform": { "position": [0, -0.1, -0.05], "rotation": [0, 0, 0, 1] }
      }
    ],
    "wheelRadius": 0.2999,
    "powertrain": {
      "powerCv": 110,
      "torqueNm": 82,
      "ratios": [2.8462, 2.0625],
      "finalDrive": 4.9055,
      "grip": 4.5
    },
    "twoWheeled": {
      "rearWheelRadius": 0.3149,
      "steeringAxis": [0, 0.9106, 0.4133],
      "steerLimit": 0.610865
    },
    "audio": {
      "turbo": false,
      "engine": { "voice": "v4", "vAngle": 90, "crankpin": 180, "volume": 0.48 }
    }
  },
  "visual": {
    "body": {
      "url": "/library/motorcycles/vfr800fi-1999/vfr800fi-1999.glb",
      "transform": { "position": [0, -0.55, 0], "rotation": [0, 0, 0, 1] }
    }
  },
  "rig": "glb"
}
```

(The real file has the complete `colliders`, `powertrain` and `twoWheeled` blocks; the lights
block above is verbatim.)

## 5. Lights

Four layers, every vehicle, same schema:

1. **The model** declares what exists: lamp materials named `nabla.light.*` (glowing lenses),
   KHR spot lights with `extras.role = "vehicle-light"` (the beams), the `light.tail.brake`
   anchor (rear lamp position).
2. **Engine defaults**: `vehicleLightDefaults` in `src/render/vehicle-presentation/light-tuning.ts`.
3. **The vehicle JSON** `vehicle.lights.tuning` overrides the defaults for that vehicle.
4. **The player** adjusts sliders in Settings → Objetos → _vehicle name_ → Luces; the choice is
   saved per model in the browser (`nabla.vehicle-lights.<model url>`, schema
   `nabla.vehicle-lights/1`) and wins over the JSON. «Restablecer luces» returns to the JSON
   values; «Compartir ajustes de luces» copies the values for pasting into the JSON.

### `vehicle.lights.tuning` (all optional)

| Field                        | Unit    | Range  | Default | Meaning                                                               |
| ---------------------------- | ------- | ------ | ------- | --------------------------------------------------------------------- |
| `low`, `high`                | degrees | −5 … 5 | 0 / 1   | Beam cutoff of the dipped and the high beam                           |
| `frontX`, `frontY`, `frontZ` | metres  | −2 … 2 | 0       | Offset of all the head lamps' light (right/left, up/down, back/front) |
| `rearX`, `rearY`, `rearZ`    | metres  | −2 … 2 | 0       | Offset of the tail lamp's road wash from the lamp anchor              |
| `rearIntensity`              | ×       | 0 … 3  | 1       | Strength of the tail wash                                             |
| `rearReach`                  | ×       | 0 … 3  | 1       | How far the tail wash reaches                                         |

### `vehicle.lights.lensEmissive` (all optional)

Map of lamp channel → colour (`#rrggbb`). While a lamp of that channel is lit, the emissive
colour of its lens material becomes that colour. Channels: `position`, `brake`, `tail-stop`,
`reverse`, `signal`, `marker`, `front-signal`, `low`, `high`, `fog`, `cabin`. A channel that is
left out keeps the colour authored in the model (the VFR keeps its red tail lens and amber
indicators; only `low` is white). The glow level itself is unchanged: it is the authored
`emissiveIntensity` switched by the lamp controller, through the same lighting path as every
other material.

### Worked example: rear light

- The VFR model has the anchor `light.tail.brake` on the tail unit → the lamp **is** there.
- Without adjustment the wash lands on the tail and lights the bike. In the JSON:
  `rearY: -0.2` (down towards the road), `rearZ: 0.99` (back, away from the bike),
  `rearReach: 0.5` (shorter), `rearIntensity: 2.2` (stronger).
- Any other vehicle with a `light.tail.brake` anchor sets the same four numbers in its JSON; no
  code is involved.

The values are the generic `nabla.vehicle-lights/1` ones; none is motorcycle specific. Today the
anchored rear wash is drawn for two-wheelers, trucks and trailers, and S3-style cars use
`groundGlow`; a plain car without a presentation adapter gets neither, so its `rear*` numbers
have no visible effect until that gap is closed (section 9).

## 6. Mirrors

- **Lens meshes in the GLB tagged `extras.nabla.mirror = "left" | "right" | …`.** The engine
  renders a reflection into each lens. `mirrorAim` keys are these side names.
- **No lens in the model:** `vehicle.mirrors` describes flat lenses in body space
  (`position`, `normal`, `width`, `height`); the engine creates the mesh (`nabla.mirror.<n>`).
- `mirrorTilt` (degrees, default −2; 0 on two-wheelers) tilts every mirror; `mirrorAim`
  adds a baked aim per side (`yaw` + outward, `tilt` + up, optional `viewYaw`), written by
  `scripts/bake-mirror-aim.mjs`; the driver's «Espejos» sliders are added on top.
- Two-wheelers: mirror parts `mirror_L` / `mirror_R` are tagged automatically.

**Not data-driven yet:** mirrors of a _car_ are only mounted by a presentation adapter
(`nabla.truck` has the generic authored-lens path; `nabla.s3` finds its lens by the material
name `Llanta 2`). A plain car without `visual.presentation` gets no mirrors (section 9).

## 7. Exhaust and smoke

- **Two-wheelers:** the outlet is the node tagged `extras.nabla.anchor = "exhaust"`. The
  deprecated fallback is a node named `Exhaust_Outlet_Closure` (the VFR still uses it).
- **Cars and trucks:** outlets are positions in code inside the presentation adapters
  (`nabla.s3`: two outlets, `nabla.truck`: one outlet and its smoke options). **Not data-driven
  yet.** Proposed: `vehicle.exhaust: { outlets: [{ position, direction }], … }`.
- The amount of smoke (trucks) is adjusted in Settings → Objetos → _vehicle name_ → «Humo del
  camión»; the section is listed only for a vehicle that has exhaust.

## 8. Instruments and sound

- **Motorcycle cluster:** GLB anchors `gauge_speedo`, `gauge_tacho`, `gauge_lcd`,
  `lamp_signal_l|r`, `lamp_warning_N` (extras `nabla.gauge` / `nabla.lamp`) and the
  `vehicle.cluster` block (`speedoMaxKmh`, `speedoStepKmh`, `tachoMaxRpm`, `redlineRpm`, `sweep`,
  `lamps`: `neutral`, `high-beam`, `oil`, `fi`).
- **Car cluster and menus:** mounts `instrument.cluster`, `instrument.menu.N`,
  `instrument.navigator.N` read by a presentation adapter (`nabla.s3`, `nabla.truck`);
  `clusterOffset` nudges the cluster by up to ±0.2 m. Needs a presentation adapter (section 9).
- **Sound** (`vehicle.audio`): `engine` (`voice`: `note`, `v4`, `inline`, `diesel`; `vAngle`,
  `crankpin`, `cylinders`, `warble`, `turboWhistle`, `intakeNoise`, `blowOff`, `burble`, `jake`,
  `airBrake`, `volume`), `engineModes.normal|beast` (voice per engine mode), `turbo`,
  `gearShift` (`sound`: `clack` | `click` | `none`, `volume`). Gearbox sound details are in
  `powertrain.shift.clack`.

## 9. What cannot be defined by data yet

Each item is a follow-up. "Adapter" means a `visual.presentation` id registered in code
(`src/catalog/presentation/road-vehicles.ts`).

| Element                        | Today                                                                                                                                                           | Proposed data form                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Car and truck exhaust outlets  | Fixed positions in the `nabla.s3` / `nabla.truck` adapters                                                                                                      | `vehicle.exhaust.outlets[]` (position, direction, smoke options)                                       |
| Car mirrors                    | Only through an adapter (S3 finds `Llanta 2`; truck uses authored lenses)                                                                                       | A stock adapter (e.g. `nabla.road`) that every car can name, or mirrors for every vehicle              |
| Car cluster / menu mounts      | Adapter (`createA3Mounts`)                                                                                                                                      | Same stock adapter + `extras.nabla.mount`                                                              |
| S3 lamps                       | `createA3Lights` selects meshes by Spanish node names and materials (`luz izquierda`, `foco derecho`, `Foco 5`, `FocoC`, `LED`, …) with position-masked shaders | Rename to `nabla.light.*` and drop the code                                                            |
| Rear road wash path            | `view.ts` limits the anchored rear wash to bikes, `nabla.truck` and trailers; other cars use `groundGlow`                                                       | Use the anchor wherever the model has `light.tail.brake`                                               |
| Paint materials                | Adapters match `Pintura*`, `Llanta*`, `Cromo*`, `White paint*`, `fh_paint`, `fh_glass` by name                                                                  | `nabla.paint`, `nabla.paint.chrome`, … naming + one generic paint path                                 |
| Per-vehicle options mounts     | `visual.attachments` already means cargo GLBs                                                                                                                   | A new `mounts` list (anchor + options) so lights, mirrors, exhaust, sounds and smoke are one mechanism |
| Other sounds / smoke           | `audio` covers engine and gearbox only                                                                                                                          | Extend the same `audio` block                                                                          |
| Police beacons, ship interiors | Code (`PoliceEquipment`, `ship-lights.ts` prefixes `Shutter`, `Interior_Wall_`, `Hull_Wall_`)                                                                   | Out of scope for the vehicle manual                                                                    |

### Hard-coded per-model names in the engine (audit)

| Where                                                                                | What                                                                               | Status                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `src/render/entity/view.ts` (bike mount)                                             | Node `Exhaust_Outlet_Closure`                                                      | **Migrated**: `nabla.anchor = exhaust`, old name deprecated |
| `src/render/vehicle-presentation/light-tuning.ts`                                    | A regex of the VFR model URL with fixed rear values                                | **Removed**: now `vehicle.lights.tuning` data               |
| `src/render/vehicle-presentation/authored-lights.ts`                                 | Lamp roles only from `extras.vehicleLightChannel`                                  | **Migrated**: `nabla.light.*` names; extras deprecated      |
| `src/render/entity/view.ts` (exhaust setup, `s3Outlets`, `truckOutlets`, smoke rate) | `presentation === 'nabla.s3'` / `'nabla.truck'` branches                           | Open (section 9)                                            |
| `src/render/entity/view.ts` (rear wash)                                              | `presentation === 'nabla.truck'` decides which vehicles get the anchored rear wash | Open                                                        |
| `src/catalog/presentation/road-vehicles.ts`, `a3-lamps.ts`, `a3-mounts.ts`           | Spanish node/material names of the S3, `Llanta 2`, paint materials by regex        | Open                                                        |
| `src/simulation/simulation.ts` (≈ line 2886)                                         | `body.url.endsWith('trailer.transporter.glb')`                                     | Open: should be a vehicle JSON flag                         |
| `src/render/entity/view.ts` (≈ line 1131)                                            | `body.url.includes('ship.container')` for the interior                             | Open: use `vehicle.interior`                                |
| `src/runtime/ar/vehicles.ts`, `xr-rc-controls.ts`, `game/ar.ts`                      | AR demo `kind` switch (`vfr`, `s3`, `truck`, `f14`, `forklift`)                    | Demo harness, open                                          |
| `src/runtime/random-vehicle.ts`                                                      | `presetVehicle('vfr800', …)` as the random bike                                    | Fine (names a preset, not a branch)                         |

### GLB files that must be renamed to comply

| Model                                          | Today                                                                                                                                                                          | Rename to                                                                                                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VFR800FI 1999 (`vfr800fi-1999(.quest).glb`)    | `Headlamp clear lens`, `Tail and brake red lens`, `Amber indicator L/R` with `vehicleLightChannel` extras; node `Exhaust_Outlet_Closure`                                       | `nabla.light.low`, `nabla.light.tail`, `nabla.light.indicator.l/.r`; exhaust node tagged `extras.nabla.anchor = "exhaust"`                                                                                                  |
| White truck tractor (`tractor.low/modern.glb`) | `Headlamp` (reverse), `Indicator` (marker), `Tail_stop`, `LowBeam_L/R`, `HighBeam_L/R`, `Fog_L/R`, `Indicator_Front_L/R`, `Indicator_Rear_L/R`, `Tail_Stop_L/R`, `Reverse_L/R` | `nabla.light.reverse`, `nabla.light.marker`, `nabla.light.tail`, `nabla.light.low.l/.r`, `nabla.light.high.l/.r`, `nabla.light.fog.l/.r`, `nabla.light.indicator.l/.r`, `nabla.light.tail.l/.r`, `nabla.light.reverse.l/.r` |
| White truck trailers (`trailer.*.glb`)         | `Headlamp.001`, `Tail_stop.001`, `Indicator_L/R`, `Tail_stop_L/R`, `Headlamp_L/R` (reverse), `Trans Plastic_L/R` (side only, no channel)                                       | `nabla.light.reverse`, `nabla.light.tail`, `nabla.light.indicator.l/.r`, `nabla.light.tail.l/.r`, `nabla.light.reverse.l/.r`; decide the role of `Trans Plastic`                                                            |
| S3 (`a3.cabrio.glb`, `s3.body-low.glb`)        | No named lamp materials; lamps found by Spanish names in code; mirror lens `Llanta 2`                                                                                          | `nabla.light.*` materials per lamp, `extras.nabla.mirror` on the lenses, exhaust anchors                                                                                                                                    |
| Ferrari J50 (`j50.body.glb`)                   | Nodes `Lights_M_2018_Ferrari_J50_BrakeLights`, `…HeadLightsBase`, `…HeadLightsChrome`, `…DRLs`, … with no lamp binding                                                         | Name their emissive materials `nabla.light.tail`, `nabla.light.low`, `nabla.light.position` (DRLs)                                                                                                                          |

Both models of a pair (`…glb` and `…-quest.glb` / `-low.glb`) must be renamed together: they share
anchors and names.

## 10. Worked example: from the S3 JSON to a Ferrari

The Ferrari J50 is the proof that a car works from the S3 file with a new model. Start from
`s3.json` and:

1. Change `id`, `label`, `name`, `color`, `size`, `mass`, `clearance`.
2. Remove `visual.presentation` (`"nabla.s3"`). That id pulls in S3-only code (Spanish lamp
   selectors, the `Llanta 2` mirror lens, two exhaust outlets at fixed positions). Without it the
   vehicle is a plain, data-driven one: physics, sound, wheels, steering wheel and the lights of
   section 5 work; mirrors, cluster and exhaust smoke need the adapters of section 9.
3. Point `visual.body.url` at the new body GLB; set `visual.wheel(s)` and `visual.steering`.
   Give the GLB the anchors of section 3 (wheels, `steering`, `driver.seat`, `driver.eyes`) and
   keep `"rig": "glb"` so the rig is extracted.
4. Replace `vehicle.colliders`, `wheelRadius`, `suspensionRest`, `stiffness`, `drivenWheels`
   (the J50 is `"rear"`), `powertrain` (`powerCv` 600, `torqueNm` 650, its modes), `mass`.
5. Sound: `vehicle.audio.engine` / `engineModes`.
6. Lights: name the lamp materials `nabla.light.*` in the GLB, and if the rear wash needs moving
   add `vehicle.lights.tuning` (`rearY`, `rearZ`, `rearIntensity`, `rearReach`; see the caveat
   at the end of section 5); add `vehicle.lights.lensEmissive` for a lens that should glow white.
7. Run `npm run check`. The schema is strict: a misspelt field fails validation.

## 11. How this document was verified

- The JSON fields are read from `src/entity/vehicle/field.ts`; `test/render/vehicle-light-tuning.test.ts`
  parses the shipped VFR JSON through `vehicleLightsField` and asserts the values of section 4.
- `test/render/asset-light-targets.test.ts` covers the naming convention
  (`lampFromMaterialName`) and the lens colour path.
- The GLB tables come from reading the materials, node `extras` and lamp nodes of every GLB in
  `assets/library` on 2026-10-18.
