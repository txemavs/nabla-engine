# Game library mode

The reference `game/` application consumes public `@nabla/engine` entries. Engine
owns the session, render loop, cameras, input, effects and planetary environment;
the application supplies content, URL configuration and its HTML HUD.
Studio Play uses this same browser runtime. See the
[ownership boundary](architecture/studio-extraction.md).

`GameRuntime` from `/runtime` is the headless coordinator used by
the browser composition. It owns a PlaySession, camera state, input mixing and
gameplay actions; it does not create a renderer or attach DOM listeners.
`GameRuntime` from `/runtime/browser` supplies those browser resources around the
same coordinator. Its `game` property exposes that coordinator, and its existing
`session` property remains available for compatibility.

## Offline planetary example

```sh
npm run build
npm run dev:game
```

Open `http://localhost:5174/?example=flat`. Four Z15 tiles surround `(lon=0, lat=0)`,
providing approximately 2.44 × 2.44 km at sea level. The surface has no relief but
follows planetary curvature. The visible sea sheet is disabled over the synthetic
surface to avoid overlap; coordinates, sky and the planetary model remain active.
See [fixture details](../assets/examples/flat-z15/README.md).

The example starts in the car, with the white truck and flying container parked
beside it. Exit with E, walk to another vehicle and press E to board; there is no
vehicle selector. The truck starts with a six-wheel passive trailer attached.
Its yaw hinge is intended for this flat test surface. **F** hitches or
unhitches a nearby fifth-wheel trailer when driving a tractor (otherwise it
still docks a car in the carrier). Free trailers rest on landing legs. Models come from `1cca41f`,
using Engine's existing physics world rather than the prototype's standalone rig.
For automated scenarios, `&vehicle=white-truck` or `&vehicle=carrier` selects the
initial occupied vehicle. Unknown presets report an error.

`&engineMode=normal|beast` (or `bestia`) sets the start engine mode of cars that have modes (the
S3; default `normal`, D). See docs/monitors.md, «Engine modes».

Controls: WASD, Space to brake/jump, V for cameras, E to enter/exit, R for recovery,
H for vehicle lights, G for the car's retractable GPS, K for high/low beams, C for supported flight, F for trailer hitch / carrier dock and T for control transfer. On-screen
steer/pedal pads, brake, enter/exit and camera match Studio's tactile driving HUD
and mix with the keyboard and a standard gamepad. Click the canvas
to focus and enable audio; drag to look. Standard gamepad axes use Engine's shared mixer.
For LAN/Tailscale testing, the server must listen on the network interface.
HTTP IP origins use a portable SHA-256 verifier for tiles; checksums are still
mandatory. Keyboard controls work there. Gamepad access requires a browser
context that permits it (normally HTTPS or localhost) and is otherwise disabled.
The browser runtime clears keyboard commands on focus loss, captures key releases
before bubbling handlers, and expires movement keys after 1.5 seconds without
keyboard activity. Normal OS key repeats renew the whole held chord. A fresh
press is required after expiry; queued repeats cannot restart cleared controls.

Without `example=flat`, URL configuration selects geographic coverage:

| Parameter  | Default                                   | Meaning                                                                               |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `lat`      | `43.3372`                                 | Spawn latitude                                                                        |
| `lon`      | `-1.7523`                                 | Spawn longitude                                                                       |
| `alt`      | `50`                                      | Geographic origin altitude in metres                                                  |
| `heading`  | `0`                                       | Player compass heading, degrees clockwise from north                                  |
| `vehicle`  | `car`                                     | Possessed start preset                                                                |
| `color`    | none                                      | `#rrggbb` body paint for the start vehicle (same `entity.color` cars use)             |
| `vehicles` | none                                      | Extra host vehicles: JSON array of `{lat, lon, heading, vehicle, alt?, color?, tow?}` |
| `tiles`    | None (required in static geographic mode) | Application-owned tile base without trailing `/z`                                     |
| `static`   | `true`                                    | Static manifests; `false` uses the preparation service                                |

