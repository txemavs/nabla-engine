# Full-screen game menu

The Euskadi Online clock opens the HTML monitor defined in `game/settings-hud.ts`. While it is
open, the same button shows a down arrow that folds the monitor away. It is the only close
button; Escape closes too. Both return focus to the game. The style is `src/ui/styles/settings.css`, built on the engine UI tokens
([UI theme](ui-theme.md)). This is the
desktop interface: it does not change the XR/AR monitor menus or any simulation parameter.
UI labels come from the engine catalogs (`src/i18n/catalog.{en,es,eu}.ts`, `t()`); the tab and
section names below are the Spanish ones.

## Navigation

The top tabs are Aplicación, Mundo, Ajustes, Objetos and Desarrollo (`TABS` in
`game/settings-hud.ts`; see [UI/UX pattern](ui-ux-pattern.md)). Aplicación holds the main
menu's own sections (`mountGameMenu`, `src/runtime/main-menu.ts`: info, virtual reality, AR,
scenarios). Each other tab has a left navigation and a single visible section on the right. The
last section chosen in each tab is kept. Section placement is `SECTION_TABS`; the left-navigation
groups are the `groups` list at the end of `mountSettingsHud`.

| Tab        | Groups and sections                                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mundo      | Fecha y hora; Mapa (map, position); Capas (ground, air); Opciones (road style, weather, sea, street lights, headlamp, traffic signs with signage physics, place names)                                                            |
| Ajustes    | Actor; Pantalla (quality, sharpness, sun shadows, distances, performance); Efectos (smoke, muzzle flash, simulated fire); Cámara (options, field of view, Action Cam); Conducción; Controles (keys, USB devices); Sonido; Gestión |
| Objetos    | Vehículos (add, placed objects, layout); Vehículo actual, titled with its name (driver head and view, steering wheel, mirrors, lights, sound, exhaust and smoke; only what applies); Arma (weapon, combat)                        |
| Desarrollo | Armas (aiming, poses and animations); light fine tuning; rear-light fine tuning; sign and experimental light shadows; planet config; collision view; terrain source and cache; diagnostics                                        |

Not placed: the legacy «Planeta» section (`scene-planet`, `game/scene-controls.ts`) stays
hidden (`sectionTab` returns undefined), and «Rendimiento» (`display-performance`) is emptied
into Pantalla's quality section and hidden.

The field of view (Cámara) is the same offset as the J menu, saved as `nabla.cameraFov`. The
occupied vehicle's exhaust offset and quantity and its reversing-alarm switch are saved per
vehicle model (`nabla.vehicle-preferences/1:<model>`, `src/runtime/vehicle-preferences.ts`),
like the lights (`nabla.vehicle-lights/1`); the older global keys are read as defaults.

The original controls are moved inside the same document. They are not cloned or rebound:
they keep their events, runtime methods, storage and the references of the modules that update
them. The old menu observer also picks up sections registered after mounting. The old panel
stays hidden; its `open` state follows the monitor so cache and quality updates keep working.

`game/settings-controls.ts` builds Teclas from the engine's `inputBindings`, `controlsFor`,
`keyLabel` and `inputChords`. It does not read a hand-made copy of the list. It can search and
filter by context. Tab navigation normalises its keys in the input catalogue.

## Map: real states and variable extent

`GameRuntime.terrainTiles` exposes a snapshot of the mesh tile states of the existing streamer
(`PlanetWorld.diagnostics`). It is a query: it does not request maps or change coverage, cache,
memory or physics.

`game/settings-map.ts` computes the extent of every known tile, including loaded, visible,
planned, downloading, installing and retrying ones. It normalises the zoom levels to a common
grid and creates one element per tile, without filling empty cells or forcing a 5×5 grid. The
view refreshes once per second only while visible, and does not rebuild its elements when the
states have not changed.

This phase shows coordinates and states. Thumbnails of each package's textures are pending; no
extra images are requested yet.

## Checks

- `test/browser/e2e/settings-hud.spec.ts`: mounting, late registration, preserved events,
  navigation, keys, map, full screen, mobile size, closing, tab placement, field of view, weapon
  wheel reset and the occupied-vehicle group.
- `test/game/settings-map.test.ts`: variable extent, mixed zooms and a scene without tiles.
- `test/runtime/vehicle-preferences.test.ts`: per-model exhaust and reversing-alarm choices.

## Booting the local Euskadi Online integration

The integration copy is served with `EUSKADI_BOOT=attract`, as in production. The host intro
uses the `planet-ready` event derived from `data-boot-mode` to end its credits and release
`holdReveal`. Switching only the server to `EUSKADI_BOOT=classic` disables the orbital view that
emits that event: the intro waits for the game and the game waits for the intro, leaving a black
screen. Do not use that configuration change to test the menu; it is not a navigation bug.

## Settings management and backups

Configuración → Gestión saves a JSON, imports with a preview and resets to defaults. There is no
global delete button in the menu footer. Reset opens a confirmation and requires ticking that
the change is understood before the final action is enabled. By default it keeps the USB
controller and headset calibrations; an explicit checkbox includes them. Reset also removes the
graphics options from the URL so they do not block a return to the initial values.

`src/runtime/settings-backup.ts` holds the reusable preference catalogue and the
`nabla-settings` version 1 format. It includes the supported localStorage/sessionStorage keys
(per-model vehicle lights and preferences included) and the display options of the URL. It does
not copy scenes, maps/caches, tracking reports, credentials or the rest of the origin's storage.

Choosing a file only validates it and shows a summary; it changes nothing. Import merges the
settings present in the JSON with the current ones, unless the user chooses a full replace. The
world URL and its coordinates are kept. The USB profile is validated before writing, and both
stores are restored if a write fails. Applying a file and resetting reload the page so each
module reads its configuration with its own validation.

Tests: `settings-backup.test.ts`, `settings-management.spec.ts` and `settings-hud.spec.ts` check
file limits, exclusion of foreign data, rollback of failed writes, confirmation, kept
calibrations, navigation and preserved listeners on the original controls.
