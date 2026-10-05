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

Controls: WASD, Space to brake/jump, C for cameras, E to enter/exit, R for recovery,
H for vehicle lights, G for the car's retractable GPS, K for high/low beams, V for supported flight, F for trailer hitch / carrier dock and T for control transfer. On-screen
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

| Field     | Required | Meaning                                                                 |
| --------- | -------- | ----------------------------------------------------------------------- |
| `lat`     | yes      | WGS84 latitude, degrees                                                 |
| `lon`     | yes      | WGS84 longitude, degrees                                                |
| `heading` | no       | Compass degrees clockwise from north (default 0)                        |
| `vehicle` | yes      | Catalog preset id (`car`, `a3`, `white-truck`, `white-trailer`, …)      |
| `alt`     | no       | Orthometric metres; omitted uses the scene origin altitude              |
| `color`   | no       | `#rrggbb` body paint (`entity.color`; White paint on truck/trailer)     |
| `tow`     | no       | `true` hitch this trailer to the previous tractor; or that tractor's id |

The same array can be a typed `HostVehicle[]` in game config (`parseGameConfig().vehicles`,
`installHostVehicles(runtime, origin, list)`) or a Vite build-time define:

```sh
VITE_NABLA_VEHICLES='[{"lat":43.3386,"lon":-1.7899,"heading":90,"vehicle":"white-truck"}]'
```

`?vehicles=` wins over `VITE_NABLA_VEHICLES`. A present empty `vehicles=` means
no extras. Unknown presets fail at startup. An entry whose footprint overlaps an earlier host vehicle
(for example a stall grid authored for a different heading) is skipped with a console warning
instead of being spawned inside it. The terrain-folder entry
(`?terrain=`) uses the same parameter.

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
`npm run build:fixture` regenerates the deterministic example. Run
`node scripts/runtime-smoke.mjs` against the game; `NABLA_GAME_URL` selects the
host and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects an installed browser.
Also verify a clean sibling application installed from `npm pack` output, so
ancestor dependencies and source-tree aliases cannot hide packaging problems.
