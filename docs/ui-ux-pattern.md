# UI/UX pattern — the rule

This is **the** interface pattern of the game. Any agent or developer who adds, moves or
restyles something visible must follow it. If a feature seems not to fit, change the feature,
not the pattern. This page describes how the pattern is implemented today; first pass:
observation and order, no behaviour was changed to write it.

## The pattern in one paragraph

A **main menu with tabs**, everything inside it organised as a **tree** (tab → section →
controls). The **game keeps running and stays visible behind the menu** in real time. A
**clock** is the menu's button. While playing, a small set of **always-there buttons** sits at
the top right and a **contextual row of buttons** at the bottom changes with where you are
(on foot, in a car, on a motorbike, with a weapon).

## 1. Menu: tabs → sections → controls

Source: `game/settings-hud.ts` (`mountSettingsHud`), styles in
`src/ui/styles/settings.css`, tokens in `src/ui/styles/tokens.css` ([UI theme](ui-theme.md)).
Behaviour description: [settings menu](settings-menu.md).

```
Menú (full-screen, transparent window; world rendering continues behind it)
├── Tab «Principal»      (id app)       scenarios, info and status, VR/AR, current vehicle
├── Tab «Mundo»          (id planet)
│   ├── Mapa             real tile states (settings-map.ts) + position
│   ├── Capas            terrain layers (layers-ui.ts)
│   └── Opciones         world options
├── Tab «Ajustes»        (id options)
│   ├── Vídeo            quality, Distancias (draw, fog, roads, buildings, collisions, relief, ground detail; km),
│   │                    resolution scale, anisotropy, post-process
│   ├── Cámaras          view, FOV, camera effects
│   ├── Controles        generated key list (settings-controls.ts, from inputBindings)
│   └── …                audio, mirrors, lights, as registered
└── Tab «Desarrollo»     (id dev)       tuning and diagnostics, «Armas» group, dev-only toggles
```

Rules:

1. **Tabs are fixed** in `MENU_TABS` (`app`, `planet`, `options`, `dev`; `game/menu-layout.ts`). A tab with nothing to
   show is hidden (for example Audio on a host without the mixer). Add a _section_, not a tab.
2. **Each tab has a left navigation and one visible section on the right.** The last section of
   each tab is remembered. Sections are assigned to tabs and groups by `MENU_LAYOUT`
   (`game/menu-layout.ts`), which `settings-hud.ts` applies.
3. **Controls are moved into the menu, not cloned.** The original control keeps its events,
   storage and runtime reference; the menu only changes where it is. A control registered
   after mount is picked up by the section observer. Use `menuSection` (`game/menu.ts`) to
   add a section; one `*-ui.ts` file per control family.
4. **Save like the other settings** (localStorage under a `nabla.*` key) and apply live.
5. **Use the shared tokens** (`src/ui/styles/tokens.css`; `interfaceTheme` for canvas). No
   private palettes, no inline styles, no `!important`.
6. **Defaults are code.** A new slider ships with a default in `src/config/`; production
   behaviour must not change by adding a control. Dev-only comparison toggles belong in
   «Desarrollo» and default to the existing behaviour.
7. **Do not pause the game** to open the menu (only a reload pauses). Do not draw an opaque
   backdrop: the transparent window is deliberate so the player sees changes live.
8. **While the menu is open** the in-game chrome is hidden (`body.settings-is-open` hides the
   toolbar, touch rigs and the Menú button); the same button becomes the close control, and
   `Escape` closes too. Both return focus to the game.
9. Grid of the window: header row, tab bar, content (section list + pane), bottom action row.
10. **Per-vehicle options live in one group of the «Principal» tab, hidden on foot, titled with the occupied
    vehicle's name** (for example «Honda VFR800FI 1999»). Lights, driver, mirrors, exhaust smoke and any later per-vehicle option go in that
    group, and a vehicle sees only what it has: a motorcycle has no exhaust-smoke section and
    lists only the lamps its model binds. Defaults of these options come from the vehicle's JSON
    (see [vehicle definition](vehicle-definition.md)); the player's choice is saved per model.
    The sections are Conductor y espejos (the mirrors row only when the model has mirror glass),
    Luces (only when a front or rear lamp is bound), Sonido (engine volume, the same mix as
    Configuración → Sonido; the reversing-alarm switch only when the vehicle data has
    `reverseAlarm`) and Escape y humo (only when `vehicle.exhaust.adjustable` or
    `smoke.amount: "manual"`; the position sliders follow the first, the quantity slider the
    second). `GameRuntime.occupiedVehicle.options` (`vehicleOptions`, derived from the vehicle's
    data and what its model bound) drives this, and `game/vehicle-group.ts` decides what shows.
