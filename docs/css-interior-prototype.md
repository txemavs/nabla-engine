# Carrier interior and CSS screen prototype

The original 5 × 10 carrier now has a visible interior lining: floor, ceiling,
side panels, structural strips, emissive light strips and a central bulkhead.
The existing vehicle-local collision shell and walking/flight support remain the
physical reference. The ramp, end gates and central doorway remain open. This
is presentation geometry, not a new adjustable-thickness wall authoring system.

## Try it

In edit mode, choose **Options → Carrier CSS screen demo** (Spanish UI:
**Opciones → Prueba · pantalla CSS de la nave**). This frames the wall display
inside the carrier. Click the panel to add CSS dots; Shift-click clears them.
Drag outside the panel to orbit and inspect its perspective. The dots are a
bounded, temporary demonstration (256 marks), not saved scene content.

The display stays attached to the carrier during movement and flight. It is
visible in play mode; drawing is enabled only in edit mode so it does not
interfere with mouse capture, aiming or vehicle controls.

## Composition

`CSS3DRenderer` renders actual HTML elements behind the WebGL canvas. A matching
2.4 × 1.3 m plane writes zero RGBA with depth testing and no blending, opening a
window in the canvas. The DOM transform uses the screen's world matrix and the
same rebased camera as the main view. Foreground opaque geometry can therefore
occlude the display; this is not a fixed screen-space HUD or an HTML screenshot.
A first-hit ray test maps pointer coordinates to the panel's local drawing space.

The main camera receives the CSS aperture only during its render pass. Portal
render targets see a solid placeholder because their textures cannot capture
live DOM. CSS content does not receive scene lighting, fog or shadows, and CSS
objects do not generally share WebGL's depth buffer. Multiple overlapping CSS
screens and transparent foreground surfaces need further composition work.
Browser zoom should remain at 100% for the Three.js CSS renderer.

This validates a perspective-matched CSS surface within the 3D cabin. It does
not yet provide a six-sided CSS world, nested CSS/WebGL portal views, persistent
CSS documents, arbitrary embedded application interaction or adjustable physical
wall thickness. Those can build on this experiment once the visual behavior is
accepted.
