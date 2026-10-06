# Boot, splash and dynamic resolution

This guide covers three host-facing pieces of the browser runtime that work together while
the player waits: the **dynamic resolution scale**, the **machine probe** that picks its
starting point, and the **skinnable splash** with an optional **attract (planet-from-orbit)
boot view**. The Nabla demo keeps its look by default; hosts such as Euskadi Online
override the branding and turn on attract mode.

## 1. Dynamic resolution scale

`DisplaySettings` ([src/config/display.ts](../src/config/display.ts)) gained a mode:

| Field                 | Meaning                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `resolutionScaleMode` | `'manual'` (default) keeps a fixed value; `'auto'` adapts live           |
| `resolutionScale`     | Multiplier on the quality profile's pixel ratio. Live value in auto mode |
| `maxFps`              | Unchanged: 0 follows the browser, 30..360 caps automatic submissions     |

Clamps:

- **Default:** manual at the quality preset's step (`presetResolutionScales`): Ultra 1, Alta
  0.9, Equilibrada 0.8, Baja 0.5, Móvil 0.45, Mínima 0.4; `custom` and unknown presets 0.8.
- **Auto:** starts at **0.5** and moves within `autoResolutionScaleRange` = **0.5..1**.
- **Manual:** any value in `manualResolutionScaleRange` = **0.25..1**, never changed by the engine.

Precedence when creating a `GameRuntime`:

```ts
new GameRuntime({ display: {} }) // manual 0.8 (no preset / custom)
new GameRuntime({ display: {}, performance: { preset: 'ultra' } }) // manual 1 (preset step)
new GameRuntime({ display: { resolutionScaleMode: 'auto' } }) // auto, starts at 0.5
new GameRuntime({ display: { resolutionScale: 0.75 } }) // manual 0.75 (explicit scale = fixed)
new GameRuntime({ display: { resolutionScaleMode: 'auto', resolutionScale: 0.7 } }) // auto from 0.7
```

At runtime:

```ts
runtime.setDisplay({ resolutionScale: 0.6 }) // switch to manual 0.6
runtime.setDisplay({ resolutionScaleMode: 'auto' }) // resume auto from the current scale (clamped 0.5..1)
runtime.resolutionScaleState // { mode, scale }
```

`onResolutionScale(state)` is called whenever auto mode changes the scale or the host
changes the mode. The canvas also carries `data-resolution-scale` and
`data-resolution-scale-mode` for diagnostics.

### Auto controller

`AdaptiveResolutionScale` ([src/runtime/resolution-scale.ts](../src/runtime/resolution-scale.ts))
observes the animation interval of each submitted frame (an exponential average):

- **Healthy** (≤ 18.2 ms ≈ 55 FPS, or ≤ 1.1 × the `maxFps` budget): raise by 0.05.
- **Struggling** (≥ 25 ms = 40 FPS, or ≥ 1.5 × the `maxFps` budget): lower by 0.05, never below 0.5.
- At most one step per 750 ms; gaps over 250 ms (tab switch, stalls) are ignored.

The interval includes CPU, GPU back-pressure and display sync; it is not a GPU timer. With an
FPS cap the thresholds follow the cap, so a 30 FPS cap does not read as "struggling".

## 2. Boot probe (~3 s)

```ts
const result = await runtime.probeMachine({ durationMs: 3000 })
// { resolutionScale, qualityTier, medianFrameMs, durationMs, samples }
```

Before `play()` starts the simulation, the probe renders the planet/sky pass three times per
animation frame at the profile's **full** pixel ratio and forces a 1-pixel readback
(CPU+GPU sync proxy). The median interval maps to:

| Median frame | Auto start scale | `qualityTier` hint   |
| ------------ | ---------------- | -------------------- |
| ≤ 16.7 ms    | 1.0              | `high` (≤ 18.2 ms)   |
| ≤ 20 ms      | 0.85             | `balanced` (≤ 22 ms) |
| ≤ 25 ms      | 0.7              | `low` (≤ 28.6 ms)    |
| ≤ 33 ms      | 0.6              | `mobile` (≤ 35.7 ms) |
| slower       | 0.5              | `minimal`            |

- In **auto** mode the start scale is applied immediately; **manual** is never touched.
- `qualityTier` is advisory: quality presets are fixed at construction, so a host may store
  it (e.g. `localStorage`) and pass `performance: { preset }` on the next boot.
- The probe can overlap the terrain wait: call it without awaiting right before `play()`.
  `play()` waits for a running probe before the first gameplay frame. Calling it after the
  simulation is playing rejects.

