# High-resolution photos

The camera button immediately left of Play downloads a PNG with a 15,360-pixel
long edge, preserving the current viewport aspect ratio (15,360 × 8,640 at 16:9).
The progress dialog can cancel the operation; Escape cancels too. The simulation,
sky clock and tile installation pause until export finishes, then resume without
advancing physics by the time spent capturing.

`src/render/capture.ts` owns tiled rendering and PNG encoding. Studio owns the
button, frozen scene, progress, helper visibility and download. The exporter uses
at most 1,024 × 1,024 pixels per draw, retains the renderer's canvas antialiasing,
tone mapping and colour conversion, and compresses scanline bands using
CompressionStream. It never requests a 16K GPU texture or a full-image canvas.
At a 15,360-pixel width, one RGBA band is approximately 60 MiB; compressed output
is retained for the final Blob. Complex images can still take substantial time
and memory. Errors and cancellation restore renderer dimensions, pixel ratio,
viewport and scissor state.

The image excludes application chrome, selection outline, grid and editor cursor.
It preserves the sun, sky and portal views; sky projection and the sun flare use
the same tile framing. Enabled shadow maps temporarily use 2,048-pixel resolution
and are restored afterwards. Shadows remain disabled when the user disabled them.
Screen-space depth-of-field and the weapon HUD are omitted from the export.

This renders the currently loaded geometry at higher raster resolution. It does
not fetch a larger region, replace the selected LODs or invent missing geometry.
The capture camera is a clone and does not change the user's saved viewpoint.

Browser checks download and inflate a complete 16K PNG, cancel a second photo,
and compare a non-divisible multi-tile image against a single render to catch
orientation, missing rows and seam errors. No generated image is sent to a server.
