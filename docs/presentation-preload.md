# Presentation preparation and fixed light budgets

## Why adding a pole could freeze the game

Three.js shader variants include the number and type of visible lights, including
lights with zero intensity. The old neighbourhood lamp created a new `PointLight`
per pole. Adding one therefore invalidated the lighting variant used by many
unrelated materials, even in daylight. In the full-game diagnostic run, each globe
changed 12 to 13, then 14 point lights, added 38 shader programs and caused
multi-second render stalls. Installing the entity and physics took milliseconds.

Highway lamps use downward `SpotLight` cones. They already shared six lights, but
allocated the pool lazily on the first highway pole. That first addition could also
change the shader topology. Neither type casts shadows.

Both pools now exist when `Streetlights` is constructed, before startup shader
preparation. `lightingDefaults.streetSpots` and `streetPoints` independently default
to six. `Streetlights` also accepts an explicit `{ spots, points }` budget. Changing
the budget is a startup configuration change, rather than a live menu adjustment.

Each update assigns spots to the nearest enabled highway poles and points to the
nearest enabled neighbourhood globes within draw distance. Positions, colour,
intensity and reach change; the number, visibility and shadow flags of the pooled
lights do not. Daytime, disabling or removing poles sets intensity to zero without
removing lights. The fixture remains visible and its lens still glows when enabled,
even outside the illumination budget. Distant poles thus do not all illuminate the
ground: the limit is six lights of each type at once. These pools are separate from
geographic field lighting and occupied-vehicle headlights.

Newly placed primitive materials also register with the same shadow preparation
callback as initial objects. Otherwise a late pole used a different material
variant despite identical geometry and lighting.

## Preparation during opening credits

`GameRuntimeOptions.preloadVehicles` lists vehicle assemblies to prepare before
the reveal gate opens. The game host defaults to `car`, `vfr800` and `white-truck`;
`NABLA_BOOT.preloadVehicles` or `VITE_NABLA_BOOT` can replace that list. An empty
list disables eager menu preparation. Large ships remain on demand by default.

The existing startup pass prepares the actual cockpit, chase and start camera
views. The added `preload` stage then prepares menu vehicles using a temporary
`SceneView` with the same presentation recipe, mirror quality, saved adjustments,
vehicle shadow policy and shadow-material callback as gameplay. This includes
mounted instruments, paint/environment materials and wheel models. Preparing the
original GLB alone missed those generated material variants.

Textures upload one per animation frame. Mounted materials compile asynchronously
against the real scene's lights. A one-pixel offscreen draw uploads geometry and
prepares applicable mirror captures. Temporary vehicle groups join the real scene
only for this synchronous draw, without the temporary view's light pools; no
preparation vehicle joins the document or physics. The renderer's previous target
is restored. Prepared views remain owned by the runtime until disposal so their
shader programs remain cached.

`prewarmVehicle` uses the same path for an uncommon menu selection and spawning.
Assemblies with matching visual/vehicle definitions share the preparation promise;
paint colour and placement do not invalidate it. Work is serialized to avoid
concurrent preparation draws. Required eager preparation completes before play is
revealed; it is not abandoned after a fixed intro timer.

This moves predictable work into startup and prevents light-count recompilation.
It cannot promise a fixed load time or uninterrupted animation on every driver:
GLB parsing and individual GPU uploads remain indivisible, and asynchronous shader
compilation depends on browser/driver support. Loading unseen terrain, an uncommon
asset or changing quality can still require new work.

## Validation

The browser regression checks stable light/program counts while adding three
highway and three neighbourhood poles, then checks that a fully mounted prepared
car does not add shader programs on its first live render. Unit coverage checks
independent budgets, nearest assignment, daytime, removal and disposal. Timings
from headless Chromium with software rendering diagnose CPU/compilation stalls;
they are not hardware GPU benchmarks.

The full Euskadi diagnostic on port 5204, using the same headless Chromium path,
added two globes in 2.3/1.2 ms and two cars in 7.4/6.4 ms. All four operations kept
215 programs, 19 spots and 18 points. The slowest observed render after these
operations was 13.7 ms. Before the change, globe additions produced 7–10 second
render stalls and the first added car produced a 3.5 second stall. This run took
approximately 113 seconds to become playable, including terrain/network loading
and preparation of 26 host vehicles; it does not measure startup improvement.
