# Engine overview — start here

This is the guide for someone (or some agent) who has never opened this repository. It says
what the Engine is, where things live, how the pieces fit together, and what you should
**not** rebuild because it already exists. Each section links to the detailed document or
source file; this page does not replace them.

> Rules that apply to every change in this repository are in
> [AGENTS.md](../AGENTS.md) and in the
> [UI/UX rule](ui-ux-pattern.md). In short: no per-vehicle lighting/colour/material
> exceptions, no URL parameters as configuration, and no new HUD pattern.

## 1. What the Engine is

`@nabla/engine` is a browser game engine for a real-terrain driving/walking world: Three.js
rendering, a Rapier-based simulation, a streamed planet (terrain "cells" published by the
Atlas), vehicles, weapons and an HTML menu. It is consumed in two ways:

- **Standalone game** in this repo (`game/`, served by `npm run dev`). Spanish UI strings.
- **Host applications** that import the package and compose their own HUD and content. The
  production host is **Euskadi Online** (`txemavs/euskadi`), see
  [section 8](#8-how-euskadi-online-consumes-the-engine).

## 2. Architecture in one page

| Layer                     | Where                                    | Responsibility                                                                                          |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Config (code only)        | `src/config/*.ts`                        | Defaults: lighting, performance, input bindings, physics tuning. See [Configuration](configuration.md). |
| Scene document / entities | `src/scene/`, `src/entity/`              | Schemas (zod) for entities, vehicles (`src/entity/vehicle/field.ts`), lights, portals, roads.           |
| Simulation                | `src/simulation/`                        | Physics world, vehicles, avatar, weapons (`src/simulation/weapons/`), scenery poles. No DOM.            |
| Planet                    | `src/planet/`, `src/render/planet/`      | Cell contract/manifests (`src/planet/contract.ts`, `atlas-z15.ts`), streaming (`PlanetWorld`).          |
| Rendering                 | `src/render/`                            | `SceneView`, entity views (`src/render/entity/`), vehicle presentation, light rig, post-process.        |
| Catalogues                | `src/catalog/`                           | Vehicle presets (`vehicles/`), weapons, props, presentation adapters.                                   |
| Runtime                   | `src/runtime/browser.ts` (`GameRuntime`) | Wires everything for a browser: input, camera, audio, touch rigs, toolbar, clock, streaming.            |
| Game shell / menu         | `game/`                                  | The standalone game and the HTML menu (`settings-hud.ts`, one `*-ui.ts` file per control).              |
| Assets                    | `assets/library/`                        | Vehicle/weapon recipes (JSON) and GLBs.                                                                 |

Dependencies point downwards: `simulation` never imports from `render`; `render` never imports
from `game`. See [Architecture](architecture.md), the [module map](architecture/module-map.md)
and [simulation](architecture/simulation.md). Tests under `test/architecture/` enforce several
of these rules (for example `input-bindings.test.ts` forbids hard-coded keyboard keys outside
`src/config/input-bindings.ts`).

### Frame loop, briefly

`GameRuntime` (`src/runtime/browser.ts`) owns the loop: read input (`GameInput`, merged from
keyboard, gamepad and the touch rigs `TouchDriving` / `TouchFlight` / `TouchWalk`), step the
`Simulation`, update the camera, let `SceneView` sync meshes to entities, let `PlanetWorld`
stream cells around the player, render. The runtime exposes a small public API (`placeVehicle`,
`spawnVehicle`, `setSkyClock`, `pause`, …) that hosts use; hosts do not reach into the
simulation.

## 3. Loading Z15 terrain cells

Terrain is not part of the repo. It is published by the Atlas as one folder per Z15 cell plus a
manifest, and the engine streams the cells near the player.

- **Base URL.** Production hosts point the engine at
  `https://atlas.chained.world/euskadi/terraform/z/` (the cell path is `…/z/15/<x>/<y>/`).
  Locally, `NABLA_TERRAIN_DIR` serves a folder at `/terrain` and a host may pass
  `tiles` to `GameRuntime` (see `PlanetSourceOptions` in `src/render/planet/world.ts`).
  A browser cannot fetch the S3 origin from `localhost` (no CORS): use the local proxy/Atlas
  folder when developing.
- **Manifest and `cellVersion`.** Each cell has a `manifest.json`. Its `cellVersion` declares
  how the cell is built (absent means 1; the package's own `cellVersion` must agree).
  The set the engine renders is `PLANET_CELL_VERSIONS` in `src/planet/contract.ts`; any other
  value is refused with `Unsupported cell version …`. Version 2 and later cells carry the
  unified Atlas ground (`terrain.lidar`: LiDAR relief with roads and tunnel openings built
  in), used whatever `relief` asks, and a single ground texture; version 1 cells use the older
  engine terrain. This is why an engine older than the v2+ support renders new cells with doubled
  asphalt and loose layers: **the engine must be at least as new as the newest cell version
  published.** Parsing lives in `src/planet/atlas-z15.ts` (its header lists every role the
  manifest can declare and which ones the engine consumes); the file-level contract is in
  [terrain-folder.md](terrain-folder.md).
- **Upload order (producers).** Assets first, **manifest last.** A cell is only visible to the
  engine once its `manifest.json` exists, and the manifest lists verified files (sizes/hashes),
  so uploading files before the manifest means a half-uploaded cell is never half-loaded.
  Never overwrite a manifest before its files are in place.
- **Streaming.** `PlanetWorld` (`src/render/planet/world.ts`) plans which cells to fetch around
  the player, installs them, retires far ones, and decides photo quality per cell (`full`
  within `nearCells` — the «Distancia de detalle del suelo» setting — otherwise `lo`).
  See [planet streaming](architecture/planet-streaming.md) and
  [map zoom streaming](architecture/map-zoom-streaming.md). Z16 transition notes:
  [z16-transition.md](z16-transition.md).

## 4. Vehicles: definition and spawn

A vehicle is **data first**.

1. **Recipe (JSON).** `assets/library/<family>/<vehicle>/<name>.json` (families: `cars`,
   `trucks`, `motorcycles`, `boats`, `ships`, `aircraft`, `planes`). It is validated by the
   schema in `src/entity/vehicle/field.ts`: `size`, mass, suspension, engine/brake force,
   seats, camera distance, `mirrorTilt` / `mirrorAim`, `audio`, and the `visual` block (GLB
   URL, local transform, `presentation` id). Example: the motorcycle in
   `assets/library/motorcycles/vfr800fi-1999/vfr800.json`. How to author one:
   [Creating a vehicle](creating-a-vehicle.md), [vehicle assets](vehicle-assets.md),
   [vehicle appearance](vehicle-appearance.md), [motorcycles](motorcycles.md).
2. **Preset registry.** `src/catalog/vehicles/` (`library.ts`, `index.ts`) turns the recipes
   into presets: `hasVehiclePreset`, `presetVehicle`, `presetEntities`. Generated rig data is
   in `generated-rigs.ts`.
3. **Runtime.** The `vehicle` block selects a physics runtime: wheeled
   ([wheeled runtime](architecture/wheeled-runtime.md); two-wheelers add the `twoWheeled`
   behaviour: lean, wheelie, stoppie, burnout/donut), boat/flight
   ([boat-flight runtime](architecture/boat-flight-runtime.md)). Control profiles
   (`src/runtime/control-profiles.ts`, [vehicle controls](vehicle-controls.md)) decide which touch
   rig and HUD readouts the seat gets; keys live in `src/config/input-bindings.ts`
   ([controls](controls.md)).
4. **Spawn.** `GameRuntime.placeVehicle` / `spawnVehicle` / `addVehicles` install entities from a
   preset at a position. Hosts describe extra vehicles in geographic coordinates
   (`game/host-vehicles.ts`: `lat`, `lon`, `heading` clockwise from north, optional `alt`,
   `vehicle` id, `color`, trailers) and call `installHostVehicles` after terrain is ready. The
   player start is `lat`/`lon`/`heading`/`vehicle`. The Settings → Objetos tab has «Añadir
   vehículo» and «Exportar posición de vehículos» (JSON ready to paste into a host config).
5. **Entering/leaving.** [Vehicle interaction](architecture/vehicle-interaction.md).

## 5. What attaches to a vehicle

Everything below is created from the vehicle's **presentation** when its entity view is built
(`src/render/entity/view.ts`), through an adapter chosen by `visual.presentation`
([equipment guide](architecture/vehicle-equipment.md), `src/catalog/presentation/`,
`src/render/vehicle-presentation/`).

| Thing                                       | Source of its position                                                                                                                     | Code                                                                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Headlamps, tail/brake, indicators, reverse  | Authored in the GLB: nodes with `extras.nabla.anchor`, emissive materials with `vehicleLightChannel` (`Tail_Stop`, …), KHR punctual lights | `authored-lights.ts`, `car-lights.ts`, `headlamp.ts`                                                                |
| Road wash of lamps (ground glow, rear glow) | **Code constants** from the chassis `size` (not from GLB anchors)                                                                          | `render/vehicle-presentation/light-rig.ts`                                                                          |
| Mirrors                                     | Lens meshes in the GLB (cars: lens material/anchor or `vehicle.mirrors`; bikes: `mirror_L`/`mirror_R` parts) + JSON aim                    | `render/entity/car-mirrors.ts`, `render/vehicle-presentation/motorcycle-mirrors.ts`, `vehicle.mirrorAim/mirrorTilt` |
| Instruments                                 | Named GLB anchors + recipe                                                                                                                 | `car-instruments.ts`, `motorcycle-instruments.ts`                                                                   |
| Steering wheel / driver                     | Presentation adapter + driver pose controls                                                                                                | `steering-wheel.ts`, `rider-head.ts`                                                                                |
| Weapons                                     | Held by the avatar/driver, not by the vehicle; `Q` is reserved for weapons                                                                 | `src/simulation/weapons/`, `src/catalog/weapons/`                                                                   |
| Touch controls / HUD                        | Control profile of the seat                                                                                                                | `touch-driving.ts`, `touch-walk.ts`, `game-toolbar.ts`                                                              |

### Scenery physics (signs, traffic lights)

Small streamed scenery that must react to the player (sign posts that can be knocked down,
solid traffic-light poles) shares **one** service: `runtime.sceneryPhysics`
(`src/runtime/scenery-physics.ts`, class `SceneryPhysics`). A host registers a layer per kind of
scenery (`layer('signs', { movable: true })`, `layer('traffic-lights', { movable: false })`) and, on
every streaming refresh, calls `begin()`, `add(key, x, ground, z, height)` for each wanted pole
and `end()`. The service gives a body only to poles inside the shared radius around the player
(default 30 m, editable 5–150 m under Mundo → Opciones → Señales de tráfico, defaults in
`src/config/scenery-physics.ts`), caps bodies per layer (48), remembers knocked-down poses
of movable layers while they stream out, and returns the live pose for rendering
(`transform(key, matrix)`). Bodies come from `Simulation.createSceneryPole`.

Lamp posts and tree trunks use the same service as a third, **world** layer (`field-lights`, created
by the runtime when field lights are on; `FieldLighting.update({ scenery })` feeds it from
`FieldLights.poles()`). A world layer is always solid and differs from the sign layers only by its
options: it ignores the on/off switch and the editable radius (they are for signs and traffic
lights), selects poles within 65 m of **any** actor (the player and every vehicle, 3D box distance,
as the planet trimesh set does), has no body cap, builds at most 3 ms of bodies per refresh nearest
first, and gives each pole its own half size and the planet's static surface material
(`createSceneryPole(..., { half, solid })`). `Simulation.setPoles` and the pole path inside
`PlanetCollisions` are gone; tile-provided poles in `PlanetCollisionTile.poles` are unchanged.
The street-light **budget** (`Streetlights`, how many lamps cast light) is rendering and stays
separate. See [generalization candidates](generalization-candidates.md).

Colour, lighting and material values are not per-vehicle code: they are shared tuning
(`src/config/lighting.ts`, `light-tuning.ts`) and the GLB. See
[generalization candidates](generalization-candidates.md) for what is still ad hoc here and a
proposal for a single data-driven "attachments" mechanism.

## 6. Layers, defaults and configuration

- **Defaults are code.** `src/config/*.ts` (performance profile `browserPerformanceDefaults`,
  lighting, input, camera FOV default, `lightTuningDefaults`). Changing a default means
  changing the file and rebuilding. Precedence: browser defaults → named quality preset →
  explicit host override ([Configuration](configuration.md)).
- **Player settings** are saved in `localStorage` by each control in the menu (for example the
  terrain layer choice under `nabla.terrain.layers`, `game/layers-ui.ts`) and are applied on
  top of the code defaults. Resetting is `game/reset-settings.ts`.
- **Terrain layers** (asphalt, buildings, trees, water, …) are `TILE_LAYERS` in `src/render`;
  the menu section «Capas» toggles them live. Hidden layers are a player choice, not a host
  configuration.
- **No URL parameters as configuration.** The standalone engine game still accepts a few
  developer parameters (for example `?terrain=`, `?vehicles=`, `?layers=`), documented in
  [local development](local-development.md). **Hosts, and Euskadi Online in particular,
  configure everything in code** (`demo-config.ts`, `euskadi-boot.ts`) and ignore URL
  parameters; do not add new ones.
- **Authored content stays in its topic file** (vehicle JSON, scene document, `field.ts`
  schemas). Do not create a competing global table.

## 7. UI

The menu, HUD and clock follow one fixed pattern: read [UI/UX pattern](ui-ux-pattern.md) before
touching anything visible.

## 8. How Euskadi Online consumes the engine

`txemavs/euskadi` contains **no engine code**. It contains an overlay and a pin:

| File                          | Role                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `ENGINE_REF` (line 1)         | The exact `nabla-engine` commit to build against. Pin a commit that is on engine `main` and whose CI passed.                 |
| `demo-config.ts`              | Hard-coded demo defaults: start position/heading/vehicle, parked vehicles (including trailers), clock.                       |
| `euskadi-boot.ts`             | Intro, ENTER screen, credits, music, reveal timing; hides game chrome until gameplay starts.                                 |
| `euskadi-hud.ts`              | Host HUD (title, clock-as-Menú, contextual button rows). Reuses engine tokens from `src/runtime/interface-theme.ts`.         |
| `vite.euskadi.config.ts`      | Build config; hands the runtime to the HUD as `window.euskadiRuntime`.                                                       |
| `euskadi-run/build-static.sh` | Builds the static bundle: checks out the engine at `ENGINE_REF`, **copies the overlay files to the engine root**, runs Vite. |
| `GAME.md`                     | Game-level notes (credits text, spawn, intro sequence). Engine documentation is _this_ folder.                               |

Consequences you must remember:

- Overlay files are copied to the **engine root**, so their imports of engine files are
  `./src/…` (not `../../src/…`). A wrong relative import only fails in the SysOp build.
- To ship an engine change to Euskadi: merge it to engine `main` → update `ENGINE_REF` line 1 to
  the new engine commit → merge in Euskadi. **SysOp deploys**; agents never deploy to
  euskadi.online, and never upload terrain (producers upload assets first, manifest last).
- The pre-production copy on `:8707` serves the engine checkout directly (hot reload). Build in a
  temporary folder and swap `dist` only when complete; never run `npm run build` inside a served
  folder.

## 9. What not to redo

- A new menu, window system or button style: use `game/settings-hud.ts` and
  `src/runtime/interface-theme.ts` ([UI/UX pattern](ui-ux-pattern.md)).
- Hard-coded keys: add them to `src/config/input-bindings.ts`; the Teclas page is generated from it.
- A second physics or light system for a new kind of object: check
  [generalization candidates](generalization-candidates.md) first.
- Per-vehicle colour/lighting/material hacks: not allowed; fix the shared tuning or the asset.
- Terrain handling in a host: the engine already streams, verifies, caches and falls back.
- Hand-edited generated reference under `docs/reference/` — regenerate it (`npm run docs:generate`).

## 10. Everyday commands

| Command                     | Purpose                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `npm run dev`               | Standalone game dev server (see [local development](local-development.md)).         |
| `npm run check`             | Rigs, docs check, format check, build, typecheck, tests, game build (what CI runs). |
| `npx prettier --check docs` | Markdown formatting (CI fails otherwise).                                           |
| `npm run docs:check`        | Generated reference is up to date (`npm run docs:generate` regenerates it).         |

Index of all documents: [docs/README.md](README.md).
