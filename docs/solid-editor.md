# Solid and building editor

Buildings are individual `solid` entities. Each owns local-space vertices, explicit edges and polygon faces in `geometry`; color, rigid transform, parent, name and identity belong to the entity. The reference circuit now has one entity per surveyed building, rather than a box and separate window strips. Existing reference boxes migrate to solids without changing their placement or dimensions. Recognised unmodified reference window strips are removed; custom objects are retained.

## Editing

1. Choose **Scene + → Edificio**, or select an existing building. **F** frames it.
2. Choose **Editar geometría** in the inspector. The transform gizmo yields to geometry tools. Blue points and edges expose the topology; white marks the selected vertex, gold marks the selected face and pending perimeter vertices.
3. Optionally choose **Vaciar geometría** to start from scratch (undoable). Choose **Puntos**, **Líneas** or **Planos**. A click selects a nearby existing point or places a point on the chosen local drawing plane, snapped to 0.25 metres. Choose XZ, XY or YZ and a local offset to draw at different heights or depths. The grid shows that plane. Drag to orbit as usual.
4. Points places individual vertices. Lines connects two clicks. Planes collects vertices around a convex perimeter; **Crear cara** completes it. **Cancelar trazo** clears the pending selection without deleting already placed vertices.
5. Select a point in the inspector to change XYZ. Moving a corner triangulates its incident polygons so a bent surface remains composed of planar faces. Deleting a vertex also deletes its incident edges and faces.
6. Select a face to highlight it, set an extrusion distance and choose **Extruir cara**. This moves the cap and adds side faces. Negative distances extrude in the opposite direction. **Borrar cara** opens the surface. Explicit lines can also be deleted; face perimeter edges still appear while that face exists.
7. **Terminar geometría**, Escape, Move or Rotate returns to entity editing. Play also exits geometry mode.

Color and Duplicate act on the entire building. Duplicates own deep copies of topology; edits never change their source. Completed actions use the existing transactional undo/redo and JSON save/import pipeline. Pending perimeter selection is transient UI state.

## Runtime and scope

Polygon faces must be convex, planar, nondegenerate and ordered around their perimeter. JSON validation rejects invalid indices, crossed loops, concavity and nonplanar faces before changing the scene. Split a concave outline into convex faces. Vertices use metres in entity-local coordinates; `size` remains preset metadata, while topology controls the actual surface.

Rendering triangulates faces, with double-sided surfaces. Static collision uses thin outward convex triangle prisms, rather than a hidden bounding box or convex hull, so deleted faces are real openings. This supports concave arrangements of individually convex faces and Cannon character, vehicle and ray contacts. Points and explicit lines do not collide. Solids can be static or visual-only, not dynamic rigid bodies in this release.

This is a first topology editor, not a boolean/CSG modeler. It does not guarantee watertight manifolds or detect intersections between different faces, weld coincident topology, unwrap UVs, bevel edges or perform boolean subtraction. Extrusion needs sensible distances and outward perimeter winding; intersecting extrusions remain authoring errors. Closed volumes are assembled from faces. Very complex meshes increase draw, validation and collision cost; the document limits topology size.

## Catalog direction

The scene owns entity instances. A future catalog should supply versioned presets or factories that return entities (or subtrees with remapped IDs), not add catalog-specific behavior to the renderer. Building presets will provide topology and appearance; vehicle presets already supply vehicle definitions and visual assets; portal/gallery presets can supply coordinated subtrees. Inserting a preset should make a local editable copy. Shared linked instances and asset-version upgrades should be explicit future operations, never implicit changes to authored scenes.

The public engine exports `SolidGeometry`, `boxSolid`, `extrudeFace`, `removeVertex` and `validateSolid`. The browser `SolidEditor` is an adapter that commits topology through `SceneEditor.update`; it does not own a second document or undo history.

## World cursor and precise operations

The **Cursor 3D** menu exposes a persistent insertion point in scene metres. Shift-click
on a visible surface to place it, or enter exact X/Y/Z coordinates. With no surface,
the ray falls back to the horizontal world plane. The visible cross and ring appear
only in the editor. Cursor coordinates are saved in scene JSON and support undo/redo.

All add actions use this point. Catalog vehicles and streetlights retain their ground
clearance; portals place their lower edge at the cursor and add a linked, closed pair.
Sprites use their existing pivot convention. Gallery roots are offset by the cursor.

- **Cursor a la selección** copies the selected object's world origin.
- **Selección al cursor** moves its world origin while respecting its parent transform.
- **Origen del sólido al cursor** rebases editable solid vertices and direct children,
  preserving their world positions. Imported vehicle/GLB pivots are not rewritten.
- G/R select translation/rotation. X/Y/Z restrict the gizmo; Escape restores all axes.
  The menu also applies an exact world-axis displacement in metres or rotation in degrees.
- Geometry mode uses local axes. A point extrudes into an edge, an edge into a quad,
  and a face into a surface shell. Enter an exact distance and choose X/Y/Z, or use the
  face normal. A parallel/degenerate extrusion is rejected without changing the scene.
  Drawing can lock the other two coordinates to the selected point.

Select a generated road and use **Convertir carretera en sólido editable** to detach
its procedural road component into editable triangles with physical surfaces. This is
an explicit edit of that tile; it is no longer regenerated as an ordinary road strip.
This supports authored ramps and bridge decks, but does not excavate the terrain.
Solid wall panels can be built from an edge, extruded vertically, then given thickness.

## Editing across places

The map streams around the editor's orbit target as well as the player. Streaming
pauses while dragging a gizmo or drawing geometry. Use **Ir** for city presets or GPS
coordinates to establish a fresh local origin, avoiding planet-sized local coordinates.
The current map providers cover latitudes from -85 to 85 degrees.

Before travelling, the current scene is archived in browser storage under its latitude
and longitude (six decimal places). Returning to the same destination restores that
scene, including edits, cursor, and placed portals. Storage failures cancel travel before
replacing the current scene. These archives are private to this browser; export scenes
for backups or transfer. They are not uploaded to OpenStreetMap or the preparation cache.

Portals can be placed at any loaded destination. Linking/seeing through/traversing
portals across **different archived scenes** is not implemented yet; existing portal
links operate within the currently loaded scene. Actual tunnels also require terrain
cutouts and matching collision, rather than merely adding an underground corridor.

### Editing a building from the map

OSM buildings are selectable but initially use grouped rendering. Select one and
choose **Crear modificación** in its properties before changing its color,
transform or solid geometry. The same entity becomes editable (`mapEditable: true`)
and leaves the render batch, retaining its OSM source identity. Save the scene to
keep this exception; undoing the opt-in returns it to grouped rendering. An editable
building can then be duplicated and reshaped. See the
[performance guide](performance.md#map-building-batches-and-editable-exceptions)
for memory and streaming limitations.