Zero is valid for latitude, longitude and altitude. No cartographic coverage does
not imply a different coordinate system.

### Extra host vehicles

`lat`/`lon`/`alt`/`heading`/`vehicle` remain the player start. To park more
drivable catalog vehicles at map places, declare a JSON array. After terrain is
ready the game converts each WGS84 point to local metres (`geoToLocal`) and
installs it with `GameRuntime.placeVehicle` (the same `addVehicles` path as
**Añadir vehículo**). Positions are geographic, not local XYZ.

```text
?lat=43.3372&lon=-1.7523&heading=118&vehicle=car&color=%232157a5&vehicles=[{"lat":43.3386,"lon":-1.7899,"heading":90,"vehicle":"white-truck","color":"#2157a5"}]
```

| Field     | Required | Meaning                                                                                                                                |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `lat`     | yes      | WGS84 latitude, degrees                                                                                                                |
| `lon`     | yes      | WGS84 longitude, degrees                                                                                                               |
| `heading` | no       | Compass degrees clockwise from north (default 0)                                                                                       |
| `vehicle` | yes      | Catalog preset id (`car`, `a3`, `white-truck`, `white-trailer`, …)                                                                     |
| `alt`     | no       | Orthometric metres; omitted uses the scene origin altitude                                                                             |
| `color`   | no       | `#rrggbb` body paint (`entity.color`; White paint on truck/trailer)                                                                    |
| `tow`     | no       | `true` hitch this trailer to the previous tractor; or that tractor's id                                                                |
| `box`     | no       | Trailer cargo: omit keeps the preset (`white-trailer` includes `white-box`); `false` is chassis only; `"white-box"` attaches that body |

The same array can be a typed `HostVehicle[]` in game config (`parseGameConfig().vehicles`,
`installHostVehicles(runtime, origin, list)`) or a Vite build-time define:

```sh
VITE_NABLA_VEHICLES='[{"lat":43.3386,"lon":-1.7899,"heading":90,"vehicle":"white-truck"}]'
```

`?vehicles=` wins over `VITE_NABLA_VEHICLES`. A present empty `vehicles=` means
no extras. Unknown presets fail at startup. An entry whose footprint overlaps an earlier host vehicle
(for example a stall grid authored for a different heading) is skipped with a console warning
instead of being spawned inside it. The terrain-folder entry
(`?terrain=`) uses the same parameter; a non-empty host list omits the built-in
parked demo row (`includeDemoFleet: false`) so a second carrier or A3 is not stacked.

### Host portals

Standalone Stargate portals (the black-frame `portal.frame.glb`) are listed the same way.
After terrain is ready (and after the host vehicles) each entry is converted with `geoToLocal`
and installed with `GameRuntime.placeEntities` — the same path as **Añadir portal** in the
add menu, so players can remove them from the list like anything they placed. An entry whose
`to` names another entry is linked to it once both stand; the rest stay closed and are linked
from the panel on the back of the frame, where every portal in the scene (standalone and the
carrier stern) is a destination.

```text
?portals=[{"name":"Plaza","lat":43.3381,"lon":-1.7667,"heading":60,"to":"Puerto"},{"name":"Puerto","lat":43.3392,"lon":-1.7631,"heading":240}]
```

| Field     | Required | Meaning                                                               |
| --------- | -------- | --------------------------------------------------------------------- |
| `name`    | yes      | Unique label shown in portal panels and the placed list               |
| `lat`     | yes      | WGS84 latitude, degrees                                               |
| `lon`     | yes      | WGS84 longitude, degrees                                              |
| `heading` | no       | Compass degrees clockwise from north you walk through it (default 0)  |
| `alt`     | no       | Accepted like host vehicles; frames always stand on the loaded ground |
| `to`      | no       | `name` of another entry to link to (each portal links at most once)   |
| `mode`    | no       | Link mode with `to`: `open` (traversable, default) or `window` (view) |

Typed alternatives: `parseGameConfig().portals` / `installHostPortals(runtime, origin, list)`,
or `VITE_NABLA_PORTALS` at build time. `?portals=` wins over the build value; a present empty
`portals=` means none. Invalid JSON, repeated names or unknown links fail at startup. The
terrain-folder entry (`?terrain=`) reads the same parameter.

