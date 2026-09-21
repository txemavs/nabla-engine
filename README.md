<p align="center"><img src="assets/brand/source.svg" width="100" height="100" alt="Nabla" /></p>

# Nabla Engine

An independent foundation for **editing a scene and playing in the same world**.
The TypeScript engine owns scene data and physics. The browser playground connects
it to rendering, input and persistence. Agency integration is a future consumer,
not a dependency of the engine.

## Run locally

Requires **Node.js 22.12 or later** and npm.

```bash
npm ci
npm run dev
```

Open [localhost:5173](http://localhost:5173). Models, the authored ground image,
Earth texture and branding are bundled. Connected maps use Esri or CARTO;
**Sin conexión** selects local resources instead. No account is required.

The playground UI remains in Spanish. Documentation is in English; the
[controls guide](docs/controls.md) includes the corresponding UI labels.

## Current working tree: 0.2.0 baseline + Stargate prototype

- Validated JSON scenes, rigid transform hierarchies, undo/redo and local saving.
- Optional fixed Stargates with linked live views, editable destinations and walker/vehicle traversal.
- A shared physics world for hover exploration, walking, driving, obstacles and movable objects.
- First-person monitor exploration with a third-person toggle and provisional hitscan sidearm.
- Original Audi A3 Cabrio body, wheels and steering wheel, with interior camera.
- A 5 × 10 m carrier: drive into its garage, latch the car, travel and release it.
- Ground and assisted drone flight modes, altitude hold and mode 2 gamepad input.
- A GPS origin, Madrid by default, with a browser location request and editable coordinates.
- Agency's road JPEG beneath editable geometry, satellite/street imagery and a planetary view.
- Earth, Sun and Moon, a selectable date/time or live clock, day/night lighting and a shared horizon haze.

Select **Escena A3** to load the current example if an older scene is saved in your
browser. Loading the example is undoable and does not overwrite the saved copy.
**+ Stargates** adds a linked pair to the current scene without replacing it.
**Jugar** creates a fresh simulation; **Detener** restores the edited scene.

## Repository layout

| Path                       | Responsibility                                                        |
| -------------------------- | --------------------------------------------------------------------- |
| `src/`                     | Scene contracts, editing, physics, geographic/sky helpers and presets |
| `src/*.test.ts`            | Unit and physical interaction tests, alongside the implementation     |
| `playground/`              | Reference browser host: rendering, UI, assets and input               |
| `tests/`                   | Playwright browser journeys                                           |
| `assets/`                  | Original vehicle models, ground/Earth images and official logo        |
| `docs/`                    | Controls, architecture, asset conventions and integration guide       |
| `.github/workflows/ci.yml` | Checks, production builds and browser tests                           |

`dist/`, `demo-dist/`, `test-results/` and `node_modules/` are generated and ignored.

## Documentation

Start with the [documentation index](docs/README.md).

- [Controls and walkthrough](docs/controls.md)
- [Architecture and invariants](docs/architecture.md)
- [Vehicles and mobile garage](docs/vehicle-assets.md)
- [Geography, horizon and sky clock](docs/geography.md)
- [Agency integration boundary](docs/agency-integration.md)
- [Asset provenance](assets/README.md)
- [Contributing and validation](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## Consume the engine

Version **0.2 breaks the earlier extraction's API**. The package has not been
published to npm or integrated into Agency as part of this baseline.

```bash
npm run build
npm pack
# From the consuming project:
npm install /path/to/nabla-engine-0.2.0.tgz
```

```ts
import { SceneEditor, Simulation, createSampleScene, idleInput } from '@nabla/engine'

const editor = new SceneEditor(createSampleScene())
const game = new Simulation(editor.document)
game.setInput({ ...idleInput(), forward: 1, yaw: 0 })
game.step(1 / 60)

const player = game.player
const car = game.entityTransform('car-a')
// Apply snapshots to the host's render objects.
game.dispose()
// editor.document still contains the authored scene.
```

The host owns input, rendering, persistence, location permissions and map requests.
Serve the packaged `assets/` directory at the application root to preserve the
example's `/world/`, `/geography/` and `/brand/` URLs, or explicitly adapt those URLs.

## Validate

```bash
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
npm pack --dry-run
```

The physics tests do not require WebGL. CI runs the same checks. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow.

## Boundaries

This is a working foundation, not a finished open-world game. Map imagery does not
supply terrain elevation, physical buildings or road geometry. Drone flight is
assisted, with an explicit accelerated travel mode, not orbital mechanics. General
high-speed collision safety is not guaranteed by the discrete solver.

The [Stargate prototype](docs/portals.md) supports fixed upright mouths; moving
carrier mouths, CSS interiors and seamless partial-body crossing are future work.
There is no NPC navigation, multiplayer, skeletal animation, inherited
scale or interactive GLB import yet. Dynamic physics bodies and the player spawn
must be roots; visual children are supported. The character uses a box collider
with an optional ground-following hover controller; the walking controller has no automatic stair climbing. Standard gamepads are supported, but custom
radio calibration and touch gameplay controls are not implemented.

The previous implementation remains in Git history. The portal design and remaining
acceptance stages are recorded in [the portal guide](docs/portals.md).

## License

Source code: [MIT](LICENSE). See [asset provenance](assets/README.md) for bundled
artwork and external map attribution; the code license does not grant rights to
third-party trademarks or map imagery.
