# Monitors: editing guide and implementation map

This is the starting point for the S3 instruments and for building further vehicle,
ship and portal-console displays. The monitor library belongs to the engine;
Studio supplies keyboard focus, scene editing and saving.

## Try the current examples

With the Docker Studio running, open:

- [S3 instrument preview](http://127.0.0.1:8080/monitors/speedometer.html): two smaller round dials, RPM left, speed right, and a wider central digital display. The sliders only simulate data in the preview.
- [Actual S3 monitor and keyboard menu on a static mount](http://127.0.0.1:8080/examples/s3-monitor.html): the exact in-game layered recipe, without loading a car or physics.
- [Generic standalone monitor](http://127.0.0.1:8080/examples/modular-monitor.html): a small independent host.
- [Editable HTML panel](http://127.0.0.1:8080/monitors/html-panel.example.html): the retained HTML/CSS example with live bindings and refresh controls.

For `npm run dev`, use the same paths on port 5173 instead of 8080. Local URLs
require the server to be running; the source links below also work on GitHub.

In the S3:

| Key           | Action                                                 |
| ------------- | ------------------------------------------------------ |
| C             | Exterior → driver → overhead camera                    |
| G             | Retract/raise the GPS and its casing in 1.8 seconds    |
| J             | Open/close the car menu on the GPS; enter cockpit view |
| ↑ / ↓         | Select a menu entry                                    |
| Enter         | Open a section or apply the selected action            |
| Escape        | Return to parent, or close the root menu               |
| Save / Ctrl+S | Persist the scene, including the chosen paint          |

The car menu includes **POSICION**: live heading (RUMBO), longitude, latitude and
altitude on the GPS screen. Key G remains the street map.
Cars start with the GPS fully lowered and off on each entry; G raises it on demand.
Entry shows a 1.2-second overhead-to-seat transition, while the occupied car's
materials are prepared with the scene lighting. C or driving input cancels the
transition. Boats and carriers retain their existing entry behaviour.
This moves first-use work into entry; it cannot guarantee stall-free rendering on
every GPU, especially when parallel shader compilation is unavailable.

The GPS stops map redraws immediately when retracting. The dashboard remains on.
An open menu suppresses driving input and holds the brake; the simulation continues.
Closing it releases keyboard focus. Paint changes edit the scene document through
its normal history, without recreating the running physics world.

## Where to edit

| What you want to change                                               | Source                                                                                                        |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Dial sizes, positions, needle pivots/ranges, speed and gear placement | [S3 layered definition](../src/catalog/monitors/s3-cluster.ts)                                                |
| Dial artwork and central panel                                        | [Static background SVG](../assets/monitors/s3-cluster.svg)                                                    |
| Needle shape/colour                                                   | [Transparent needle SVG](../assets/monitors/red-needle.svg)                                                   |
| Standalone instrument preview                                         | [Preview HTML](../assets/monitors/speedometer.html)                                                           |
| Menu layout, colour choices and emitted actions                       | [Car menu definition](../src/catalog/monitors/car.ts)                                                         |
| Rich HTML panel appearance and bindings                               | [HTML example](../assets/monitors/html-panel.example.html)                                                    |
| Mounting, GPS animation and power                                     | [CarInstruments](../src/render/entity/car-instruments.ts)                                                     |
| Telemetry formatting and stock composition                            | [S3 recipe](../src/catalog/monitors/s3-instruments.ts), [public presenter](../src/presentation/scene-view.ts) |
| Generic types, examples and integration rules                         | [Library contract](../src/render/monitors/README.md)                                                          |

**Needle self-test.** When the driver gets in, `CarInstruments.update` receives
`vehicleInfo(id).gaugeSweep` (0..1) and `sweepCluster(cluster, data, sweep)` points every
`needle` layer of the cluster at that fraction of its own `min..max` range (and fills the bar
with the same binding). The sweep rises to full scale and back in about one second before the
engine starts. It is generic: any cluster definition (car, truck, custom) gets it without
per-vehicle code; digital readouts and the gear letter keep their real values (`P`).

The preview and the live S3 share artwork, but not a live DOM: changing preview CSS
alone does **not** change the in-game layout. Edit the layered definition for that,
and mirror the placement in the preview HTML. Reload Studio after editing assets.
The S3 no longer uses HTML rasterisation for its instruments. The new static S3
example above uses the **same live definition and bindings** as the game, so edits
to the definition can be checked there directly; it is separate from the older
HTML artwork preview.

## The performance model

`LayeredMonitor` supports an ordered stack of `image`, `panel`, `needle`, `bar`,
`text` and `html` layers. PNG alpha and transparent SVGs are supported. Backgrounds
load once. Needles rotate existing meshes, bars scale them, and text changes UVs
within a prebuilt glyph atlas. A text row is one mesh, not a draw call per letter.
These updates do not regenerate or upload an image. The scene still draws each
visible layer: static texture does not mean zero rendering cost.

The digital speed uses a bold sans-serif digit atlas and actual-value centring:
7, 70 and 250 are centred without leading reserved spaces. `columns` is a maximum
capacity, not a requirement to display padded digits. The mono atlas remains useful
for menu rows. Atlas font variants are created once and reused within the monitor.

`HtmlMonitor` remains available for richer layouts. It retains its DOM/bindings,
skips unchanged displayed data, quantises bar changes to 1%, and permits a per-panel
`data-update-ms` or API interval between 50 and 5000 ms. Adaptive intervals slow
updates when frame/decode latency rises; secondary HTML panels update four times
less often. All HTML panels share one pending rasterisation slot. A changed HTML
layer still rasterises and uploads its entire small texture.

The GPS is a separate canvas map: it skips unchanged poses, slows outside cockpit
view or at lower frame rates, and does not redraw when retracted or behind a menu.
Hidden/inactive layered monitors do not update. Hosts decide visibility/priority;
there is no automatic GPU occlusion detection or universal frame-time guarantee.

## Public imports and composition

```ts
import { LayeredMonitor } from '@nabla/engine/monitors'
import { MonitorMenu } from '@nabla/engine/menus'
import { s3Instruments } from '@nabla/engine/monitors/presets'

const screen = new LayeredMonitor(s3Instruments.cluster)
await screen.ready
mount.add(screen.root) // host supplies a Three.js mount with suitable scale/orientation
screen.update(
  s3Instruments.clusterData({
    speedKmh: 120,
    rpm: 3200,
    gear: 4,
    load: 0.5,
    manual: false,
  }),
  performance.now(),
)
// Host owns the update loop and eventually calls screen.dispose().
```

`/menus` has no renderer or physics dependencies. `/monitors/html` is available
for explicit HTML use; a layered HTML surface also loads that backend lazily.
Importing `/monitors` alone does not fetch it. Old root exports still work.

The public `SceneView` injects the stock S3 recipe; it accepts a replacement in
its fourth options argument: `{ carInstruments: customRecipe }`. The lower-level
renderer under `src/render/entity/view.ts` requires explicit injection. The
catalog recipe owns display values/labels; the host still owns keyboard actions,
properties and saving. See [modularity progress](architecture/vehicle-modularity.md).

## Building the next monitor

1. Describe the surface and layers using `MonitorDefinition`.
2. Instantiate `LayeredMonitor`, await `ready`, and mount `root` on a mesh/console.
3. Feed `MonitorData.values` and normalised `bars` from the simulation or app state.
4. Optionally supply `MonitorMenuItem` entries and route focused keyboard input to `MonitorMenu`.
5. Handle returned actions in the host. Keep physics edits, portal destinations and persistence out of the artwork.
6. Stop updates when hidden and call `dispose()` when removing the monitor.

The library exports these contracts from the engine package. The car menu is the
first live keyboard-action example. Existing ship and portal screens have **not**
been migrated; a future host can connect the same library to their validated APIs.
There is no arbitrary web-page/script execution inside monitor definitions.

## Configurable equipment

The S3 instrument mounting and GPS casing geometry now live in a stock asset
adapter. `RetractableMount` is reusable outside vehicles; its host supplies time,
travel and duration. See [vehicle equipment](architecture/vehicle-equipment.md)
for the public modules, lifecycle and camera/mirror configuration.

## Other work included in this delivery

- Lighter, repaired A3 body/wheels, dark headlamp backing and wheel-well clearance;
  chrome Nabla emblems replace the original rings. See [asset provenance and rebuild notes](../assets/README.md).
- Custom S3: 400 CV, AWD, seven-speed automatic, reversible transmission safeguards,
  drift/burnout handling, bounded tire smoke, RPM-linked exhaust and discreet turbo.
- Removed duplicate drag that capped high-speed acceleration; regression benchmark
  covers reaching 250 km/h on level ground. Figures are game simulation measurements.
- Bilbao police Focus with front-wheel drive and its own livery/lightbar.
- Vehicle-up overhead camera with lower-quarter car framing, speed-dependent distance
  and wheel adjustment; corrected cockpit anchors and monitor placement.
- Portal clearance uses bodywork and tire outlines to avoid false blocking under pitch.

See [controls](controls.md), [vehicle catalog](../src/catalog/vehicles/README.md) and
[physics tests](../test/simulation/s3.test.ts) for the respective contracts.

### Tyre feedback

Studio connects wheel contacts from any occupied vehicle to reusable `TireMarks` and `TireSmoke`
effects. Contact normals orient the marks to the road; rear handbrake locking and
lateral slip control their intensity. Trails break on lost contact, vehicle changes
and jumps over six metres. The fixed ring holds 2,048 segments, emits at most at
20 Hz, and fades after 20 seconds using a shader clock (one draw, no textures).
Positions are relative to a local anchor to retain precision with floating origins.
`VehicleAudio.tires()` reuses the existing noise source for a quiet filtered squeal;
it respects sound-off and background-tab suspension. No physical grip is changed.

The effect is independent of the optional engine/powertrain preset. Rapier contact
flags and normals must pass through unchanged; the former Cannon contact-flag
restoration discarded real contacts and is removed. Ground-contact checks prevent
marks/squeal while airborne, and boats do not emit tyre effects. Regression coverage
drives the S3 and police car on Rapier ground and drives the police car through
Studio, checking both visible mark geometry and the Web Audio tyre gain.

### S3 aggressive launch

Hold either Shift key to apply full forward throttle in an AWD car with a tuned
powertrain (the S3 preset). From rest, the clutch raises engine RPM and transfers
more torque to the rear, with temporarily reduced rear grip. Rear slip drives the
shared smoke, marks and squeal, fading to normal grip by 54 km/h. Release Shift
to return to the ordinary accelerator. Reverse and the handbrake take precedence;
unlike the stationary Space+accelerator burnout, this launch never holds the front
brakes. Shift also cancels the entry camera transition. The drivetrain retains
its power limit; this is a launch mode, not unlimited extra engine power.

### Steering, lamps and paddle shifting

Keyboard road steering now builds with a 0.4-second time constant and releases or
countersteers with a 0.12-second constant. Analog input bypasses this filter.
The S3 front daytime strip switches to amber on the same 450 ms blink phase as
the selected rear indicator. Reverse emission uses the existing lower trunk lamp
surfaces, including their opaque backing, rather than a hidden inner emitter or
an additional coplanar quad.

Page Up shifts up and Page Down shifts down, entering manual mode (M1–M7 on the
HUD and cluster). B restores automatic D mode. Reductions exceeding 6,500 RPM are
rejected and successive shifts respect the DSG shift interval. Closed-throttle
engine braking depends on selected ratio and RPM, acts only with ground contact,
and fades near standstill; lower gears give stronger retention.

### Per-vehicle mirror elevation

`vehicle.mirrorTilt` stores the glass elevation in degrees (-5 to +12, default -2).
Open the car menu with J, enter ESPEJOS, select SUBIR +1 or BAJAR -1 with Up/Down,
and press Enter. The title displays the current degrees. Both side mirrors update
immediately while preserving the authored lens roll; no additional render passes
are introduced. Save the scene to retain the value. Omitted values in older scenes
use -2 degrees. Explicitly saved per-vehicle adjustments are preserved.

### Hierarchical car menu

The J menu now opens two sections: COLOR COCHE and ESPEJOS. Enter opens a section;
Up/Down scroll through its choices. VOLVER or Escape returns to the parent, while
J closes the screen menu. Mirror degrees appear in the mirror section heading.
Three closely spaced large rows replace the seven-row list: option text is approximately 2.5 times
its former size (+150%), with the selected item at the top beside the red marker.
`MonitorMenuItem.children` and `back` make the hierarchy reusable for other monitors.
