# One owned planet

Studio stores a version-3 `nabla-project` with a stable `planetId`, project name,
planet-fixed object identities and poses, portal relationships, and navigation
bookmarks. Each browser profile/origin owns its local copy. This is not yet account
synchronization: opening another person's file opens that file's planet.

The `locations` field remains an internal compatibility envelope. A native planet
has exactly one `planet` scene, whose geographic origin is a **working frame**, not
a world boundary. Bookmarks are destinations, not independent scene payloads.
Changing the working frame re-expresses root transforms from their planet-fixed
poses; child transforms stay local. Cars, containers and portals stay where they
were placed. The editor cursor and player entry point move to the destination.

## Saving and starting over

- **Archivo → Guardar en este navegador** retains the complete owned planet.
- **Guardar como…** and **Descargar planeta JSON…** export the complete project,
  including objects outside the current view. Asset files and generated OSM/terrain
  tiles are referenced, not bundled: the JSON is not a copy of Earth's map data.
- **Abrir planeta o archivo anterior…** validates the file before replacing the
  current in-memory project. Older v1/v2 native city scenes merge on import.
- **Nuevo planeta…** is an explicit confirmed action. It archives the current
  project under `nabla.project.v1.backup.<timestamp>` in the browser scene store,
  creates a fresh planet ID and default vehicles, and clears entry URL switches.
  Use **Guardar como…** first for a portable backup. Shared map caches remain intact.

Before the first startup migration, the original project is also retained under
`nabla.project.v1.before-planet-v3`. Migration preserves global UUIDs and positions,
renames colliding entity IDs, and remaps parent, road and portal references.
Legacy directed window routes retain their endpoints and modes, including
many-to-one connections. Nonplanetary legacy local scenes remain compatibility documents; new native
travel does not create them. Maximum imported file size remains 40 MB.

## Travel

**Ir** and GPS entry URLs navigate within the current planet. They neither create
vehicles nor switch planets. Destinations are remembered as bookmarks. A render
origin change may recreate streamed tile resources, but it does not replace the
owned planet. Playing still uses a simulation snapshot; stopping restores editing.
The same units and planetary frame are used by all objects. Local geometry remains
bounded, while root transforms can span the planet's diameter.

## Windows rather than long option menus

In Desktop mode, **Opciones** opens a movable/resizable Desktop window with
**Rendimiento**, **Sol y luna**, **Ubicación** and **Portales** tabs. The real controls retain
their event handlers and values across tab changes and window close/reopen.
Arrow keys, Home and End navigate the tabs. Gameplay input is suspended while
that settings window is visible. This change prioritizes settings windows; it
does not require the user to rearrange the editor's docked panels.

## Portal registry

All authored native portals now reside in the same planet scene and registry.
Place a portal in Madrid, travel to Zamora and place another: both remain available
for linking. Legacy directed windows remain compatible; newly authored links use the
reciprocal physical-pair contract. This removes the old city-membership gate; it is not a claim
that distant terrain/collision preloading and every long-distance traversal case
have been validated. Those streaming constraints remain relevant before crossing.

### Initial terrain placement

New planetary destinations place the cursor, player start, car and carrier on the
terrain at their own horizontal positions. Placement remains pending while data
loads and follows refinement from distant relief to native GLBs. Root entities
record a `groundOffset` (metres above support); the initial cursor records
`cursorOnGround`. These optional fields survive saving before terrain arrives.
An explicit object pose edit clears its automatic offset, and explicitly placing
the cursor disables its automatic ground alignment. Attached children keep their
parent-relative transforms. Catalog vehicles added at the ground cursor use their
catalog clearance. Arbitrary authored heights, including orbital poses, remain
unchanged. Old scenes are recovered only when they contain the exact untouched
reference trio at their original unplaced coordinates.

### Open a GPS destination from a URL

Open `https://chained.world/?lat=43.32969&lon=-1.819606` to start at Irún · Ventas.
`lat` and `lon` are decimal degrees (dot separator); their order does not matter.
The aliases `latitude` and `longitude` are also accepted. Both coordinates are
required, latitude must fit WebMercatorQuad (approximately ±85.05112878°), and
longitude must be between −180° and +180°. Invalid or conflicting parameters show
an error and leave the saved starting place intact.

An explicit GPS destination takes precedence over the previous active place and
legacy `scene`/`world` startup options. The existing planet and its objects are preserved. Travel never generates another
set of default vehicles; only a new planet receives them. The cursor follows terrain.
Coordinates do not grant private tile-generation access or change its limits.

Optional `alt` specifies absolute altitude in meters, using the same altitude datum
as scene GPS coordinates, rather than height above terrain. For example,
`https://chained.world/?lat=41.5033&lon=-5.7446&alt=1200` places the editor cursor
and view at 1,200 meters. New default vehicles start at that altitude plus their
normal clearance; existing saved objects keep their poses. Zero and negative
altitudes are accepted. Omitting `alt` retains terrain-aware placement.

Add `play` (or `play=1` / `play=true`) to start playing immediately in the flying
container cockpit, 120 meters vertically above the first car. Ground loading
finishes before entry. Flight mode is enabled automatically. This uses a temporary
simulation copy; stopping restores the editor's object placement. The scene must
contain a car and a flying container. `play=0` / `play=false` keep editor startup.
Example: `https://chained.world/?lat=43.32969&lon=-1.819606&play`.
The browser still requires a click to capture the mouse for looking around.

### Ship navigation HUD

Settlement names appear as white camera-facing world labels at 1,000 meters above
sampled terrain, at half the original display size. They are not drawn on the HUD.
The ship's forward glass retains its green attitude indicator, speed and absolute
altitude, updating at 10 Hz only while visible from inside. GPS screens show the
nearest loaded settlement; beyond 2 km it is described as nearby rather than as
an administrative municipality. No geocoding service is called. Street names are
not inferred from rendered GLBs. This does not change the `play` entry height.

Use **Ver → Escena / Propiedades / Vista 3D** to reopen closed panels, or
**Ver → Restablecer distribución** to recover the default editor layout.
