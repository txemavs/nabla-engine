# Layered monitor library

Use the dedicated package entry points:

```ts
import { LayeredMonitor, type MonitorDefinition, type MonitorData } from '@nabla/engine/monitors'
import { MonitorMenu, type MonitorMenuItem } from '@nabla/engine/menus'
// Optional browser-only backend, loaded only if needed:
import { HtmlMonitor } from '@nabla/engine/monitors/html'
// Optional stock layouts and pure data bindings:
import { s3Instruments } from '@nabla/engine/monitors/presets'
```

Root imports remain compatible, but pull the broad engine graph. A menu needs no
DOM, Three.js or physics. A layered monitor needs Three.js and browser canvas for
text atlases. HTML code is dynamically loaded only for `kind: 'html'`; `ready`
includes its loading. Calling `dispose()` while loading cancels/releases the
surface and cannot attach a late result. The host calls `update(data, nowMs)`;
monitors create no independent animation loop. `setSecondary()` before loading
is respected and never mutates a shared definition's refresh options.

Public exports: `LayeredMonitor`, `MonitorDefinition`, `MonitorLayer`, `MonitorMenu`,
`MonitorMenuItem`, `MonitorAction`, `HtmlMonitor`, `MonitorData`, `MonitorOptions`.

A monitor consists of a surface definition, live data and an optional menu. The
renderer does not know about cars, flight or portals. Actions are plain objects;
the host owns permissions, scene edits, physics and persistence. No executable
scripts or string evaluation in definitions.

## Layout and data contract

Definitions use pixels, origin at top left. Layer order is back to front. The
resulting Three.js `root` has its origin at the centre; scale/rotate/mount it on a
physical display. `width`/`height` define its aspect ratio. Every layer has unique
`id`, `x`, `y`, `width`, `height`.

| kind   | Extra fields                                          | Work when data changes                            |
| ------ | ----------------------------------------------------- | ------------------------------------------------- |
| image  | url                                                   | None; PNG alpha preserved                         |
| panel  | color                                                 | None; solid background                            |
| needle | url, binding, pivot, min, max, fromDegrees, toDegrees | Rotate existing mesh                              |
| bar    | binding, color                                        | Scale mesh, left edge fixed                       |
| text   | binding, columns, optional color                      | Change UVs in one batched mesh per row            |
| html   | url, optional refresh                                 | Rasterise that layer at its own adaptive interval |

Needle `pivot` is pixels from the image's top left. Positive angles are clockwise.
`values` supply numbers/text for needles and text; `bars` supply normalised 0–1 values.
Non-finite inputs are clamped to safe values. Text uses a prebuilt ASCII atlas (32–127),
with `?` for unsupported characters. Text layers can use `font: "sans"` for compact
numeric readouts and `align: "center"` to centre the actual unpadded value. Use an HTML layer for accents, richer fonts or
complex styling. Texture URLs are trusted application assets, not arbitrary pages.

```ts
const panel = new LayeredMonitor({
  width: 600,
  height: 400,
  layers: [
    { id: 'face', kind: 'image', x: 0, y: 0, width: 600, height: 400, url: '/my-panel.png' },
    {
      id: 'speed-needle',
      kind: 'needle',
      x: 40,
      y: 50,
      width: 200,
      height: 200,
      url: '/my-needle.png',
      pivot: [100, 100],
      binding: 'speed',
      min: 0,
      max: 320,
      fromDegrees: -120,
      toDegrees: 120,
    },
    {
      id: 'rpm-needle',
      kind: 'needle',
      x: 350,
      y: 50,
      width: 200,
      height: 200,
      url: '/my-needle.png',
      pivot: [100, 100],
      binding: 'rpm',
      min: 0,
      max: 7000,
      fromDegrees: -120,
      toDegrees: 120,
    },
    {
      id: 'speed-number',
      kind: 'text',
      x: 210,
      y: 270,
      width: 180,
      height: 70,
      binding: 'speed',
      columns: 3,
    },
  ],
})
await panel.ready // handle asset load errors in the host
scene.add(panel.root)
panel.root.scale.setScalar(0.001)
panel.update({ values: { speed: 120, rpm: 3500 }, bars: {} }, performance.now())
// Hidden panels do no update work:
panel.root.visible = false
// Releases owned GPU resources and outstanding HTML updates:
panel.dispose()
```

Images load once per URL per monitor. All text layers share one atlas per monitor.
No image uploads are required to move needles, fill bars or change these glyphs.
Each image/needle/bar/text row is one draw call; combine decorative art into the
background. HTML retains its adaptive refresh and single shared rasterisation slot.
`setSecondary(true)` lowers HTML refresh; it does not make cheap needles jerky.
The host must not update distant/invisible monitors; no automatic occlusion queries.
The current renderer is WebGL and requires browser canvas for the glyph atlas.

## Keyboard and actions

`MonitorMenu.key(code)` handles ArrowUp, ArrowDown, Enter and Escape, skips disabled
items and returns `{handled, action?}`. Menu state is independent of its rendering.
`lines` can bind to text or HTML layers. The host should route input to the focused
menu first, suppress conflicting game input and release focus on exit.

The first integration is the S3 GPS console:

- **J** opens/closes, selects cockpit view; **Up/Down** select; **Enter** applies paint.
- While open, driving input becomes neutral with the brake held. Simulation continues.
- **Escape**, leaving the car or retracting GPS releases the menu.
- `vehicle.paint` is handled in Studio through `SceneEditor` and the live paint materials.
- The edit remains in the document and undo history; use Save to persist the project.
- Layout/items: `src/catalog/monitors/car.ts`. Mount: `CarInstruments`.
- The GPS map does not redraw behind the menu. The speedometer keeps working.

Future hosts can accept actions such as `ship.helm` or `portal.selectDestination`;
these are integration examples, not implemented commands. Existing ship and portal
screens are not migrated automatically. The S3 instrument cluster also uses layers; the old HTML panel is retained as
`assets/monitors/html-panel.example.html`. See [the editing guide](editing.md)
and [create a monitor](../../catalog/monitors/creating-a-monitor.md).

- Generated reference: [REFERENCE.md](REFERENCE.md)
