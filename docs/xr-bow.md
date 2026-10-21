# Two-hand bow

`@nabla/engine/weapons/bow` exports the device-independent `BowDraw` and its settings.
Draw distance determines launch speed from spring energy and arrow mass. Draws below
6 cm, invalid distances, cancellation and tracking loss produce no shot.
`@nabla/engine/xr/bow` exports the optional `XRBow` presentation/input adapter.

The AR monitor has **Añadir arco**. It loads the supplied recurve bow and one of
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

The demo binding (`recurveBow`, with `bowModels` by id) lives in
`src/runtime/bow-model.ts` and is exported from `@nabla/engine/xr/bow`. It is
code, not JSON, so it stays outside `assets/library/weapons/**/*.json`, the
strictly validated firearm preset catalog. `buildBowModel(asset, descriptor)`
does the cut and transform for every bow: AR's `XRBow` and the held bow on foot
(a held preset with `"bowModel": "recurve-bow"`) show the same meshes. The held
bow is visual only for now; drawing and loosing arrows needs the main-thread
Rapier World that only XR mounts.

`loadModel(url, descriptor)` uses Engine's asset library. The descriptor names the
bow/arrow nodes, authoring-to-metre transforms and static-string triangles to
replace with a dynamic string. It works on cloned geometry and keeps the original
GLB intact. Resource provenance and **CC-BY-NC-4.0** noncommercial licensing are
recorded in `assets/library/weapons/recurve-bow/README.md`. The licensed resource
is demo content, not an unrestricted engine asset. Importing the engine adapter
does not load it; another host can provide another model descriptor.

The implementation is reusable in web/VR/AR with the same shared World and draw
rules; only the AR demo currently mounts it. Tests cover energy/limits, intentional
release, cancellation, shared wall collision, throwing and disposal. Controller
alignment and ergonomics still need a Quest test. Picking fired arrows back up,
limb deformation, bow audio and hand-tracking input are not implemented yet.
