# UI theme

The whole screen interface of the engine (corner bars, buttons, HUD lines, joysticks, side menu,
settings window, loading screen, page panels) is styled by **one stylesheet** in
`src/ui/styles/`. Every rule reads its sizes and colours from **tokens** (CSS custom properties)
in `src/ui/styles/tokens.css`. To change the look, change a token; do not add rules.

## Where things are

| File                 | What it styles                                                           |
| -------------------- | ------------------------------------------------------------------------ |
| `tokens.css`         | All tokens: spacing, radius, type, bar/button sizes, colours, z layers   |
| `base.css`           | Page reset, game canvas, `.nabla-game` page classes                      |
| `buttons.css`        | Corner bars (`.nabla-corner--tl/tr/bl/br`), `.nabla-btn`, popovers       |
| `hud.css`            | Place title, help line, status line, readouts, fire mode, call to action |
| `touch.css`          | Touch rigs: walk, flight, drive (wheel, pedals), AR touch                |
| `menu.css`           | Side menu and start screen                                               |
| `settings.css`       | Settings window                                                          |
| `panels.css`         | Panels, XR/USB pages, page cards, scenario catalog lists                 |
| `loading.css`        | Loading screen (`--splash-*` tokens) and the error overlay               |
| `monitors.css`       | Monitors drawn in the 3D world (installed per monitor)                   |
| `xr-calibration.css` | The rasterised XR calibration screen                                     |
| `index.css`          | Imports the screen sheets in order (for plain CSS links)                 |

Every game page loads it first thing in `<head>`:

```html
<script type="module" src="./ui-styles.ts"></script>
```

(`game/ui-styles.ts` calls `installEngineStyles()`. A page outside the Vite build can instead
link `index.css` with `data-nabla-ui`.)

Package consumers without the page script get the same sheets from `installEngineStyles()`
(`src/ui/styles.ts`, which reads `styles.generated.ts`). After editing a sheet run
`node scripts/gen-ui-styles.mjs` (the test tells you when it is out of date). Canvas-drawn UI (XR panels) reads `src/ui/theme.ts`, which mirrors the
colour tokens; `test/ui/styles.test.ts` checks they match.

## Rules

- No `!important` and no `zoom`; the test fails on either.
- No inline styles from code for static looks: code sets a class or the `hidden` attribute.
  Only live values (a progress width, a dragged knob) are set from code.
- Desktop and touch have their own sizes: the `@media (pointer: coarse)` block in `tokens.css`.
  Narrow screens (≤ 600 px) have a second block.

## Key tokens

| Token                                               | Default                     | Touch | Meaning                                            |
| --------------------------------------------------- | --------------------------- | ----- | -------------------------------------------------- |
| `--nabla-btn-size`                                  | 22px                        | 28px  | Button height = bar height                         |
| `--nabla-btn-font`                                  | 12px                        | 13px  | Button label                                       |
| `--nabla-btn-key-font`                              | 10px                        |       | Key hint inside a button (`kbd`)                   |
| `--nabla-btn-icon`                                  | 14px                        | 16px  | Icon size inside a button                          |
| `--nabla-btn-pad`                                   | 6px                         | 7px   | Button side padding                                |
| `--nabla-btn-wide`                                  | 44px                        | 52px  | Width of wide buttons (CAM)                        |
| `--nabla-btn-gap`                                   | 4px                         |       | Gap between buttons in a bar                       |
| `--nabla-ui-margin`                                 | 10px                        |       | Distance of bars from the screen edge (8px narrow) |
| `--nabla-hint-font` / `--nabla-hint-line`           | 13px / 16px                 |       | Help and status lines under the bars               |
| `--nabla-control-height`                            | 28px                        | 36px  | Inputs and selects in panels                       |
| `--nabla-stick-size` / `--nabla-wheel-size`         | 112px / 140px               |       | Joystick and steering wheel                        |
| `--nabla-touch-btn`                                 | 44px                        |       | Round touch buttons (pedals, jump)                 |
| `--nabla-space-1` … `--nabla-space-7`               | 2 4 6 8 12 16 24 px         |       | Spacing scale                                      |
| `--nabla-radius` / `-panel` / `-pill`               | 2px / 4px / 999px           |       | Corners                                            |
| `--nabla-font-xs` … `--nabla-font-title`            | 10 11 13 15 18 20 px        |       | Type scale                                         |
| `--nabla-font`                                      | Arial                       |       | Interface typeface                                 |
| `--nabla-color-bg` / `-surface` / `-button`         | #121212 / #1e1e1e / #252525 |       | Backgrounds                                        |
| `--nabla-color-ink` / `-muted`                      | #eee / #a6a6a6              |       | Text                                               |
| `--nabla-color-accent`                              | #f5f5f5                     |       | Active and selected states                         |
| `--nabla-color-highlight`                           | #f5f5f5                     |       | Calls to action, catalog headings (brand colour)   |
| `--nabla-color-danger` / `-go` / `-warn` / `-error` | red / green / amber / red   |       | States                                             |
| `--nabla-z-hud` … `--nabla-z-error`                 | 10 … 2000                   |       | Stacking order (see `tokens.css`)                  |

Parts a host may switch off by setting the token to `none`: `--nabla-place-display`,
`--nabla-speed-display`, `--nabla-game-hud-display`, `--nabla-legacy-settings-display`,
`--nabla-settings-close-display`, `--splash-logo-display`, `--splash-title-display`,
`--splash-status-display`, `--splash-progress-display`.

## Layout of the game screen

- Top-left bar: menu toggle. The place title sits next to it; the **help line** (keys) goes under
  the bar on the left, the **status line** under the top-right bar on the right.
- Top-right and bottom-right bars: contextual buttons (RMB, R, F, T, Q…). Nothing else is placed
  in their rows; the fire mode badge sits above the bottom-right bar.
- Bottom-left: one readout line (FPS or the engine hint). Bottom centre: engine version.
- Joysticks and the wheel sit above the bottom bars (`--nabla-control-bottom`).
- `html.nabla-ui-hidden` hides all gameplay chrome (intros, cinematics).

## Main menu

There is one main menu on every page: the ☰ button top-left opens the side menu
(`mountGameMenu`, `src/runtime/main-menu.ts`). Its sections are the settings tabs (World,
Settings, Objects, Development) and Virtual reality (enter, headset page). ☰ closes the
settings window when it is open. Hosts only configure it: call `mountGameMenu(document, t,
{ sections: (defaults) => [...] })` to relabel or add sections (Euskadi adds augmented reality
and scenarios). Pages add their own entries with `addGameMenuEntries('vr', [...])`.

## Changing the theme as a host

Put a `:root` block in `<head>` (anywhere: the engine sheet is inserted first), tokens only:

```html
<style>
  :root {
    --nabla-color-highlight: #ffb000;
    --nabla-btn-size: 24px;
  }
</style>
```

A size set this way applies to desktop and touch alike. To change only touch, wrap it in
`@media (pointer: coarse) { :root { … } }`.

### Euskadi example

Euskadi's whole theme is this block (`EUSKADI_HUD_CSS` in `euskadi-hud.ts`):

```css
:root {
  --nabla-game-hud-display: none;
  --nabla-speed-display: none;
  --nabla-legacy-settings-display: none;
  --nabla-settings-close-display: none;
  --nabla-color-highlight: #ffb000;
}
```

plus the `--splash-*` tokens in `euskadi-boot.ts`. Its own elements use the engine classes
(`nabla-place`, `nabla-help`, `nabla-status`, `nabla-readout`, `nabla-cta`, `nabla-catalog-*`).
The film credits are an Euskadi component of their own.
