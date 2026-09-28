# Monitors: editing guide and implementation map

This is the starting point for the S3 instruments and for building further vehicle,
ship and portal-console displays. The monitor library belongs to the engine;
Studio supplies keyboard focus, scene editing and saving.

## Try the current examples

With the Docker Studio running, open:

- [S3 instrument preview](http://127.0.0.1:8080/monitors/speedometer.html): two smaller round dials, RPM left, speed right, and a wider central digital display. The sliders only simulate data in the preview.
- [Editable HTML panel](http://127.0.0.1:8080/monitors/html-panel.example.html): the retained HTML/CSS example with live bindings and refresh controls.

For `npm run dev`, use the same paths on port 5173 instead of 8080. Local URLs
require the server to be running; the source links below also work on GitHub.

In the S3:

| Key           | Action                                                   |
| ------------- | -------------------------------------------------------- |
| C             | Exterior → driver → overhead camera                      |
| H             | Retract/raise the GPS and its casing in 1.8 seconds      |
| J             | Open/close the paint menu on the GPS; enter cockpit view |
| ↑ / ↓         | Select a menu entry                                      |
| Enter         | Apply the selected paint colour                          |
| Escape        | Close the monitor menu                                   |
| Save / Ctrl+S | Persist the scene, including the chosen paint            |

The GPS stops map redraws immediately when retracting. The dashboard remains on.
An open menu suppresses driving input and holds the brake; the simulation continues.
Closing it releases keyboard focus. Paint changes edit the scene document through
its normal history, without recreating the running physics world.

## Where to edit

| What you want to change                                               | Source                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------- |
| Dial sizes, positions, needle pivots/ranges, speed and gear placement | [S3 layered definition](../src/catalog/monitors/s3-cluster.ts) |
| Dial artwork and central panel                                        | [Static background SVG](../assets/monitors/s3-cluster.svg)     |
| Needle shape/colour                                                   | [Transparent needle SVG](../assets/monitors/red-needle.svg)    |
| Standalone instrument preview                                         | [Preview HTML](../assets/monitors/speedometer.html)            |
| Menu layout, colour choices and emitted actions                       | [Car menu definition](../src/catalog/monitors/car.ts)          |
| Rich HTML panel appearance and bindings                               | [HTML example](../assets/monitors/html-panel.example.html)     |
| Mounting, GPS animation, power and telemetry                          | [CarInstruments](../src/render/entity/car-instruments.ts)      |
| Generic types, examples and integration rules                         | [Library contract](../src/render/monitors/README.md)           |

The preview and the live S3 share artwork, but not a live DOM: changing preview CSS
alone does **not** change the in-game layout. Edit the layered definition for that,
and mirror the placement in the preview HTML. Reload Studio after editing assets.
The S3 no longer uses HTML rasterisation for its instruments.

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

## Other work included in this delivery

- Lighter, repaired A3 body/wheels, dark headlamp backing and wheel-well clearance;
  chrome Nabla emblems replace Audi rings. See [asset provenance and rebuild notes](../assets/README.md).
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
