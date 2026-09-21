# Proposal: Stargates and CSS interiors

Status: the fixed, upright WebGL gate prototype is implemented. The hosted-carrier
and CSS-interior portions below remain the design target. See the current slice
and limits before interpreting the later sections as available behavior.

## Current playable slice

Use **+ Stargates** in the playground to add a linked pair to the current scene.
This is an undoable edit and does not replace saved work. The default entry is in
front of the A3; the exit is farther along the other lane. Select a frame to move
or rotate it around world Y, choose a destination, or choose **Cerrado**,
**Ventana**, or **Paso abierto**. Both ends change atomically. Editing connections
requires stopping play. Save/export uses the existing scene workflow.

The original Agency GLB is rendered at the installed frame dimensions. Aperture
size is explicit in metres. A single remote render level shows the linked view
with camera-relative perspective and destination-plane clipping. Views share the
same scene and asset caches. Render targets are bounded to 1024 pixels on their
long edge and disposed with the scene view.

Walking, the original A3 and dynamic boxes use the same simulation-owned rigid
transfer. Position, orientation and velocities transform together. A driver stays
in the same vehicle. The simulator checks the complete vehicle envelope for
aperture clearance and checks an empty exit corridor at transfer time; window/closed gates block
movement. Back-face entry and constrained cargo transfers are refused. Duplicating
one mouth creates a closed, unlinked copy; deleting or relinking it cleans up its
previous partner. A yaw-rotated pair and return trip have physics tests.

**Prototype limits:** mouths must be fixed, upright root groups. They cannot yet
be mounted on the carrier or tilted. The body transfers at its centre; clipped
vehicle halves and general physical contacts across the seam are not implemented.
The chase camera follows that transfer rather than having an independent crossing.
Destination clearance is checked against box colliders; remote terrain streaming,
altitude-to-ground transfer and arbitrary separate worlds are not supported by
this slice. Views currently share the nearby geographic detail loaded for the
main camera. No CSS interior is included yet. These limitations are explicit
rather than treating the full acceptance scene below as complete.

## Intended experience

The original black frame is a Stargate. The carrier has two independently linked
mouths, at bow and stern, following Agency's current arrangement. Placement is
editable data, so side-wall mouths can be authored too. An office inside the
carrier can use live CSS 3D surfaces and HTML tools. Looking through an open gate
shows the destination with correct head-relative perspective. Walking or driving
through it transfers the same actor, without taking the ramp or changing seats.

Example: the carrier is above Earth; its rear gate links to a gate on the Madrid
road. The driver releases the A3 from its garage latch, drives through the rear
mouth and emerges on the road. The carrier stays aloft. The front gate can remain
a window to a different destination. A portal is a spatial connection; CSS versus
WebGL is a presentation choice for the space on either side.

## What Agency already contains

Reviewed local Agency UI revision
`89b090785f77efdd825c8fab69055a2f9106888c`. Paths below refer to that repository.

| Source                                                           | Existing behavior                                                                  | Reuse decision                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `src/assets/stage/marco-garaje.glb`, `src/stage/kind/phiGrid.ts` | Original frame; declared installed outer size 5 × 3.20 m and opening 4.71 × 2.91 m | Reuse original asset with explicit import transform; verify mesh bounds before mounting |
| `src/stage/portal/portalGraph.ts`                                | Bow/stern and yard pairs, hosted openings, crossings and arrival helpers           | Reuse concepts; replace special IDs and yaw-only geometry                               |
| `src/stage/portal/portalProj.ts`                                 | Off-axis projection through a window using the CSS optical eye                     | Reuse projection principle with Nabla's metre/quaternion conventions                    |
| `src/stage/portal/AgencyStagePortal.vue`                         | Live WebGL canvas placed in a CSS office opening                                   | Reference for the hybrid view, without importing Vue/stores into the engine             |
| `src/stage/kind/interior.ts`                                     | Hosted interior with CSS-office or GL-hull presentation                            | Make the room identity independent of its presentation                                  |
| `src/stage/kind/roomSkin.ts`, `src/assets/stage/room-skin.jpg`   | Six faces cut from one image atlas, including face rotations                       | Support both an atlas and six independent textures                                      |
| `src/stage/live/mount.ts`, `src/stage/live/walk.ts`              | Drive/walk portal transitions                                                      | Replace arrival placement/remounting with a simulation-owned transfer                   |

The old crossing helper checks an XZ segment and opening width; it does not
establish full-body clearance through a tilted rectangle. Existing drive code
remounts at an arrival pose, retaining the old height in that path. These are not
yet the general six-degree-of-freedom vehicle traversal required here.

Agency uses CSS millimetres, a Y-down convention, and an optical-eye offset tied
to CSS perspective. Nabla must adapt those explicitly at the renderer boundary,
not inherit ambiguous units, generated destination IDs or camera offsets.

