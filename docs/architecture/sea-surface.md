# Sea and river surface

Studio uses `src/render/planet/ocean-sheet.ts`, replacing the unlit 400 km radius
flat circle. Its surface shares `water-material.ts` with the existing river
landcover renderer: three drifting samples of the same normal texture and
standard Three.js solar lighting/shadows. Planetary water meshes use the same
material factory through `PlanetWorld.useSea`. No reflection camera is created.

The sea is a single opaque, depth-tested spherical cap. Fragment depth is the
true sphere hit inset a few centimetres along the planet normal so land at the
waterline wins without a view-axis pull, which would walk the shoreline inland
under a look-down camera. The sheet follows the camera,
with 48 logarithmically spaced rings and 128 angular segments (12,160 triangles).
Detail concentrates near the boat. View distance changes rebuild the bounded
geometry; camera motion only updates its transform. Terrain occludes water, so
this needs no coastline vector downloads, water worker or additional map requests.
The only water asset is the existing normal texture. Render-origin changes are
added back to wave coordinates to prevent the wave pattern jumping during travel.

The manual zero reference is exactly 0 metres on the same mean-radius sphere used by boat
buoyancy. Origin elevation and spherical curvature are included, so the water
does not rise above the terrain when travelling away from the map origin. Rings
approximate the sphere between vertices; the dense inner rings serve navigation.
This is visual wave shading, not displaced geometry, simulated swell or wakes.
It relies on terrain coverage for shorelines; missing land geometry remains a
separate streaming issue. It does not infer new collision masks from water colour.
The older vector-coast `SeaWater` implementation remains unused by Studio.

The existing **Fueraborda 6 m** in the object catalogue is the navigation vehicle.
Three boat tests cover buoyancy, forward movement, steering, and navigation 12 km
from an origin elevated 125 m. Geometry tests verify spherical altitude and fixed
triangle count. Browser tests verify no coastline requests, visible animated waves,
one draw call, stable rebasing and geometry reuse. The same normal shader remains
on rivers. No saved user scene is replaced to insert a boat.

The Capas tab exposes a session-only sea-level slider and numeric input from −5 to
+50 m, with reset to zero. Changing the level scales/translates the spherical cap
without rebuilding its buffers. Simulation boat buoyancy uses the same selected
level. River meshes retain their authored terrain elevations; higher water covers
low ground and rivers where appropriate. This is a height visualization, not a
hydraulic flood model: it does not test connectivity, levees or water flow. Terrain
sampling errors and missing land meshes can affect the displayed shoreline.

Source backup before this repair:
`/home/txema/backups/nabla-sea-20260928/source.tgz`.

## Simplified tide

Studio starts in **Marea simplificada**, with ±1 m about zero. A cosine cycle
repeats every 12 h 25 min using the same live/fixed scene time as the sky. The
phase has an arbitrary UTC epoch; it is intentionally not a prediction for the
camera's location. No network, lunar ephemeris, station data or weather is used.
`src/planet/tide.ts` owns the pure calculation. Amplitude can be set from 0 to 3 m.
Fixed sky time freezes the tide; changing sky time samples the corresponding phase.

Capas shows rising/falling/high/low water and the current level. Typing a manual
level or resetting to zero switches to Manual; selecting tide resumes the cycle.
Settings are session-only. The whole visible sea and boat buoyancy share the
calculated level; rivers retain their authored elevations. Geometry is reused.

## Coastal water in cached tiles

Published coastal water polygons duplicated the ocean cap. The tile worker now
removes triangles whose three vertices are within 0.5 m of sea datum **before**
rendering and collision extraction. The publisher applies the same filter to new
native tiles. There is no second tidal shader: only the ocean cap moves with the
selected level. Elevated river water retains its geometry and wave material.

This is a near-zero coastal approximation, not a connectivity analysis. Triangles
crossing the threshold remain to avoid cutting holes into elevated rivers. Generic
terrain is never removed merely because it is at zero; only terrain explicitly
marked `marineFill` can be filtered this way. The elevation publisher separately
omits its existing unmeasured marine samples. Actual underwater terrain is retained.
A browser depth test verifies the duplicate has zero indices and land at −2 m
becomes visible with the sea at −5 m, then submerged again at +1 m.
