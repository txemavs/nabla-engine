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
the reveal gate opens. The game host defaults to an empty list: only vehicles
already in the initial scene are prepared at startup. Hosts may explicitly opt in
through `NABLA_BOOT.preloadVehicles` or `VITE_NABLA_BOOT`. Accident replacement
candidates are not implicitly preloaded either.

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

`placeVehicle` loads the parked model immediately and waits for it to be ready.
First entry through the shared interaction action calls `prewarmVehicle`; spawning
and parking do not run the full driving warmup.
Assemblies with matching visual/vehicle definitions share the preparation promise;
placement does not invalidate it. Different visual/vehicle definitions may need
separate preparation. Work is serialized to avoid
concurrent preparation draws. Required eager preparation completes before play is
revealed; it is not abandoned after a fixed intro timer.

On first entry, preparation pauses active gameplay and shows the simulation module and
actual model/material/texture/shader/mirror phase in a PLEASE WAIT badge. The
browser gets paint opportunities between phases. Cached preparation does not
show these phases again. Failed preparation is evicted for retry and entry
does not continue with an unprepared vehicle; its parked model remains visible. A previously paused session stays
paused; a session that ended during preparation is never restarted.

This is deferred presentation preparation, not a separate physics engine per
vehicle type. The shared physics engine remains loaded; vehicle bodies are added
when the vehicle is placed. There is no artificial minimum loading duration.
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

## Pistola y cámaras (octubre de 2026)

La precarga incluye las reservas de expulsión, impactos y humo en ambas vistas,
la luz frontal del fogonazo y las variantes de foco/túnel. Se usa la iluminación
final de cada vista; preparar solo el modelo con luces de estudio no basta.
Véase [weapon-camera-controls.md](weapon-camera-controls.md) para el contrato y pruebas.

## Pending investigation: container preparation

The user reports a long stall at **Rendering scene and shadows** when preparing
the container. The exact cause has not been isolated. Measure that phase with
and without the container, separating geometry upload, shader compilation, shadow
passes and its monitor/portal renders. Identify which work is required for the
parked exterior and which belongs at first interaction; improve that path without
removing the visible parked model or imposing a timeout on preparation.
