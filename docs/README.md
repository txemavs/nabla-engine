# Documentation

Narrative guides for Nabla Engine. Documentation that belongs to a code folder
lives next to that code. This index stays with product vision, architecture,
usage, operations, decisions, studies and archive.

The playground UI stays in Spanish; documentation is in English. UI labels are
quoted where needed to locate a control.

Start with [Local development](local-development.md) to run the Docker stack, or
[Controls](controls.md) to edit, drive, fly and set location/time.

## How the tree is organized

| Kind                                                         | Where                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Product, architecture, usage, operations, decisions, studies | this `docs/` tree                                                                |
| Module contracts, how-tos and ownership                      | `README.md` (and a few named pages) beside the code                              |
| Generated signatures, JSDoc and call sites                   | `REFERENCE.md` in each source folder; index at [reference/](reference/README.md) |
| Dated measurements                                           | [benchmarks/2026-10-04](benchmarks/2026-10-04/) — left here, not next to code    |

`npm run docs:generate` rewrites the folder reference pages. `npm run docs:check`
and `npm run docs:links` verify that the reference is current and that relative
links resolve.

## Usage

| Guide                                        | Read it to…                                            |
| -------------------------------------------- | ------------------------------------------------------ |
| [Controls](controls.md)                      | Edit, drive, latch cargo, fly and select location/time |
| [Geography, horizon and sky](geography.md)   | GPS origin, maps and the sky clock                     |
| [Portals](portals.md)                        | Play and traversal contract                            |
| [Solid and building editor](solid-editor.md) | Points, lines, faces, extrusion                        |
| [Agency integration](agency-integration.md)  | Consume the engine without host conventions            |

## Architecture and decisions

| Guide                                                    | Read it to…                                     |
| -------------------------------------------------------- | ----------------------------------------------- |
| [Architecture and invariants](architecture.md)           | Ownership, units, validation and simulation     |
| [Code ownership](code-guide.md)                          | Dependency direction and how to write contracts |
| [Module map](architecture/module-map.md)                 | Public imports and which file to change         |
| [Planetary addresses](planetary-world.md)                | Working frames versus planet-wide identity      |
| [Real-world driving](real-world.md)                      | Streets GL boundary and streamed geography      |
| [Vehicle modularity](architecture/vehicle-modularity.md) | Issue #63 migration history                     |
| [Studio extraction](architecture/studio-extraction.md)   | Remaining editor parity                         |
| [Planet streaming](architecture/planet-streaming.md)     | Grid migration record                           |
| [Map zoom policy](architecture/map-zoom-streaming.md)    | WebMercatorQuad decision                        |
| [Native tiles](architecture/native-planet-generation.md) | One-page address summary                        |
| [Performance lab](architecture/performance-lab.md)       | Studio Calidad / Diagnóstico                    |

## Operations

| Guide                                                             | Read it to…                                |
| ----------------------------------------------------------------- | ------------------------------------------ |
| [Local development](local-development.md)                         | Docker stack, activation and a source tour |
| [World cache](../services/world-cache/README.md)                  | Private OSM/elevation cache                |
| [Cache runbook](../services/world-cache/operations.md)            | Layers, queue, publish, backups            |
| [Native generation](../services/world-cache/native-generation.md) | Prepare/publish pipeline                   |
| [Unified publisher](../services/world-cache/unified-publisher.md) | Compose layout and volumes                 |
| [Performance status](performance.md)                              | Remaining work and measurement limits      |
| [Contributing](../CONTRIBUTING.md)                                | Checks and reviewable changes              |
| [Changelog](../CHANGELOG.md)                                      | Scope of this baseline                     |

## Studio product (this repo documents the boundary)

Studio is a layer over Engine. Reusable cameras, sound, HUD, input, vehicle reset
and driving feel live under `src/`. These pages describe the editor product.

- [Studio Desktop](studio-desktop.md)
- [Named projects](studio-projects.md)
- [Studio UI](studio-ui.md) · [UI next](studio-ui-next.md)
- [CSS interior prototype](css-interior-prototype.md)

## Studies and archive

- [Videotiro review](videotiro-review.md)
- [Streaming investigation](streaming-investigation.md)
- [geoEuskadi pilot](geoeuskadi-pilot.md)
- [Tile GLB pilot](tile-glb-pilot.md)
- [Performance review 2026-10-04](architecture/performance-review-2026-10-04.md)
- [Cleanup validation](architecture/cleanup-validation.md)
- [Benchmarks 2026-10-04](benchmarks/2026-10-04/)
- [Portals proposal (historical)](archive/portals-proposal-20260928.md)

## Code, by owner

| Area                    | Start here                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine layers           | [`src/README.md`](../src/README.md)                                                                                                                                                                                               |
| Config                  | [`src/config`](../src/config/README.md)                                                                                                                                                                                           |
| Vehicles                | [`src/catalog/vehicles`](../src/catalog/vehicles/README.md) · [create](../src/catalog/vehicles/creating-a-vehicle.md) · [assets](../src/catalog/vehicles/vehicle-assets.md) · [GLB rigs](../src/catalog/vehicles/vehicle-rigs.md) |
| Wheeled / boat / flight | [`src/simulation/vehicles`](../src/simulation/vehicles/README.md)                                                                                                                                                                 |
| Monitors                | [`src/render/monitors`](../src/render/monitors/README.md) · [create](../src/catalog/monitors/creating-a-monitor.md) · [editing](../src/render/monitors/editing.md)                                                                |
| Equipment               | [`src/render/vehicle-presentation`](../src/render/vehicle-presentation/README.md)                                                                                                                                                 |
| Simulation              | [`src/simulation`](../src/simulation/README.md)                                                                                                                                                                                   |
| Portals (code)          | [`entity/portal`](../src/entity/portal/README.md) · [`render/portal`](../src/render/portal/README.md)                                                                                                                             |
| Geography kernels       | [`src/math/geo`](../src/math/geo/README.md)                                                                                                                                                                                       |
| Planet                  | [`src/planet`](../src/planet/README.md)                                                                                                                                                                                           |
| Sea                     | [`src/render/planet/sea-surface.md`](../src/render/planet/sea-surface.md)                                                                                                                                                         |
| Viewer                  | [`src/viewer`](../src/viewer/README.md)                                                                                                                                                                                           |
| Game host               | [`game/`](../game/README.md)                                                                                                                                                                                                      |
| Generated reference     | [folder index](reference/README.md)                                                                                                                                                                                               |

[Asset provenance](../assets/README.md) stays with the artwork.
