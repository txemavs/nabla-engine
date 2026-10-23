# Two-hand bow

`@nabla/engine/weapons/bow` exports the device-independent `BowDraw` and its settings.
Draw distance determines launch speed from spring energy and arrow mass. Draws below
6 cm, invalid distances, cancellation and tracking loss produce no shot.
`@nabla/engine/xr/bow` exports the optional `XRBow` presentation/input adapter.

The AR monitor has **Añadir arco**. It loads the default bow (Arco) and one of
its included arrows. Grab near the handle with either controller's grip. Keep
holding it; bring the other hand to the middle of the string, hold that grip,
pull backwards and release the string grip to shoot. Release the handle to drop
the bow into the shared physics world. The newly spawned bow waits in front of
the player until first picked up. Ammunition is unlimited; at most 16 arrows
remain, with a 45 second lifetime. Environment → Free memory removes the bow and
all arrows. The monitor's disposal portal also accepts them.

The host supplies an already initialized Engine `World`, calls `interact()` with
available hands before physics and `sync()` after physics, and calls `cancel()`
when the session is hidden. This uses the existing `XRObjectGrab` for carrying and
throwing the bow. Released arrows are Rapier rigid bodies with CCD, gravity and
room contact manifolds in the same world as balls, guns and room surfaces. They
stop at static surfaces; dynamic objects receive the ordinary physics collision.
There is no second room solver or projectile raycaster. Optional `onHit` receives
the actual solver contact point; the demo connects it to the existing target.
Gun mechanisms and their marks/sparks remain unchanged.

The default bow is `arcoBow` (`defaultBow`): an original model,
`assets/library/weapons/arco/`, no third-party licence. Its binding and `bowModels`
by id live in `src/runtime/bow-model.ts` and are exported from
`@nabla/engine/xr/bow`. The binding is code, not JSON, so it stays outside `assets/library/weapons/**/*.json`, the
strictly validated firearm preset catalog. `buildBowModel(asset, descriptor)`
does the cut and transform for every bow: AR's `XRBow` and the held bow on foot
(a held preset with `"bowModel": "arco"`) show the same meshes. On foot,
hold the left button to draw (`timedDraw` feeds the same `BowDraw` rules) and
release to loose; `ArrowFlight` flies the arrow with gravity through
`Simulation.shoot` (worker and main thread) and hits go through the gallery
(marks, targets, glass, momentum push).

`loadModel(url, descriptor)` uses Engine's asset library. The descriptor names the
bow/arrow nodes, authoring-to-metre transforms and static-string triangles to
replace with a dynamic string. It works on cloned geometry and keeps the original
GLB intact. The default Arco is original and needs no credit
(`assets/library/weapons/arco/README.md`). Importing the engine adapter
loads no model; another host can provide another descriptor.

The implementation is reusable in web/VR/AR with the same shared World and draw
rules; only the AR demo currently mounts it. Tests cover energy/limits, intentional
release, cancellation, shared wall collision, throwing and disposal. Controller
alignment and ergonomics still need a Quest test. Picking fired arrows back up,
limb deformation, bow audio and hand-tracking input are not implemented yet.
