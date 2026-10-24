<p align="center"><img src="assets/brand/source.svg" width="100" height="100" alt="Nabla" /></p>

# Nabla Engine

TypeScript scene, simulation and browser runtime for Nabla applications. Three.js owns rendering;
Rapier owns physics. The package is currently **0.3.9**; package.json is the version source of truth.

- **Engine**: reusable code in src/, published through the @nabla/engine package exports.
- **Reference game**: the browser host in game/, used directly and extended by Euskadi Online.
- **Euskadi Online**: a separate repository with its own demo setup, branding, assets and host hooks.
- **Studio**: the editor in the separate [nabla-studio](https://github.com/txemavs/nabla-studio) repository.

## Run locally

Requires **Node.js 22.12 or later** and npm. Run from this repository:

```sh
npm ci
npm run build
npm run dev
```

Open [the local plane](http://localhost:5174/?example=flat),
[a local GLB](http://localhost:5174/?model=/examples/flat-world.glb), or
[real Atlas terrain](http://localhost:5174/?terrain=/tiles&tile=16223/11997&relief=lidar).
The first two use bundled resources; real terrain needs the Atlas server. The Vite config proxies
/tiles to https://atlas.chained.world/euskadi/terraform. Production hosting needs the same proxy
when using /tiles; publishing static files alone does not provide it.

The game supports English, Spanish and Basque. See [controls](docs/controls.md).
[/headset.html](http://localhost:5174/headset.html) selects VR/AR pages. Remote headset access needs
a secure origin; Vite accepts NABLA_HTTPS_CERT and NABLA_HTTPS_KEY together for local HTTPS.

## Repository layout

| Path                           | Responsibility                                                          |
| ------------------------------ | ----------------------------------------------------------------------- |
| src/entity/, src/scene/        | Entity schemas, scene documents, transforms and undo history            |
| src/simulation/                | Physics, vehicles, characters, weapons and simulation workers           |
| src/render/, src/presentation/ | Scene rendering, terrain, effects and vehicle presentation              |
| src/runtime/                   | Session lifecycle, browser composition, input, audio and XR integration |
| src/planet/                    | Geographic contracts and terrain processing                             |
| src/catalog/, src/config/      | Presets and shared configuration                                        |
| game/                          | Reference browser host, boot, menus and UI bindings                     |
| assets/                        | Models, textures, rigs, bundled terrain and branding                    |
| services/                      | Terrain cache/generation, development gateway and multiplayer relay     |
| scripts/                       | Packaging, rigs, documentation and development tools                    |
| test/                          | Unit, physics, architecture and browser regressions                     |
| docs/                          | Architecture, integration and operating guides                          |

Generated outputs: dist/ is the library, game-dist/ is the static game. node_modules/, packs,
and other generated artifacts are managed by the package scripts.

## Build and validate

```sh
npm run build          # Library and declarations
npm run build:game     # Static desktop, test, HeadSet, VR and AR pages -> game-dist/
npm run typecheck
npm test
npm run check          # Complete repository validation
```

For browser regressions, install Chromium with npx playwright install chromium, then run
npm run test:e2e. See [CONTRIBUTING.md](CONTRIBUTING.md) for required checks.

## Host integration

Build the package before using it locally. npm pack produces a tarball whose name/version are
reported by npm; install that tarball from the consuming application. Public entry points include
@nabla/engine/runtime/browser, @nabla/engine/scene, @nabla/engine/vehicles and @nabla/engine/render.
Serve the packaged assets at the URLs your application configures.

Euskadi currently composes the reference game from an engine checkout pinned by its ENGINE_REF.
It overlays host modules and extends vite.game.config.ts; it does not maintain a second physics
or terrain implementation. Game-specific geography and content belong in the host.

[Game startup and host integration](docs/game-runtime.md) documents the active boot flow,
worker defaults, loading UI, profiling and the Euskadi boundary.

## Terrain generation and multiplayer

For your own terrain cache and generator, use the Docker/WSL instructions in
[Local development](docs/local-development.md). The stack starts with:

```sh
docker compose -f compose.dev.yaml up --build -d
```

Open http://localhost:8080/?example=flat. This stack is optional for bundled examples or published
Atlas tiles. Multiplayer uses the optional [relay](services/relay/README.md).

## Further reading

- [The Nabla Engine Manual](docs/manual/README.md): architecture, usage, content,
  deployment, executable examples, and maintenance guidance in English.

- [Documentation index](docs/README.md) and [Engine overview](docs/engine-overview.md)
- [Module map and API boundaries](docs/architecture/module-map.md)
- [Code guide](docs/code-guide.md) and [generated reference](docs/reference/README.md)
- [Configuration](docs/configuration.md), [UI conventions](docs/ui-ux-pattern.md), [asset packs](docs/asset-packs.md)
- [Vehicle definitions](docs/vehicle-definition.md), [weapons](docs/weapons.md), [networking](docs/net.md)

## License

Source: [MIT](LICENSE). See [asset provenance](assets/README.md) for artwork and map attribution.
