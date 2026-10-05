# Documentation

Start with [Local development](local-development.md) to run the complete Docker
stack and follow the guided source-code tour.

This documentation describes the working 0.2.0 baseline. The playground keeps its
Spanish interface; UI labels are quoted where needed to locate a control.

| Guide                                       | Read it to…                                                      |
| ------------------------------------------- | ---------------------------------------------------------------- |
| [Controls](controls.md)                     | Edit, drive, latch cargo, fly and select location/time           |
| [Videotiro review](videotiro-review.md)     | Understand the original layered scenarios and proposed reuse     |
| [Architecture](architecture.md)             | Understand ownership, units, scene validation and simulation     |
| [Vehicle assets](vehicle-assets.md)         | Understand the original models, mounts and carrier physics       |
| [Geography](geography.md)                   | Understand GPS, maps, planetary scale, horizon and the sky clock |
| [Agency integration](agency-integration.md) | Consume the engine without bringing host conventions into it     |
| [Asset provenance](../assets/README.md)     | Locate the original artwork and its sources                      |
| [Contributing](../CONTRIBUTING.md)          | Run checks and make reviewable changes                           |
| [Changelog](../CHANGELOG.md)                | Review the scope of this baseline                                |

The [Stargates and CSS interiors proposal](portals.md) records the next design,
including the Agency source review, the playable fixed-gate prototype and staged
acceptance criteria for carrier integration and CSS interiors. The prototype
preserves the edit/play contract and a single physics owner.

- [Solid and building editor](solid-editor.md): points, lines, faces, extrusion and the future entity catalog boundary.
- [Real-world driving](real-world.md): reviewed Streets GL integration boundary, streamed geography, local edits and the first playable milestone.

- [World cache operations](world-cache-operations.md): deployed cache layers, preparation queue, regeneration, publishing, backups and troubleshooting.

## Composable engine modules

- [Module map and compatibility](architecture/module-map.md)
- [Game library mode](game-library.md): Run the engine without Studio, with static tiles
- [Terrain folder](terrain-folder.md): Play on real nabla-atlas Z15 packages (`?terrain=<base>`), format mapping and deployment
- [Create a vehicle](creating-a-vehicle.md)
- [Create a monitor](creating-a-monitor.md)
- [Migration history](architecture/vehicle-modularity.md)

## Regional data pilots

- [geoEuskadi road-area comparison: import, preparation and remaining integration gates](geoeuskadi-pilot.md)

- [Studio Desktop foundation](https://github.com/txemavs/nabla-studio/blob/main/docs/studio-desktop.md): experimental dockable workspace, runtime boundaries and the migration sequence.

- [Named Studio projects](https://github.com/txemavs/nabla-studio/blob/main/docs/studio-projects.md): portable files, retained places, consistent geographic navigation and tabbed settings windows.

- [Planetary world model](planetary-world.md): global object poses, local working frames and destination-specific portal environments.
