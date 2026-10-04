# Game library mode

The reference `game/` application consumes public `@nabla/engine` entries. Engine
owns the session, render loop, cameras, input, effects and planetary environment;
the application supplies content, URL configuration and its HTML HUD.
This is the first extraction increment, not full Studio parity. See the
[remaining inventory](architecture/studio-extraction.md).

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

The reference vehicle is the car. Add `&vehicle=<preset-id>` for another installed
preset. Unknown presets report an error. The white-truck prototype still needs an
adapter and is not yet a compatible stock preset.

Controls: WASD, Space to brake/jump, C for cameras, E to enter/exit, R for recovery,
V for supported flight, F for docking and T for control transfer. Click the canvas
to focus and enable audio; drag to look. Standard gamepad axes use Studio's mixer.

Without `example=flat`, URL configuration selects geographic coverage:

| Parameter | Default                               | Meaning                                                |
| --------- | ------------------------------------- | ------------------------------------------------------ |
| `lat`     | `43.3372`                             | Spawn latitude                                         |
| `lon`     | `-1.7523`                             | Spawn longitude                                        |
| `alt`     | `50`                                  | Geographic origin altitude in metres                   |
| `vehicle` | `car`                                 | Installed preset                                       |
| `tiles`   | `https://atlas.chained.world/euskadi` | Tile base without trailing `/z`                        |
| `static`  | `true`                                | Static manifests; `false` uses the preparation service |

Zero is valid for latitude, longitude and altitude. No cartographic coverage does
not imply a different coordinate system.

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
