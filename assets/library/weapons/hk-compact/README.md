# Reviewed HK Compact presentation asset

`hk-compact.glb` is the user's reviewed revision 11, imported from
`HK_USP_Compact_revision_11.glb`. Units are metres, Y up, -Z forward.
It includes the cleaned frame and curved guard/grip junction, hollow barrel,
frame guide details and separate slide, controls and magazine.

This is an authored visual game asset. The legacy `author-hk-compact.mjs`
generator and retained source meshes describe the earlier version; running it
will overwrite these manual revisions. Export a newly reviewed asset to update it.

`assets/rigs/weapons/hk-compact.rig.json` binds the moving parts. `Sidearm`
animates them relative to their rest poses. `hk-presentation.ts` supplies the
reviewed cosmetic barrel pose and a cartridge marker seated in the magazine.
Only explicit inspection moves the whole presentation; manipulating the slide
does not rotate the frame. No manufacturing or functional geometry is implied.

The magazine marker follows its `MagazineEntity.rounds`, including insertion and
dropped items. Entities have an ID, capacity and remaining rounds. A normal
simulation reload consumes an existing spare. Gameplay uses unlimited supplies:
R drops the current item or, with an empty well, supplies a full normal magazine and selects semi-auto. The empty well holds the Z viewing pose without activating its safety gesture;
M replaces it with a visibly extended 30-round magazine and selects automatic.
F operates the slide or releases its catch separately. G toggles the laser and H the flashlight.
Removed items never refill. Workshop reinsertion retains the same item.
The chamber is independent. Dropped entities remain associated with their
physics poses until the existing dropped-body lifetime expires. Ground pickup
of magazines is not implemented in this change.

Run the browser review at `/hk-review.html` using `vite.browser.config.ts`.
Regression tests cover the real GLB, poses, ammunition transfer and dropped
magazine rendering, plus the existing casing and spatial-audio behavior.
