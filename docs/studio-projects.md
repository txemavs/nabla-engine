# Named projects and geographic places

Studio's **Archivo → Guardar como…** downloads a named `.nabla.json` project.
**Abrir proyecto o escena…** accepts either that format or a legacy scene JSON.
Version 2 also stores authoritative planetary poses and stable IDs for root objects;
version 1 files migrate on open. See [the planetary model](planetary-world.md).
A project contains its name, active location and all locations retained during
navigation. Each location holds an ordinary validated Engine scene in its own
local coordinate frame. Entity IDs are scoped to that scene, so two cities can
both contain `car-a` without colliding in the file.

Saving a file is an explicit portable backup. **Guardar en este navegador**
remains a separate browser-local recovery copy. Browser storage is isolated by
origin (including port); neither copy is automatically uploaded to the server.
Exports reference the app's assets by URL; they do not bundle GLBs or textures.
The current file limit is 40 MB and 64 locations. This first format includes the
loaded map entities, rather than a compact authored-overlay archive.

## Travel and rendering

Both **Ir** and **Ubicación → Cargar lugar 3D** load terrain/road/building geometry.
Applying GPS no longer merely repositions the example over raster imagery.
The standard Irún shortcut uses the same travel transaction and the bundled
Ventas terrain extract on first visit. Other new destinations use the existing
world loader. Returning to a retained place restores its edited scene.

Travel retains the departing authored scene in the project and writes the active
project to browser storage when the destination has loaded. On reload the active
project location takes precedence over the old single-scene startup slot. Playing
still operates on a simulation snapshot; driving positions are not authored edits.
A project file includes the current in-memory edits even before a local save.

An old raster-only cached place is not accepted as a prepared 3D destination.
Geographic rendering is also recreated when switching between a local scene and
a terrain scene at the same coordinates, preventing a stale raster layer from
surviving the switch.

## Windows rather than long option menus

In Desktop mode, **Opciones** opens a movable/resizable Desktop window with
**Rendimiento**, **Sol y luna** and **Ubicación** tabs. The real controls retain
their event handlers and values across tab changes and window close/reopen.
Arrow keys, Home and End navigate the tabs. Gameplay input is suspended while
that settings window is visible. This change prioritizes settings windows; it
does not require the user to rearrange the editor's docked panels.

## Cross-city portals: remaining work

The project format can retain multiple cities, but current Engine portals still
link entities inside one scene. Cross-location portal targets, remote rendering,
streaming readiness and player/vehicle transfer are not implemented by this change.
They need explicit `(locationId, entityId)` references and frame conversion, plus
failure handling when a destination is unavailable. Do not merge distant cities
into one enormous local-coordinate scene to simulate that behavior.

The initial migration can recover legacy `nabla-place:*` browser snapshots when
there is no saved project yet. Opening a named project disables that fallback, so
unrelated scenes from previous projects are not pulled into the opened file.
**Ir → Lugares de este proyecto** reopens any retained location without a network
request. Raster Esri/CARTO tiles are no longer requested by the Studio runtime;
the local example can still show its authored floor texture and planetary backdrop.
