# Studio desktop UI

Studio consumes `@nabla/desktop` 0.2 and Vue single-file components. The editor,
renderer and simulation keep their existing ownership. Vue observes only UI state
and property descriptions, not the Three.js scene or physics world.

## Boundaries

- **Desktop library:** docking and window lifecycle, command menus/toolbars,
  property fields/sheets, sidebar tabs, tree view and activity log. These components
  have no knowledge of planets, entities or vehicles and can be reused by Agency.
- **Studio:** menu definitions, scene classification, property/capability adapters,
  preferences organization, selection and input ownership.
- **Engine:** validated scene data, history, rendering and simulation. It does not
  depend on Vue or Desktop.

`studio/ui/state.ts` contains shallow UI snapshots and the shared command registry.
`ui/menus.ts` describes the menu structure. Commands execute the registered editor
operation, rather than forwarding synthetic clicks to another button.
`ui/properties.ts` adapts entity components to the library's property descriptions.
The same `SceneEditor` transactions retain validation and undo/redo.

The host's existing specialized geometry/map controls and performance controls are
mounted through an explicit `HostContent` boundary. Their listeners and lifecycle
remain owned by Studio. They are not part of the reusable desktop library. This
boundary allows those specialized editors to be converted independently without
reimplementing their behavior during the shell integration.

## Workspace

The default workspace has Vista 3D above Información/Secuencias; Escena/Capas/
Generación above Propiedades on the right. Información is initially selected.
Layout persistence uses `nabla.studio.layout.v3` (mobile: `mobile.v2`), leaving older
layouts untouched. Ver restores hidden panels and resets the arrangement.

Escena groups authored objects visually by components. Categories are not scene
parents and do not change transforms or saved hierarchy. Portals are objects in
Escena and have their own destination/connection properties. They are not global
preferences. Generated map content remains separate from authored entities.

Preferences are Interfaz, Planeta, Rendimiento, Almacenamiento and Desarrollo.
Sky and location already belong to the scene; the optional scene `water` record now
stores tide/manual mode, manual level and tide amplitude. Saving/exporting a
project includes these values. Missing water settings use the existing tide defaults.
Manual water edits use editor history and are committed on field change.

Generation and sequences are reserved panels. Monitor creation remains a later
feature; the existing monitor runtime APIs and vehicle equipment are unchanged.
Axis locks are saved in the project’s optional `editorState`, scoped by location and entity.
They remain editor metadata and are not added to the engine’s entity schema.

## Development and verification

`npm run typecheck` checks engine TypeScript and Vue templates. Vue's current checker
requires the JavaScript compiler API, so `typescript-vue` is a pinned TypeScript 5.9
alias used only by `scripts/typecheck-vue.cjs`; the engine retains TypeScript 7.

The vendored Desktop tarball is built from the corresponding `nabla-desktop` source
checkout; no package has been published. The dependency and lockfile contain its
integrity. Rebuild/repack and restart Vite with `--force` after changing that tarball.

Use `NABLA_TEST_PORT` for a separate browser-test port. A host preview can set
`NABLA_STUDIO_UPSTREAM=http://127.0.0.1:8080` to proxy terrain services without
changing the Docker gateway configuration.

Targeted browser journeys are `desktop-studio.spec.ts` and `studio-ui.spec.ts`.
They cover docking/content retention, panel recovery, preferences, edit/history,
vehicle configuration, portal properties and project settings persistence.

## Play, vehicle equipment and runtime restoration

The Desktop registry invokes commands with a context object. Studio host operations
must be wrapped as zero-argument callbacks. Never bind `togglePlay(startFlight)`
directly: a context object is truthy and would select flight entry, moving the carrier
to the first car instead of starting at the saved player spawn. Play awaits physics
initialization before preparing collision data or releasing its transition guard.

A SceneView used by simulation cannot take the editor's pose-only reuse path, even
when its avatar is hidden in the cockpit or after Stop. Simulation reparents wheels
into world coordinates and changes equipment/portal state. Returning to the editor
rebuilds that view from the authored document; ordinary editor moves still reuse meshes.

Vehicle properties include **Equipamiento visual**. Select the recipe matching the
model: **Policía Bilbao · decoración y sirena**, **S3 · luces, cuadro y espejos**, or
**Wrangler · pintura y cristales**. If a saved car shows **Sin equipamiento**, select
its recipe and save. This explicitly writes `visual.presentation`, is undoable, and
preserves wheel definitions, tuning, model transforms and position. No filename
fallback or silent conversion of saved vehicles is introduced. Custom recipe IDs
are retained. Paint is also available for S3 and Wrangler vehicles in Apariencia.

The carrier horizon consumes vehicle telemetry's local planetary `up` vector. Its
projection runs after the camera and scene share the same floating render origin;
nose-up attitude moves the horizon down on the display. Boat readings retain their
independent glyph-only updates.

Regression coverage also includes `police.spec.ts` (decals and runtime lifecycle)
and `navigation-readings.spec.ts` (bank/pitch and planetary vertical).

## Scene trees, precise transforms and capability drafts

Scene defaults to the authored **Jerarquía**, with a right-aligned selector for
**Por clase**. Both views use the Desktop TreeView, with the same disclosure
triangles and entity selection. Classification never changes a saved parent.

**Objeto → Transformar…** applies a relative translation (metres) or rotation
(degrees), using object-local or scene-global axes. Rotation preserves the object
origin; the scene graph converts the result back to its parent coordinates. A
single editor transaction makes the operation undoable. Cancel discards the form.
Locked position fields prevent relative translation until unlocked. Global refers
to the scene coordinate system, not a geographic north/east/up frame.

Existing vehicle capabilities use drafts with Apply/Cancel. Engine/transmission,
wheels/suspension, collision bodies and cockpit fields are separate groups;
interior and garage have separate editors. Mobility flags are not editable here:
this UI configures existing capabilities and does not add or remove them. The
current flight schema has no independent tuning fields; its window says so rather
than displaying all vehicle tuning as flight parameters. Validation remains owned
by the engine. Changes to the document while a draft is open reject stale applies.
Visual equipment stays independent of physical tuning.

Layers restores its global Show/Hide actions, and Add includes the existing 2.5D
gallery. Specialized controls still use the documented host boundary; this pass
is not a wholesale replacement of those controls or the monitor editor.

Object-mode selection uses a yellow screen-space perimeter of the selected mesh
union. It contains no bounding box, triangle edges or face fill. The mask uses
render-only proxies sharing geometry and leaves source materials and transforms
untouched; batched building surfaces remain batched in the normal scene. The
perimeter is composited after depth of field and is an editor overlay (visible
through foreground objects). Edit mode retains its geometry guides. Cursor mode,
play, mirror/portal views and exported photos do not include the object outline.

Map inspection ignores decorative projection meshes when finding the nearest
surface, so a satellite roof overlay cannot intercept selection of its building.
The map exposes a detached surface restricted to the selected building's triangle
range; Studio outlines it with the same silhouette pass as authored objects.
It is not added to the world scene or rendered into photos, mirrors or portals.
The source matrix is refreshed after origin rebasing and hidden/unloaded tiles
stop exposing a selection surface.

Utility dialogs use the Desktop fixed-position window layout from their first
open frame, including non-modal preferences. Their near-black titlebars and SVG
icons are scoped to the dialog; global application header styles must not leak
into them. Dragging switches the centered insets to explicit top/left coordinates.

## Next steps

The prioritized UI roadmap and diagram are in [studio-ui-next.md](studio-ui-next.md).
