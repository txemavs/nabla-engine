# Full-screen game menu

The reference-game settings window is implemented in `game/settings-hud.ts` and styled
by `src/ui/styles/settings.css` ([UI theme](ui-theme.md)). The clock toggle,
main menu and `openGameSettings(tab, section)` open the same window. Escape closes
it and returns focus to the game. Hosts may hide the explicit close button with
`--nabla-settings-close-display`. These HTML controls do not reorganize XR monitors.

## Navigation

The stable tabs are Main, World, Settings, Development and Help. Labels are translated by
`src/i18n/catalog.{en,es,eu}.ts`; English names below match the English UI.
`MENU_LAYOUT` and `MENU_FLAT_SECTIONS` in `game/menu-layout.ts` are the placement
source of truth. Hosts contribute sections; unavailable and contextual sections are
hidden. The last section selected in each tab is remembered during the menu lifetime.

| Tab         | Groups and sections                                                                                                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main        | Scenarios, Info, VR/AR when available, current vehicle controls (driver, beams, sound, exhaust, rear lights).                                                                                    |
| World       | Map; Situation (date/location); Terrain (Source, Buildings, Infrastructures, traffic signs, streetlights, place names); Environment (Atmosphere, Celestial bodies, Weather, Sea level); Objects. |
| Settings    | Video (Options, Quality, Bodycam, Effects, Shadows, Light, Distances); Controls; Player; Weapons; Simulation (time/gravity, driving, audio); Data and preferences (Cache, Settings management).  |
| Development | Collisions and diagnostics.                                                                                                                                                                      |

Video → Options combines general camera controls, FOV and camera recovery/transitions.
Quality groups profile, sharpness, anisotropy, FSR, FPS cap and resolution controls.
Bodycam is the UI name; existing ActionCam API identifiers and saved keys remain compatible.
Effects combines smoke and fire; Shadows combines sun, local lights, signs and flashlight
shadow controls. Terrain loading radius and memory cells belong to Distances; disk cache
management remains in Cache. Moving controls does not rename their persistence keys.

Search matches translated section/control labels without case or accent sensitivity.
Results show their navigation path; arrow keys select and Enter opens a result. Search
never applies a setting. Long result labels wrap within the available width; only vertical
scrolling is needed for a long result list. Native range inputs have no inherited panel
padding, so their minimum and maximum reach the track ends.

Main → Info adds actual renderer, physics execution, session/settings mode, quality,
canvas dimensions, resolution scale, configured FPS cap, FSR, terrain counts and browser
capabilities through `game/system-info.ts`. Copy report copies the displayed diagnostics,
not a settings backup. Reported memory is approximate; FPS cap is not measured FPS;
WebXR API presence does not guarantee headset/session support.

The FOV offset is saved as `nabla.cameraFov`. Vehicle exhaust and reversing-alarm
preferences remain per model (`nabla.vehicle-preferences/1:<model>`); the vehicle
light owner retains its existing keys and migration readers. See
[the interface manual](manual/20-interface.md) for instance ownership and detailed ranges.

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

Settings → Data and preferences → Settings management saves a JSON, imports with a preview and resets to defaults. There is no
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

There is no Development → Export planet snapshot entry. The restorable settings backup
is the supported settings export. Host-specific keys must be registered explicitly; see
[host compatibility](host-settings-compatibility.md#host-preferences-contract-2026-10-24).

## Future ideas

- **VR white-room lobby.** Entering VR from the menu could start in a plain white room with the
  scenario list on a wall panel, choosing one loads it around the player. Not built; the
  scenario page's test ground plus Principal › Escenarios cover it for now.

## Adding a screen without breaking navigation

1. Register its stable section ID in `game/menu-layout.ts`. Add a top-level tab only
   for a distinct destination; tabs without sections are hidden automatically.
2. Build one `.menu-section` fieldset with a legend. Use `place()` in the HUD so the
   same section participates in desktop navigation, mobile layout and search.
3. Keep controls bound to their existing runtime owner. Move nodes rather than
   cloning them; do not create new storage keys to reorganize the UI.
4. Write English labels as user actions or recognizable names. Explain units,
   reload requirements and device limits next to the relevant control. Use the
   i18n catalogs for controls; Help is an explicitly English reading section.
5. Test every visible tab and section at desktop and narrow widths, keyboard
   navigation, search, close/reopen and a host without optional sections.

Help contains a minimal, read-only cheatsheet: what the engine is, where to find
controls, how preferences differ from diagnostics, and device/content limits.
It has no listeners, network requests or persistence.
