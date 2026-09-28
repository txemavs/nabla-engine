# S3 instruments and monitor templates

`/monitors/speedometer.html` previews the A3-inspired twin dials with a digital
speed readout between them. RPM is on the left, speed on the right.

- Background artwork: `s3-cluster.svg`.
- Transparent needle artwork: `red-needle.svg` (PNG with alpha also supported).
- In-game positions, scales, rotation ranges and bindings: `src/catalog/monitors/s3-cluster.ts`.
- The preview HTML positions mirror that definition; CSS edits here affect only the preview.
- The live car uses `LayeredMonitor`: no HTML rasterisation or texture uploads for needle/digit updates.

## HTML panel example

The previous editable HTML example is retained at `/monitors/html-panel.example.html`.
It is still usable by `HtmlMonitor` for richer layouts that need HTML/CSS.

Bindings supplied by `CarInstruments`:

| Binding  | Text             | Bar range  |
| -------- | ---------------- | ---------- |
| speed    | km/h             | 0–320 km/h |
| rpm      | engine RPM       | 0–7000 RPM |
| gear     | D1–D7 or R       | —          |
| throttle | engine load in % | 0–100%     |

Use `data-value="rpm"` for text or `data-bar="rpm"` for a CSS width binding.
GAS represents throttle/engine load, not measured longitudinal acceleration.
Keep the monitor at 640×320 CSS pixels, or change the dimensions passed to `HtmlMonitor`
and the mounting plane's aspect ratio together.

The reusable renderer is `src/render/monitors/html-monitor.ts`. Create one instance
with a trusted local template URL, put `.texture` on a Three.js mesh, call
`.update({values, bars}, nowMilliseconds)` only while visible, and `.dispose()` on removal.
The template can specify `data-update-ms="150"` (milliseconds, 50–5000).
You can also pass a fourth constructor argument `{ intervalMs: 250, adaptive: true }`
or call `setInterval(250)` at runtime. `setSecondary(true)` multiplies the interval
by four. Studio marks the car dashboard secondary outside cockpit view.

Adaptive refresh increases the interval when observed frame times or image decode
latency rise. All HtmlMonitor instances share one pending rasterisation slot to
avoid bursts. Inspect `.diagnostics` for render count, skipped unchanged updates,
effective interval and decode latency. This is a heuristic, not a hard GPU budget.

Bindings and DOM nodes are retained; only changed bound text/style is modified.
Bars are quantised to 1%, RPM text to 50 RPM. Unbound variables do not trigger work.
Unchanged displayed data skips serialisation, image generation and texture upload.
When displayed data changes, the current HTML backend still rasterises and uploads
the complete small texture: it is not a zero-cost reactive DOM or partial GPU upload.
A stopped GPS also skips updates; its refresh follows the same adaptive interval.
Parked, unoccupied vehicles do not update their displays. Scripts are not executed by the renderer. Use inline CSS and system
fonts; external images/fonts, interactive forms, CSS animation and embedded pages
are not supported in the texture. This is HTML/CSS rasterised into WebGL, so depth,
mirrors and screenshots work with the existing renderer.

The first converted monitor is the S3 speedometer. The GPS and carrier displays
still use their existing canvas renderers; they have not been migrated by this change.
