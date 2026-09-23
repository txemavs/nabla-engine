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
**Rendimiento**, **Sol y luna**, **Ubicación** and **Portales** tabs. The real controls retain
their event handlers and values across tab changes and window close/reopen.
Arrow keys, Home and End navigate the tabs. Gameplay input is suspended while
that settings window is visible. This change prioritizes settings windows; it
does not require the user to rearrange the editor's docked panels.

## Named portal registry and remote windows

**Add → Portal** creates one closed mouth at the 3D cursor, without a partner.
Its transform origin is the aperture centre. For a frame standing on level ground,
place that centre about 1.6 metres above the surface, then adjust it with the gizmo.
Rename it in the ordinary entity inspector.

**Portales** opens the project-wide registry in Desktop mode. Each row shows the
portal and its location; selecting it opens that retained place and selects the
entity for editing. Choose a compatible destination in the inspector. Ship consoles
also list portals in other saved locations.

The optional version-2 `connections` list stores directed remote-window routes:
`{ source, destination, mode: 'closed' | 'window' }`. Endpoints use the global
root UUID plus the local mouth ID (or the location ID for non-geographic scenes).
Names are read from entities, so renaming does not break links. Deleting an endpoint
or changing its aperture dimensions removes incompatible routes on synchronization.
A local Engine pair still uses its existing reciprocal traversal contract.

Remote windows prepare a separate scene and destination atmosphere in that scene's
working frame. Preparation is asynchronous; the aperture stays black until ready.
The initial budget is two destination scenes, 1.5 km draw distance, 1 km roads and
one portal recursion level. Remote scenes show retained authored data, without
their own physics, extra map streaming, or shadow cascades. Closing/reconfiguring
a route or rebuilding the scene releases the remote GPU resources.

**Cross-city physical traversal is not implemented.** A remote connection exposes
only Closed/Window, not Open passage. The ship garage must be fully closed to open
its remote window. An orbiting ship can look at a saved city through its stern
portal, but leaving the ship through that window and returning to a persistent
orbital simulation still requires the transfer work in [planetary-world.md](planetary-world.md).

### Madrid / Zamora trial

1. Use **Ir → Madrid · Sol**, put the cursor where the frame should be, add a
   Portal and name it “Puerta del Sol”.
2. Use **Ir → Zamora · Plaza Mayor**, add and name another portal.
   The destination preset is centred near 41.50354, -5.74665
   ([OSM-derived location](https://mapcarta.com/es/W46122017)).
3. Return to the saved place containing the ship. In its portal console, select
   either named city portal. Close the garage and open the window. Flight changes
   the source pose while the destination remains in its own frame.
4. Use **Archivo → Guardar como…** to preserve both places and their routes in one file.

The initial migration can recover legacy `nabla-place:*` browser snapshots when
there is no saved project yet. Opening a named project disables that fallback, so
unrelated scenes from previous projects are not pulled into the opened file.
**Ir → Lugares de este proyecto** reopens any retained location without a network
request. Raster Esri/CARTO tiles are no longer requested by the Studio runtime;
the local example can still show its authored floor texture and planetary backdrop.