The source frame's declared native bounds are 3.436068 × 2.2 m, with a
3.236 × 2.0 m opening. Agency scales it to the 5 m installation. These source
constants are references, not a substitute for measuring the asset and the
current carrier. The current Nabla carrier has a centre partition, front console
and moving rear ramp: matching the outer frame alone does not prove a car route.

## Data and ownership

Keep one `Simulation` and one Cannon world for the first implementation. Every
physical actor has exactly one authoritative body. CSS elements, remote views and
clipped visual copies never create a second controller or body.

Proposed authored records, named here as design concepts rather than exported API:

| Record           | Essential fields                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Interior         | Stable ID, host entity ID, rigid local transform, inner dimensions, face textures/UVs, openings, preferred presentation          |
| Portal mouth     | Stable ID, optional host/interior ID, rigid local transform, explicit rectangular aperture, frame visual and collider references |
| Portal link      | Two existing mouth IDs, bidirectional connection, authored initial mode                                                          |
| Interior surface | Face and rectangle in metres, texture or host widget key, explicit opening rectangles                                            |

Use metre/Y-up coordinates and quaternions everywhere in authored data. A mouth
origin is the aperture centre: local X is right, Y is up, +Z faces the approach
side. Crossing enters from +Z toward −Z. Dimensions do not scale travellers.
Initially require equal aperture sizes at both ends. Reject dangling links,
multiple active partners, self-links, invalid bounds and host cycles.

An ordinary window through the carrier hull shows the adjacent exterior without
a portal transform. A remote window uses a portal link. Both use the same aperture
and camera contracts, but only the latter changes spatial adjacency.

Treat the container interior as a region attached to its existing physical hull,
not a second overlapping room. Its floor/walls reuse hull collision parts. Opening
metadata must agree with visible and physical holes: split wall geometry around
an aperture; never disable the entire host collider to permit transit. The rear
ramp needs an explicit portal-clear state with matching visuals and collision.
This is a prerequisite for the ramp-independent demonstration.

Add optional records to scene v1 only if old documents still validate with exactly
their current meaning. If physical ownership or persistence semantics must change,
introduce a versioned migration instead. Play-only gate state stays in snapshots;
editing links and interiors uses validated transactions and undo/redo.

## Connection lifecycle

Expose `Closed`, `Window`, and `Open` to the player. Runtime preparation can report
`Loading`, `Blocked` or `Error` with a reason.

- Closed: opaque gate surface, with a blocking aperture collider.
- Window: live view of the destination, still physically blocked.
- Open: live view and traversal after destination physics/resources are ready.

Changing partners is atomic for both mouths. Do not open into an unloaded scene
or close/relink through an actor already straddling the plane. Reserve the crossing
until that actor clears it; on loading failure keep the physical barrier. Missing
map imagery alone need not block a gate when local destination collision is ready.

Names such as “Madrid road” or “Carrier garage” are labels. Neither names nor IDs
select behavior. The host can present destination selection as a Stargate address
book without the engine knowing about Agency accounts or routes.

## One transform for looking and crossing

For source and destination world transforms A and B, define:

```text
T = B · rotationY(π) · inverse(A)
remoteEye = T · eye
remoteOrientation = rotation(T) · eyeOrientation
```

The half-turn joins the front-facing mouths without making a mirror. Use this
same rigid mapping for positions, orientations, render cameras and traveller
vectors. Hosted mouth transforms come from current simulation snapshots, including
carrier pitch and roll. Projection uses the actual optical eye, not a seat pivot.
“Head position” initially means the game camera; webcam or XR tracking is a later
input provider feeding the same eye-pose contract.

For CSS windows, derive an off-axis frustum from the transformed eye and aperture
corners, as Agency already does. For WebGL views, use a transformed camera with
portal-plane clipping and an aperture mask. Do not apply two perspective mappings
to a texture already projected for a CSS quad. Handle near-plane approach without
blanking the view before the camera crosses.

Use one render coordinator and shared asset caches. Render only visible mouths,
initially with one remote recursion level and a bounded pixel budget. A deeper
portal displays a defined inactive surface. Reuse the destination's geographic
render origin, sky and local detail for each pass; the primary camera's origin and
map tile neighbourhood are not sufficient for a remote Madrid view from altitude.
Restore renderer state after each portal pass and release unused targets.

## CSS 3D and WebGL composition

Define the six surfaces once, including UV rectangles/rotations and real openings.
Two adapters consume that definition:

- Inside: CSS faces and interactive DOM widgets, with metres converted to CSS
  coordinates at one explicit boundary. Camera projection and viewport resizing
  come from a shared camera state.
- Viewed remotely: a WebGL representation of those same textured faces and widget
  panels. The car remains a WebGL object in either presentation.