11. **Tab tree** (the full list is in [settings menu](settings-menu.md)):
    - Mundo: the world itself (time, map, layers, weather, sea, street lights, signs, labels).
    - Configuración: how the game runs for this player: Pantalla (quality, sharpness, shadows,
      distances, performance), Efectos (smoke, muzzle flash), Cámara (incl. field of view),
      Conducción, Controles, Sonido, Gestión.
    - Principal: scenarios, info and status, VR/AR, the occupied vehicle's group.
    - Desarrollo: tuning and diagnostics that a player does not need.
      Rendering quality never goes in Mundo; a visible effect is not a Desarrollo option.
12. **Tab names** are Principal, Mundo, Ajustes and Desarrollo. «Opciones» is the name of a
    navigation group inside «Mundo» and of an older name of «Configuración»; do not use it for
    the tab.

## 2. The clock is the Menú button

In Euskadi Online the Menú button (`#settings-toggle`, class `euskadi-menu-clock`, restyled by
`euskadi-hud.ts`) **shows the game clock `HH:MM`** as its label. Clicking it opens the menu;
while open it shows a down arrow to close. The mouse wheel over this button moves the game
clock by one hour per notch (up = later; a trackpad's small deltas add up to a notch), keeping a
running speed; the engine's settings HUD does it (`game/clock-wheel.ts`), so every host gets it.
The planet panel's time controls and the `&time=` address follow. The clock group (`#euskadi-clock-group`) also holds the vertical time-of-day
slider and the «Hora real» control. The standalone engine game shows the engine's own gear
button (`game/settings-hud.ts` toggle); it is hidden by the host.

During the intro / ENTER / credits the Menú button and every game button are hidden
(`html.euskadi-intro`, `euskadi-boot.ts`); they appear when gameplay starts. Input during the
intro is ignored (apart from starting music) so nothing can blank the screen.

## 3. HUD rows while playing

Defined in `euskadi-hud.ts` (host) around engine controls from `src/runtime/game-toolbar.ts`
(`GameToolbar`), `touch-driving.ts`, `touch-walk.ts`, `touch-flight.ts`:

| Area                     | Element                                                                                     | Notes                                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Top left                 | Title, then the control hints line (`#euskadi-controls`) and the place block (city, street) | Hints are generated from the key catalogue for the current context.                                                                         |
| Top right, fixed         | `#euskadi-actions` → `#euskadi-fixed`: clock/Menú, CAM, FOV, quality                        | Same size/style (36 px high, shared tokens). Always present while playing.                                                                  |
| Bottom right, contextual | `#euskadi-context`                                                                          | Buttons filtered by what applies **now** (`data-control-action`, e.g. horn, lights, high beam, holster, weapon actions). Hidden when empty. |
| Touch only               | Wheel (right), pedals (left), walk sticks on foot                                           | Shown by the control profile / `pointer: coarse`; see [vehicle controls](vehicle-controls.md).                                              |
| Bottom left              | FPS / loading step (tiny)                                                                   | Hidden on touch.                                                                                                                            |

The **contextual row** is the part that must change with context. It is built from the same
`inputBindings` scopes as the Teclas page and from `contextualAction` (for example, with a weapon
equipped the lights button becomes the weapon-light action, `Q` is reserved for weapons).
Add a button by declaring an action in `src/config/input-bindings.ts` with its scopes; do not
create a new button container.

## 4. Checklist for a new visible feature

1. Is it a setting? → a section in the right tab (above), saved + live, default in code.
2. Is it an action the player triggers while playing? → an input action with scopes, so it shows
   in the contextual row and in Teclas.
3. Is it information? → top-left place block or the instrument/telemetry of that vehicle, not a
   new floating panel.
4. Check desktop and mobile (`pointer: coarse`) screenshots and that it is hidden during the intro.
5. Spanish labels in the standalone engine game; Euskadi has Castellano/Euskara/English text in
   `euskadi-boot.ts` for the intro only.

## Known deviations (to review with Txema, not changed here)

- [settings menu](settings-menu.md) says the tab is called «Opciones»; the code label is
  «Configuración».
- Euskadi's `GAME.md` still describes an older HUD layout (separate «Hora real» button); the
  clock-as-Menú layout above is current.
- Car-light settings listing every setting while in a car: see
  [generalization candidates](generalization-candidates.md).
