# Create a monitor

Use `@nabla/engine/monitors` for layered GPU displays and `/menus` for optional menu
state. A monitor has no knowledge of cars, boats, portals or physics. Its host
mounts `root` on an object and supplies values. See the [editing guide](../../render/monitors/editing.md)
for existing S3 artwork and preview locations.

```ts
import { LayeredMonitor, type MonitorDefinition } from '@nabla/engine/monitors'

const definition: MonitorDefinition = {
  width: 400,
  height: 200,
  layers: [
    {
      id: 'background',
      kind: 'image',
      url: '/my-dashboard.png',
      x: 0,
      y: 0,
      width: 400,
      height: 200,
    },
    {
      id: 'speed',
      kind: 'text',
      binding: 'speed',
      columns: 3,
      x: 140,
      y: 60,
      width: 120,
      height: 60,
      align: 'center',
    },
    {
      id: 'rpm',
      kind: 'bar',
      binding: 'rpm',
      color: '#ff3030',
      x: 30,
      y: 150,
      width: 340,
      height: 15,
    },
  ],
}
const display = new LayeredMonitor(definition)
await display.ready
mount.add(display.root) // A supplied Three.js Group; coordinates are pixels.
display.root.scale.setScalar(0.002) // 400 px becomes 0.8 metres.

// In the existing host loop, e.g. at 100 ms intervals while powered and visible:
display.update(
  { values: { speed: Math.round(speedMps * 3.6) }, bars: { rpm: rpm / maximumRpm } },
  nowMs,
)
// When the host removes the screen:
// display.dispose()
```

The example assumes your host supplies `mount`, telemetry and the clock; it does
not create a second animation loop. [Executable standalone example](../../../examples/modularity/README.md)
uses the public API; open `/examples/modular-monitor.html`. The S3 recipe is also
shown independently at `/examples/s3-monitor.html`.

## Layers and update cost

PNG alpha is supported. Static image layers retain their textures. Text uses an
atlas and fixed-capacity glyph geometry; changing a value changes UVs, not the
entire canvas. Bars and needles change geometry/transforms. Choose enough text
columns for the full value, including signs/units; overflow is bounded.
Needles use an image with transparent background, a pivot, binding range and angle
range (see `MonitorLayer`). Multiple needles/text pieces can share one backdrop.

`LayeredMonitor.update` is host driven; it has no built-in whole-display interval
or RAF. Schedule it at the frequency you need and stop supplying updates when
powered off. A hidden mesh alone is not a scheduler. HTML layers are optional,
lazily loaded and have their own interval/adaptive/secondary settings; import
`/monitors/html` only if using HTML directly. Prefer glyphs for rapidly changing
numbers rather than repeatedly rasterizing a web page.

## Add a menu

```ts
import { MonitorMenu } from '@nabla/engine/menus'
const menu = new MonitorMenu([
  { id: 'blue', label: 'BLUE', action: { type: 'paint', value: '#345678' } },
])
menu.open = true
const result = menu.key('Enter')
if (result.handled) {
  // Consume this key before driving input.
  // Validate result.action and apply it through your host's edit/history API.
}
```

Menus emit data, not executable JavaScript. Render their current labels/selection
through the same display bindings. Connect a different action handler to use the
same menu on a wall, boat or portal console. The `/menus` entry has no DOM or
Three.js dependency. Call `dispose` on the display once removed; dispose during
loading is supported and must not resurrect meshes when an image finishes loading.
