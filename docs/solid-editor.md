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
