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
Its yaw hinge is intended for this flat test surface; interactive coupling and
pitch/roll articulation are not yet implemented. Models come from `1cca41f`,
using Engine's existing physics world rather than the prototype's standalone rig.
For automated scenarios, `&vehicle=white-truck` or `&vehicle=carrier` selects the
initial occupied vehicle. Unknown presets report an error.

Controls: WASD, Space to brake/jump, C for cameras, E to enter/exit, R for recovery,
H for vehicle lights, G for the car's retractable GPS, K for high/low beams, V for supported flight, F for docking and T for control transfer. Click the canvas
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

| Parameter | Default                                   | Meaning                                                |
| --------- | ----------------------------------------- | ------------------------------------------------------ |
| `lat`     | `43.3372`                                 | Spawn latitude                                         |
| `lon`     | `-1.7523`                                 | Spawn longitude                                        |
| `alt`     | `50`                                      | Geographic origin altitude in metres                   |
| `vehicle` | `car`                                     | Installed preset                                       |
| `tiles`   | None (required in static geographic mode) | Application-owned tile base without trailing `/z`      |
| `static`  | `true`                                    | Static manifests; `false` uses the preparation service |

Zero is valid for latitude, longitude and altitude. No cartographic coverage does
not imply a different coordinate system.

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