## 3. Skinnable splash

The engine exposes splash slots in `@nabla/engine/runtime/splash`:

```ts
interface EngineSplashSkin {
  logoUrl?: string // image shown above the title
  title?: string // default "NABLA ENGINE"; '' hides the title
  messages?: readonly string[] // load lines, chosen by boot phase; [] = no host load texts
  status?: boolean // false hides every load text (status + detail lines), any layout
  themeCss?: string // injected once as <style data-nabla-splash-theme>
  layout?: 'centered' | 'corner' | 'mark' // classic card, bottom-left status, or mark-only
}
```

`applySplashSkin(root, skin)` fills `#loading-logo`, `#loading-title` (or the first `h1`) and
`#loading-status` under the root, toggles `.splash-centered` / `.splash-corner`, and injects
theme CSS. `defaultNablaSplashSkin` is the Nabla default. `splashMessageAt(messages, 0..1)`
picks a message by progress.

The demo page ([game/index.html](../game/index.html)) styles the splash with CSS variables
that a theme can override without forking the markup:

```css
#loading-screen {
  --splash-bg: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  --splash-fg: #eee;
  --splash-muted: #888;
  --splash-accent: #4a9eff;
  --splash-accent-2: #7c3aed;
  --splash-track: #333;
  --splash-logo-height: 72px;
}
```

Detailed streaming lines (`describeLoading`: cells ready, requests, last error) still replace
the host message as soon as terrain progress arrives, so a skin never hides real failures.
The only exception is the `mark` layout below, which hides every text; failures still reach
the player through the error overlay (`#error-message`).

### Mark-only pre-attract (`layout: 'mark'`)

For a TV-style boot with no branding other than the engine's own mark:

- the screen is **black** (`--splash-mark-bg`, default `#000`) with only the logo, **small in the
  bottom-right corner** (`--splash-mark-size`, default 40px; `--splash-mark-inset`, default 24px);
- the default logo is the **Nabla mark** (hollow, tip-down ▽ in ice blue), exported as
  `NABLA_MARK_SVG` / `nablaMarkUrl`; a `logoUrl` replaces it;
- title, status, detail lines, progress bar and tile grid are not shown, nor are the demo menu,
  the controls hint, the engine HUD or the touch rigs while the splash is up;
- with `attract`, the black curtain fades out as soon as the canvas reports
  `data-boot-mode="attract"`, so the planet appears behind the mark; the mark stays until play
  starts and the splash hides.

```html
<head>
  <script>
    // Shorthand for { attract: true, splash: { layout: 'mark', messages: [], status: false } }
    window.NABLA_BOOT = { preAttract: true }
  </script>
</head>
```

