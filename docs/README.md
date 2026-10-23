# Documentation

**New here? Start with these three** (the documents written for day one):

1. [Engine overview](engine-overview.md): architecture, Z15 cell loading, vehicles,
   what attaches to a vehicle, configuration and layers, how Euskadi Online consumes
   the Engine, and what not to redo.
2. [UI/UX pattern — the rule](ui-ux-pattern.md): tabbed menu, clock as Menú button, HUD rows.
3. [Generalization candidates](generalization-candidates.md): ad hoc and duplicated systems,
   with a proposed per-vehicle attachments mechanism.

Then [Local development](local-development.md) to run the complete Docker
stack and follow the guided source-code tour.

See [Asset packs](asset-packs.md) for compressed model distribution, server
requirements, caching, build settings and reproducible loading measurements.

Most guides were written against the 0.2.0 baseline; the package is now 0.3.x. The interface is
translated (English, Spanish, Basque: `src/i18n/catalog.{en,es,eu}.ts`); guides quote the Spanish
labels where needed to locate a control.

## Game UI, input and multiplayer

| Guide                                                   | Read it to…                                                                   |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Settings menu](settings-menu.md)                       | Find a section in the tabbed menu (`SECTION_TABS`), map view, backups         |
| [UI theme](ui-theme.md)                                 | Change the look through tokens; regenerate `styles.generated.ts`              |
| [Controls](controls.md)                                 | Edit, drive, latch cargo, fly; menu options that change a key                 |
| [Assigned keys](teclas-asignadas.txt)                   | List every binding per context (Spanish, from `src/config/input-bindings.ts`) |
| [Weapon and camera controls](weapon-camera-controls.md) | Aim, camera and weapon keys on foot                                           |
| [Weapons](weapons.md)                                   | Understand the single owner of what a character carries (`WeaponLoadout`)     |
| [Net: game authority](net.md)                           | See who decides pickups, hits, claims and respawns (local vs relay)           |

Key contexts in short: on foot R is the right chest pocket, which holds the magazine
(`weapon.slotR`: with the pistol drawn it drops / inserts the magazine; VR/AR grabs from that
pocket are the same action); in a vehicle R is the horn and weapon keys are off; Y (`recover`)
always recovers the vehicle.

## Other guides

| Guide                                            | Read it to…                                                      |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| [Visibility distances](visibility-settings.md)   | Find draw, fog, road and collision distances in the menu         |
| [Impact sounds](impact-sounds.md)                | Know what rings when a shot hits metal, and add a surface kind   |
| [Vehicle control profiles](vehicle-controls.md)  | Pick the touch rig and HUD per vehicle; register new types       |
| [Videotiro review](videotiro-review.md)          | Understand the original layered scenarios and proposed reuse     |
| [Architecture](architecture.md)                  | Understand ownership, units, scene validation and simulation     |
| [Physics worker](physics-worker.md)              | Run physics in a Web Worker (`?physicsWorker=1`) and measure it  |
| [Vehicle assets](vehicle-assets.md)              | Understand the original models, mounts and carrier physics       |
| [Geography](geography.md)                        | Understand GPS, maps, planetary scale, horizon and the sky clock |
| [Experimental drone](experimental-betaflight.md) | Run the Agency quad controller in the shared AR room physics     |
| [Agency integration](agency-integration.md)      | Consume the engine without bringing host conventions into it     |
| [Asset provenance](../assets/README.md)          | Locate the original artwork and its sources                      |
| [Contributing](../CONTRIBUTING.md)               | Run checks and make reviewable changes                           |
| [Changelog](../CHANGELOG.md)                     | Review the scope of this baseline                                |

The [Stargates and CSS interiors proposal](portals.md) records the next design,
including the Agency source review, the playable fixed-gate prototype and staged
acceptance criteria for carrier integration and CSS interiors. The prototype
preserves the edit/play contract and a single physics owner.

- [Solid and building editor](solid-editor.md): points, lines, faces, extrusion and the future entity catalog boundary.
- [Real-world driving](real-world.md): reviewed Streets GL integration boundary, streamed geography, local edits and the first playable milestone.

- [World cache operations](world-cache-operations.md): deployed cache layers, preparation queue, regeneration, publishing, backups and troubleshooting.

## Composable engine modules

- [XR reutilizable y Nabla HeadSet](xr-module.md): auditoría de xr.html, API compartida y entrada VR/AR con selector Test/Z15.

- [AR reutilizable y contrato multiplataforma](ar-module.md): auditoría de la demo, API optativa, ejemplo R/C mínimo y límites pendientes.

- [Presentation preparation](presentation-preload.md): preload behind credits and keep street-light budgets stable.

- [Module map and compatibility](architecture/module-map.md)
- [Game library mode](game-library.md): Run the engine without Studio, with static tiles
- [Terrain folder](terrain-folder.md): Play on real nabla-atlas Z15 packages (`?terrain=<base>`), format mapping and deployment
- [Create a vehicle](creating-a-vehicle.md)
- [Define a vehicle: JSON, lights, mirrors, exhaust, sounds, `nabla.*` names](vehicle-definition.md)
- [Create a monitor](creating-a-monitor.md)
- [Migration history](architecture/vehicle-modularity.md)

## Regional data pilots

- [geoEuskadi road-area comparison: import, preparation and remaining integration gates](geoeuskadi-pilot.md)

- [Studio Desktop foundation](https://github.com/txemavs/nabla-studio/blob/main/docs/studio-desktop.md): experimental dockable workspace, runtime boundaries and the migration sequence.

- [Named Studio projects](https://github.com/txemavs/nabla-studio/blob/main/docs/studio-projects.md): portable files, retained places, consistent geographic navigation and tabbed settings windows.

- [Planetary world model](planetary-world.md)
- [Planet visual settings (game HUD)](planet-visual-settings.md): global object poses, local working frames and destination-specific portal environments.

- [Gameplay tuning: weapon angles, FOV and effects](gameplay-tuning.md)

- [Arranque progresivo y streaming de vuelo](terrain-streaming.md): cobertura inicial, niveles Z12–Z15 y publicación de LOD.

- [Mandos USB, volantes, pedales, joysticks y feedback](usb-controllers.md)