### Host steering-wheel defaults

`?wheel=` (or `VITE_NABLA_STEERING_WHEEL` at build time) sets where the steering wheel starts
for each vehicle model, on top of its GLB pose. It is a JSON object keyed by vehicle preset id
(`car` is the S3, `a3`, `white-truck`, …) or by steering GLB URL. Values are metres along the
steering column (`distance`, + toward the instrument cluster) and vertically (`height`, + up),
each between -0.08 and 0.08:

```text
?wheel={"car":{"distance":0.015,"height":-0.005}}
```

A player's own choice from **Ajustes → Vehículos → Volante** is saved in `localStorage` and wins
over the host default; «Restablecer volante» returns to the host default. `?wheel=` wins over
the build value; a present empty `wheel=` means no host defaults. Unknown presets, presets
without a steering mesh and out-of-range values fail at startup. Embedding hosts pass the same
data as `GameRuntimeOptions.steeringWheel = { defaults, storage }` (keys are steering GLB URLs
there). See [Vehicle anchors](vehicle-rigs.md#driver-steering-wheel-adjustment-runtime).

### Host mirror defaults

`?mirrors=` (or `VITE_NABLA_MIRRORS` at build time) sets the mirror glass angles for each vehicle
model, on top of its baked aim. It is a JSON object keyed by vehicle preset id (`car` is the
S3, `a3`, `white-truck`, …) or by mirror model (`mirrorModelKey`). Values are degrees per side:
`yaw` (+ outward, − inward, ±15) and `tilt` (+ up, ±10):

```text
?mirrors={"car":{"left":{"yaw":-2},"right":{"yaw":-1.5,"tilt":0.5}}}
```

A player's own choice from **Ajustes → Vehículos → Espejos** is saved in `localStorage` and wins
over the host default; «Restablecer espejos» returns to the host default. `?mirrors=` wins over
the build value; a present empty `mirrors=` means no host defaults. Unknown presets and
out-of-range values fail at startup. Embedding hosts pass `GameRuntimeOptions.mirrors =
{ defaults, storage }` (keys are mirror models there). See
[Vehicle anchors](vehicle-rigs.md#driver-mirror-adjustment-runtime).

To play on real Atlas Z15 cells (LiDAR, orthophoto, buildings) use `?terrain=<base>`; see
[Terrain folder](terrain-folder.md).

Opening the demo without a terrain source reports a configuration error before
creating the runtime or requesting terrain. Use `?example=flat` for the bundled
offline surface, `?tiles=/my-tiles&lat=0&lon=0&alt=0` for local coverage, or
`?tiles=https://tiles.example.org/world&lat=0&lon=0&alt=0` for an external dataset.
`?tiles=/` explicitly selects this origin; missing or whitespace-only values do
not. Dynamic mode (`?static=false`) explicitly selects this demo's `/prepared`
and `/prepare` services, which the application must deploy or proxy.

### Migration: application-owned terrain

`DEFAULT_TILES_BASE_URL` has been removed from both the root export and
`@nabla/engine/planet/static-tiles`. Replace its imports with application
configuration and pass `tiles: { baseUrl, mode: 'static' }` to the browser runtime,
or `{ baseUrl }` to `fetchTileManifest`. Local paths and arbitrary hosts use the
same loader and manifest validation. No deployment host is selected by this API.
The demo's spawn defaults are application choices, not Engine defaults.

For a self-contained static dataset also set `horizon: false` and omit optional
external-data features such as `fieldLights`. Removing the old tile constant
does **not** finish the wider provider audit: coarse horizon elevation still has
an ArcGIS fallback, imagery uses ArcGIS, and legacy geographic preparation has
ArcGIS/Overpass defaults. Water data also has an OpenFreeMap fallback. These
providers need explicit per-instance source configuration in a follow-up; do not
interpret a custom tile base as a guarantee that all optional layers are offline.

## External application

```ts
import { GameRuntime } from '@nabla/engine/runtime/browser'
import { presetVehicle } from '@nabla/engine/vehicles'
import {
  createFlatTestScene,
  FLAT_TEST_BASE,
  FLAT_TEST_TILES,
} from '@nabla/engine/examples/flat-tile'

const vehicle = presetVehicle('car', 'player')
const game = new GameRuntime({
  canvas,
  scene: createFlatTestScene(vehicle),
  touchControls: 'always',
  sea: false,
  tiles: {
    baseUrl: FLAT_TEST_BASE,
    mode: 'static',
    tiles: FLAT_TEST_TILES,
    horizon: false,
  },
  onProgress: (status) => {
    statusElement.textContent = status
  },
  onFrame: ({ speedKmh }) => {
    speedElement.textContent = `${Math.round(speedKmh)} km/h`
  },
  onError: (error) => console.error(error),
})
await game.play({ vehicleId: vehicle.id })
// game.pause(); game.resume(); game.stop(); await game.play(...)
// game.dispose() releases owned resources; the host retains its canvas.
```

Serve the package's `assets/` at the application root. A Vite consumer can use
`publicDir: 'node_modules/@nabla/engine/assets'`. No aliases to Engine source or
Studio imports are required. Stock catalogs are generated as ordinary ESM during
package build; local `assets/custom` files are excluded from published catalogs.

For host-controlled scheduling, set `clock: 'manual'` and call `game.tick(time)`
with a `performance.now()`-compatible timestamp. Manual ticks are rejected in
automatic mode. `PlaySession` from `@nabla/engine/runtime/session` can be used
without creating a renderer or DOM listeners.

## Loading and deployment

Static files retain the existing contract:

```text
{base}/z/{zoom}/{x}/{y}/manifest.json
{base}/z/{zoom}/{x}/{y}/{terrain}.glb
{base}/z/{zoom}/{x}/{y}/{buildings}.glb
```

The worker checks GLB sizes and SHA-256 hashes. Startup waits for actual ground;
finite examples first load all declared tiles. A timeout rejects startup with
the provider status. It never proceeds over absent terrain. A 1 mm probe handles
float32 gaps at shared tile corners. Stop/dispose cancels pending startup.

Use HTTPS or localhost for crypto and caching. Remote providers need CORS on
manifests and models. Loading exposes provider errors through progress and the
startup rejection. The four-tile synthetic example makes no external requests.

`npm run build:game` produces `game-dist/`; deploy the whole directory.

The same release includes `/headset.html` (Nabla HeadSet launcher), `/xr.html`
(VR), `/ar.html` (AR), `/xr-demo.html` and `/ar-rc.html`. Euskadi Online's
publisher must copy these alongside `index.html`, the generated `assets/`,
`packs/`, rigs and other runtime resources. Do not filter the deployment down
to the desktop entry. The post-build step checks that all these pages and their
compiled entry scripts exist. Serve real HTML files before any SPA fallback.

These pages use the site's HTTPS origin; no local Vite server or separate
headset hosting is required. Publishing the npm engine library alone does not
publish the demo pages: the host deployment must include `game-dist/` too.
Production map endpoints must also be reachable from the host: Vite's local
`/terrain` folder and `/atlas-live` development proxy are not deployed services.
AR already selects the direct Atlas URL in production. Configure any terrain
routes used by XR for the production host before offering those map presets.

`npm run build:fixture` regenerates the deterministic example. Run
`node scripts/runtime-smoke.mjs` against the game; `NABLA_GAME_URL` selects the
host and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an installed browser.
Also verify a clean sibling application installed from `npm pack` output, so
ancestor dependencies and source-tree aliases cannot hide packaging problems.

### Shared interface theme (HeadSet and monitors)

All engine UI styles live in `src/ui/styles` (tokens first, then components); see
[UI theme](ui-theme.md) for the token list and how a host overrides them.

- Every game and panel page links `src/ui/styles/index.css`; the runtime installs the same
  sheets (`installEngineStyles`, `src/ui/styles.ts`) where a page has no link.
- Ship and container CSS3D panels and the settings window use `monitors.css` through
  `vehicleMonitorStyleText()`; transform and interaction layout remain intact.
- The AR/VR main menu canvas reads `interfaceTheme` (`src/ui/theme.ts`) directly. Its hit
  regions remain at their original size; pressed buttons change colour without moving.
- The calibration/quality HTML monitor receives `xrCalibrationStyleText` (tokens plus
  `xr-calibration.css`) through `MonitorOptions.styleText`. `HtmlMonitor` appends that trusted
  inline CSS to its rasterised document, so no external stylesheet fetch or per-frame CSS work
  is needed.

36 px is a minimum for world-space monitor controls, not a replacement for the authored
contact regions. Gauge graphics and physics are independent of the theme.

### Unified HeadSet entry

`headset.html` is titled **Nabla Engine** and has VR/AR tabs. VR builds the existing
`xr.html` URL from the place and vehicle selectors. Selecting AR lazily prepares
`game/ar.ts` in the same document, reusing its controls from the AR HTML template.
There is no iframe, second AR implementation, automatic navigation or synthetic click.
The visible Enter button is bound by the existing AR application, so `requestSession`
retains the real click's user activation. Preparation must finish before enabling Enter.
`configureARHost` reports session changes to hide/restore the launcher and suppresses
non-immersive render frames while embedded. Re-selecting the tab reuses the same runtime.
Standalone `ar.html` remains available for development.

### VR framed menu

Explicit VR entries (`xr.html` or `?xr`) use the engine's shared
`XRCalibrationScreen`. Controller X toggles the framed, grabbable monitor;
Quality, Options, Development, nearby Z15 loading, destination selection and exit
live there. FPS and terrain progress appear in the monitor. The browser only
shows grey Monitor and Enter VR buttons at the top right. Touch driving controls
are disabled for VR entries; physical in-world steering remains unchanged.
`bindXRQuality(runtime, [], false)` installs the same quality actions without
mounting a separate browser panel. Desktop Euskadi Online keeps its existing UI.

### Experimental drone

The AR monitor includes **Betaflight · experimental**, the Agency quadcopter
controller running in the shared Engine room world. See
[experimental-betaflight.md](experimental-betaflight.md) for provenance, controls,
physics composition and current limitations.

### Two-hand bow

AR's monitor can add the user-supplied recurve bow. Reusable draw rules are
exported by `@nabla/engine/weapons/bow`, and the optional XR adapter by
`@nabla/engine/xr/bow`. See [xr-bow.md](xr-bow.md) for controls, shared physics,
model binding and resource licensing.

### Basketball hoop and room contacts

AR's **Canasta** uses the same `XRStationPlacement` as driving controls and the
existing room balls, with a pinned hoop and an enceste counter. R/C vehicle
physical shapes now also push loose props in that shared world. See
[xr-hoop.md](xr-hoop.md) for composition, controls and scaling limitations.

### AR vehicle hits, detached trailers and brass audio

Picking a hitched trailer calls `XRScaledVehicles.beginGrab`, which releases the
existing Simulation hitch before relocation. Only the connected hitch assembly
moves or inherits the throw velocity; a detached tractor stays where it was.
`ARRC.targets` supplies visible vehicle meshes to the shared weapon ray query.
`ARRC.hit` delegates pane removal and fragments to SceneView's `brokenGlass` and
`destruction`, and body damage/impulse to Simulation. Vehicle roots keep their
room scale; fragment origins convert back to simulation metres.
Authored `Cabin` lights remain off independently of exterior position lights.
AR shell bounces now call the existing `VehicleAudio.casing` with the world
contact position and speed reported by `CasingMotion`, capped at three voices
per update. Resting brass emits no contact events or repeated sound.

### R/C F14 and shared aircraft presentation

`f14` is a normal vehicle preset, usable by Simulation and SceneView in desktop,
VR or AR. `vehicle.aircraft` selects jet audio and slow/fast speed tuning in the
existing `stepFlight` controller. `Simulation.setFlightSpeedMode(id, mode)`
changes the regime without teleporting or resetting velocities; telemetry
provides `flightSpeedMode` and `flightControls` to the common aircraft rig.
Legacy planes retain their existing propeller and flight defaults.

AR's **Radiocontrol → F14 Tomcat** uses the regular scaled vehicle host, grip,
throw, surface collisions and disposal portal. Left stick: up for thrust,
horizontal for rudder. Right stick: pitch and roll. B toggles slow/fast; the
monitor also exposes the current flight mode. X remains the monitor button.
Slow deploys the wings; fast sweeps them back. Differential stabilators follow
pitch/roll, and two emissive exhausts follow Engine's spool telemetry. This uses
asset metadata and the ordinary presenter; AR does not animate its own copy.
At 1:100 the 19.1 m aircraft is 19.1 cm long and travels at scaled speed.

### AR room origin through system menus and tracking interruptions

The shared XR session controller requests optional WebXR `anchors` in AR and
creates one session anchor at the calibrated room origin. Each tracked frame
locates that anchor in the native unbounded space and installs it as the common
render reference. This keeps room meshes, placed monitors/equipment and physics
in one coordinate system even when the headset changes its native origin.
Known `reset` transforms remain the fallback when anchors are unavailable. An
AR head recenter does not redefine an already established room origin.

During system menus, headset removal or missing viewer/anchor poses, the AR host
pauses placement, grabbing and physics updates. It resumes with zero elapsed
time when tracking returns; a tracking gap is not treated as a hand release.
The anchor is deleted at session end, including late asynchronous creation.
This preserves placement within an active session; restoring after session end
or page reload would additionally require persistent anchors and saved content.
See the [WebXR Anchors specification](https://immersive-web.github.io/anchors/).

### AR forklift and physical pallets

**Radiocontrol → Toro · tres palancas** loads the `forklift-rc` preset through
the same Simulation/SceneView as all R/C vehicles. Real controls now default on
for ground R/C vehicles (aircraft retain stick controls). Steering and trigger
throttle/reverse work as before. A separate station copies the model's three
lever groups beside the wheel, with spherical grip knobs: grip and pull/push
for lift, mast tilt and side shift. `XRForklift` supplies the existing
`Simulation.setForkliftInput` axes; the levers are never children of wheel spin.
The driving station has independent `ar-rc-forklift` calibration and the usual
body follow/grabbable placement/black pin button.

**Palé suelto** and **Palé + caja de 1 m** create bounded dynamic Engine box
entities from `catalog/props/pallet.ts`, at the active R/C scale. Their compound
plank colliders retain fork-entry gaps. They join the vehicle's own Simulation,
so load weight, forklift contacts, scanned room surfaces and gravity are solved
in the same world. Pickup/one or two hand placement/throw uses the existing
XRObjectGrab with generic `relocateEntities`/`releaseEntities`; original vehicle
methods delegate to those same operations. No scripted pallet attachment or
private lift solver is used. The shared `addPlaced` contract now accepts
standalone dynamic boxes as well as static scenery; other restrictions remain.

Up to 12 pallets are retained. The monitor's disposal portal removes individual
pallets; clearing the environment removes their bodies and presentation along
with the vehicle. Loaded pallets can tip or slip if the forks are poorly placed.

The R/C forklift's **AR · Volante toro** and **AR · Palancas toro** calibration
entries have independent XYZ and angles. The lever console is a sibling of the
wheel beneath the shared station anchor; wheel tilt does not affect lever
position/orientation. Both still follow the same body anchor and pin/grab as one
station. Existing stored wheel adjustments retain their meaning for the wheel;
the lever console starts from its original, unrotated layout.

### Shared controls catalog

Keyboard bindings, contextual priority and help are defined in
`src/config/input-bindings.ts`; see [configuration](configuration.md#actions-and-bindings).
The forklift uses P for its equipment menu so J/L can control mast tilt and K
can lower its forks. Other vehicles keep J. The game help follows the current
locomotion, weapon, aim and menu context instead of duplicating bindings in HTML.
