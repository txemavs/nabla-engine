# Studio Desktop foundation

Status: first integration slice for [issue #35](https://github.com/txemavs/nabla-engine/issues/35).
Open `/?studio=desktop` to use the experimental workspace, or
`/?scene=circuit&studio=desktop` for the local circuit without world downloads.
The existing editor remains the default during migration.

## What works

The actual world viewport, scene tree and properties inspector are hosted by
Nabla Desktop's `WorkspaceHost` and `ExternalContent`. They retain their DOM,
WebGL canvas, scene and event handlers when floated, docked, resized or hidden.
There is one existing renderer and one simulation; docking does not rebuild them.
The existing viewport ResizeObserver continues to own renderer dimensions.

The shared command registry provides Edit (undo/redo), Run and Windows menus.
These commands call application functions directly and use current undo/play state.
File, travel, cursor and help retain their existing menus. Options now opens a Desktop window with retained settings controls and tabs (see [projects and places](studio-projects.md)).
Windows can reopen panels and reset the layout. Layout persists separately from
the scene under `nabla.studio.layout.v1`; invalid or unavailable storage falls back
to the default layout without discarding scene data.

`StudioInputOwner` releases held keys and pointer lock when the viewport loses
ownership. Desktop menus and layout interactions suspend gameplay input, including
gamepad actions. The existing form input exclusions still apply. `FrameLoop`
owns the single animation request chain and stops on pagehide, restarting on
pageshow without accumulating time while the page was suspended.

Vue and Desktop are dynamically imported only when the experimental shell is
requested. They are development dependencies of this repository, not dependencies
of the published `@nabla/engine` runtime. The pinned package provenance is in
[the vendor manifest](../vendor/README.md).

## Boundaries and next steps

This is an in-page host adapter, not yet an independently mountable Studio SDK.
The old application still owns scene loading, globals and GPU resources. A complete
application dispose contract must precede embedding multiple Studio/game sessions.
Closing a viewport panel retains the runtime; it does not stop simulation or unload
GPU resources. Use Stop to finish a play session.

1. Extract a framework-independent Studio controller owning selection, commands,
   document transactions and runtime teardown; migrate the remaining menus to it.
2. Add explicit viewport input profiles and Object/Edit modes. Blender-style cursor,
   G/R/S previews, confirm/cancel, constraints and persistent channel locks must share
   one transaction model. Existing shortcuts are preserved in this first slice.
3. Introduce editable wall components and topology tools with documented constraints.
4. Host independent game sessions from authored scene snapshots in Desktop windows.
   A play session must not mutate the authored document or undo stack.

For future simulation interoperability, retain the existing explicit metre/second,
right-handed Y-up, -Z-forward engine convention. A Blender-facing basis or an
Isaac/USD/ROS adapter must convert at its boundary, rather than silently changing
stored scene coordinates. Desktop must not own the simulation clock, physics state,
actuators or sensors. This slice adds no Isaac integration or new physical model.

## Verification

`npm run check` includes the input ownership and frame scheduling unit tests.
`npm run test:e2e -- tests/desktop-studio.spec.ts tests/studio.spec.ts` exercises
real editing, undo/redo, play/stop, retained canvas identity, layout recovery and
the existing editor. Set `NABLA_TEST_PORT=5187` to test in isolation while another
local demo occupies the default port.

The headless browser checks validate behavior and DOM/canvas identity, not visual
rendering parity. In this environment both the legacy and Desktop screenshots
showed a black world with the transform gizmo visible, without JavaScript errors.
Interactive GPU validation is still required; this work does not claim to diagnose
or fix that rendering issue.

## Compact docking controls

Dock tabs use square edges. Split-direction buttons and the move-group select are
hidden; dragging tabs remains the primary docking action. Float/dock and close
controls appear on group hover or keyboard focus, retaining keyboard access.
The extra move/resize handles remain available on floating panels.

## Blender-style initial workspace

Desktop layout version 2 places the viewport on the left (76% initial width), with
the scene tree above Properties on the right. The viewport owns its mode header
and a vertical Move/Rotate/Frame toolbar on its right edge, so these controls travel
with a floating viewport. Locations group the active scene's object tree; other
saved locations can be opened from the same column. Version-1 layout preferences
are left intact but no longer override the new default. Reset Layout restores it.

Object/Edit mode delegates to the existing solid editor. Edit is unavailable for
non-editable objects, including imported vehicle GLBs. There is no timeline yet.
GLB vertex editing/export requires an editable mesh document, preservation of UVs,
material assignments and hierarchy, normal/bounds and collider updates, undoable
mesh operations and a GLB exporter. It is not implemented by this layout change.