Live HTML is not automatically a WebGL texture. Three.js documents CSS3DRenderer
as a DOM renderer with material/geometry limitations and a 100% zoom constraint
([official documentation](https://threejs.org/docs/pages/CSS3DRenderer.html)).
A [WebGL render target](https://threejs.org/docs/pages/RenderTarget.html) captures
a rendered GPU scene; it is not an arbitrary DOM capture facility. Therefore remote
views initially show matching room textures and explicit widget previews; live DOM
interaction becomes available locally. Widget hosts may later provide their own
canvas/texture preview. Do not promise arbitrary interactive HTML through recursive
portals.

CSS and WebGL need deliberate occlusion composition. Prototype this before
building the full office: CSS faces with actual holes, masked WebGL windows, and
a synchronized WebGL depth representation of walls for vehicles. Verify front/back
ordering, a car partly inside the room, and a frame crossing a DOM panel. Avoid
flattening the CSS transform hierarchy accidentally with clipping on the wrong
ancestor. If the browser cannot compose a particular overlapping surface reliably,
use its matching WebGL visual during locomotion, keeping CSS active for seated
work. That fallback must not change room geometry, camera pose or physics.

## Vehicle traversal and moving mouths

Detect swept crossing against the moving portal plane at fixed physics ticks.
Test aperture clearance for the whole oriented vehicle envelope, including wheels,
and the destination swept volume. Account for motion/rotation of both mouths;
subdivide fast relative motion or impose an explicit supported speed bound.
A point-camera test or a cooldown alone is insufficient.

Transfer chassis, driver association, angular/linear velocity and controller state
atomically. Refresh wheel rays, contact caches and interpolation history at the
new pose. Keep the camera continuous; it can cross at a different instant from
the chassis centre. Prevent immediate return until the traveller clears the pair.

For moving portals, the default policy preserves velocity relative to the mouth:

```text
vA(point) = hostLinearA + hostAngularA × (point − hostCentreA)
vB(mappedPoint) = hostLinearB + hostAngularB × (mappedPoint − hostCentreB)
vAfter = vB(mappedPoint) + R · (vBefore − vA(point))
ωAfter = hostAngularB + R · (ωBefore − hostAngularA)
```

Here R is the rotational part of T. Fixed mouths have zero host velocity. This is
an intentional gameplay rule: an A3 moving at garage speed emerges at road-relative
speed rather than carrying the ship's motion. It is not a claim of global energy
conservation. Destination gravity applies after transfer; rotate the view/control
basis consistently rather than snapping world Y and losing momentum.

A latched car must first be released. The initial feature refuses partial transfer
of constrained assemblies. Moving the carrier plus cargo through a larger gate
requires a later atomic assembly-transfer feature and clearance for the entire
assembly.

For convincing Portal-style partial crossing, draw clipped representations on
both sides while maintaining a single authoritative actor. Rendering copies alone
do not solve destination collision before the body's centre crosses. The initial
prototype may reserve a clear transit volume and block occupied exits; it must be
labelled as such. General contact with objects across the seam needs a dedicated
collision/contact mapping design before it can be claimed as supported.

## Geographic scale and future separate worlds

The first gates connect places in the same simulation, including a hosted interior
and a ground destination. The global Earth is a rendering/geographic reference,
not millions of metres of detailed collision geometry.

Before validating the orbit-to-road scenario, exercise precision and broadphase
behavior at altitude with both destinations active. If that requires bounded
physics cells, design them under one simulation coordinator with transactional
actor migration and shared time. Do not silently add a Cannon world per renderer.
An unrelated authored world or pocket dimension would use an explicit space ID
and loading/transfer contract; a CSS room does not itself require a separate space.

## Implementation sequence and acceptance gates

1. **Portal contract and physical frame.** Import the original GLB with provenance,
   measure it, mount two hosted mouths, add link validation and editor controls.
   Confirm the existing carrier route and ramp-clear state. Test all rigid
   transforms and save/undo/reload without changing the baseline scene by default.
2. **Two static WebGL gates.** Correct remote perspective, clip plane and occlusion;
   then walk and drive through at low speed. Test reversed travel, a too-small
   aperture, blocked exit, closure during transit and repeated crossing. Keep the
   existing physics and browser journeys passing.
3. **One hybrid room.** Six textures or an atlas, one live CSS tool and one remote
   window. Verify eye translation/rotation, viewport changes, supported zoom,
   car/DOM occlusion and a seamless CSS/WebGL presentation change. Resolve this
   compositor risk before expanding the UI.
4. **Moving carrier to Madrid.** Full pitch/roll, relative velocity transfer,
   different up directions, loaded destination, rear-gate ramp bypass and return.
   Demonstrate the released A3 leaving the carrier while the carrier stays aloft.
5. **Beyond the first release.** General seam contacts, constrained assemblies,
   nested portals, independent spaces and optional tracked-head input, each with
   an explicit contract and tests.

The end-to-end acceptance scene is a carrier at altitude, an office using CSS,
a live ground view, and an A3 driven through the garage gate to the road and back.
No reset of the car, duplicate simulation, hidden ramp traversal or forced seating
is acceptable as completion of that scene.