`messages: []` never falls back to the default Nabla lines, and `status: false` hides every load
text (including the engine's streaming lines) in the `centered` and `corner` layouts too.

Set `NABLA_BOOT` in `<head>`: an inline script in the demo page then applies the mark layout at
first paint, before `main.ts` loads, so neither "NABLA ENGINE" nor "Cargando el motor…" flashes.
(With `VITE_NABLA_BOOT` the skin is applied when `main.ts` starts.) `messages: []` also makes the
early boot lines empty in any layout; a host that sets messages sees its first message instead of
the demo's Spanish lines.

## 4. Attract boot view

```ts
runtime.startAttract({ altitude: 18_000_000, orbitSeconds: 120, tilt: 0.45 })
void runtime.probeMachine() // optional, overlaps the wait
await runtime.play({ vehicleId }) // stops attract once the simulation starts
```

Attract renders **only the sky and planet** (the planetary `GeographicView`: Earth texture,
atmosphere, clouds, sun, moon, stars) from a slow orbit around the scene's origin — a
TV-style "waiting" shot. Until `earth.jpg` is ready the globe is a plain black sphere and the
sun disc / flare stay off, so there is no pale placeholder or bright-sun flash. Terrain cells, roads, buildings and vehicles continue to stream and
install in the background through `play()`'s ground wait; none of them are drawn until play
begins. `stopAttract()` and `attracting` are available; `dispose()` stops it too. The canvas
reports `data-boot-mode="attract" | "play"`.

Engine overlays (touch rigs) exist before play; hide them during attract with
`body:has(canvas[data-boot-mode='attract']) :is(.touch-driving, .touch-flight) { display: none }`
as the demo page does.

Pair attract with `layout: 'corner'` so the splash becomes a small bottom-left status box
and the planet stays visible.

## 5. Euskadi Online: host enablement

### Library host (own page, `GameRuntime` directly)

```ts
import { GameRuntime } from '@nabla/engine/runtime/browser'
import { applySplashSkin } from '@nabla/engine/runtime/splash'

applySplashSkin(document.getElementById('loading-screen')!, {
  logoUrl: '/brand/euskadi-online.svg',
  title: 'EUSKADI ONLINE',
  messages: ['Mundua kargatzen…', 'Lurraldea prestatzen…', 'Ibilgailuak kokatzen…'],
  layout: 'corner',
  themeCss: `#loading-screen { --splash-accent: #00a650; --splash-accent-2: #d52b1e; }`,
})
const runtime = new GameRuntime({ canvas, scene, tiles /* display omitted → fixed 80% */ })
runtime.startAttract()
void runtime.probeMachine() // adjusts the start scale only in auto mode
await runtime.play({ vehicleId: 'player-vehicle' })
```

### Standalone game page (this repository's `game/`)

The bundled game reads a boot config ([game/boot.ts](../game/boot.ts)), highest first:

1. `window.NABLA_BOOT` set by an inline script **before** `main.ts` loads:

   ```html
   <script>
     window.NABLA_BOOT = {
       attract: true,
       splash: {
         logoUrl: '/brand/euskadi-online.svg',
         title: 'EUSKADI ONLINE',
         messages: ['Mundua kargatzen…', 'Lurraldea prestatzen…', 'Ibilgailuak kokatzen…'],
         themeCss: '#loading-screen { --splash-accent: #00a650; }',
       },
     }
   </script>
   ```

2. `VITE_NABLA_BOOT` with the same JSON at build time.
3. URL: `?boot=attract` / `?boot=classic` (testers; wins over the host), `?probe=0` skips the probe.

`attract: true` defaults the splash to `layout: 'corner'` (an explicit `layout: 'mark'` is kept).
`probe` (default true) runs only in auto resolution (`scale=auto`); `probeMs` changes its length.

`cityLabels` (default `true`) controls the floating city / town / village names drawn ~1 km
above the terrain (tile layer `places`, see [real-world.md](real-world.md)). `cityLabels: false`
starts with them hidden; the player can switch them back on in **Ajustes → Capas → Nombres de
poblaciones**, and the choice is stored relative to the host default. `?layers=+places` /
`?layers=-places` override both for one visit. Library hosts call
`runtime.setHiddenLayers([...runtime.hiddenLayers, 'places'])` (or `setHiddenTileLayers` from
`@nabla/engine/render` before constructing the runtime).

`shadowBias` (default `1`, range 0–3) is the host default for **Ajustes → Calidad → Sombras:
corrección de rayas**, a factor on the engine's texel-scaled shadow bias
([performance.md](performance.md#shadow-bias-and-acne)). Set it in `NABLA_BOOT`,
`VITE_NABLA_BOOT`, the dedicated `VITE_NABLA_SHADOW_BIAS` build variable or `?shadowBias=1.5`
(the URL wins over the host). The slider applies live; the player's choice is saved in
`localStorage` (`nabla.shadowBias`) and wins over every host default until **Restablecer**
forgets it.

`asphaltContrast` (default `1`, unchanged; range 0.5–2.5) is the host default for the asphalt
contrast on the roads photo drape: a draw-time curve in the fragment shader around a fixed
display-space pivot, so dark asphalt gets darker and painted markings brighter while the tile
texture stays untouched. It applies to the roads photo drape and, where the asphalt is only part
of the terrain orthophoto (`relief=lidar`), to the terrain photo through a per-cell mask of the
OSM carriageways. Players move it in **Ajustes → Capas → Asfalto → Contraste del asfalto**
(stored, wins over the host default; **Por defecto** forgets it), and `?asphaltContrast=1.6`
overrides both for one visit. Library hosts pass `GameRuntimeOptions.asphaltContrast` or call
`runtime.setAsphaltContrast(1.6)` (also `setAsphaltContrast` from `@nabla/engine/render`).

The demo menu (**Rendimiento**) has an **Escala automática (50–100%)** checkbox; moving the
slider switches to manual. Without `scale` the slider starts at the quality preset's fixed
step (table in [configuration.md](configuration.md#display-synchronization-and-scaling)). The
player's choice is saved in the URL (`scale=auto` or `scale=0.75`) and wins over the preset
step, also after **Aplicar calidad**; an untouched scale is not saved, so a new quality picks its
own step.
