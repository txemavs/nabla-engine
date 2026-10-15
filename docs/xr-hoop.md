# Movable hoop and shared room props

AR's monitor has **Canasta**. It brings one basket within reach. Hold grip near
the lower black base to reposition it with one or two hands. Touch the black
button with a free index finger, or press trigger near it, to pin/unpin it. Until
pinned it follows the same stable torso anchor as driving controls. Pinned objects
stay in the room; re-grabbing still allows moving them. **Entorno → Reiniciar
encestes** resets the counter; **Liberar memoria** removes the hoop as well as the
other objects. The disposal portal also accepts the hoop.

`XRStationPlacement`, exported at `@nabla/engine/xr/placement`, is the actual shared
placement mechanism used by both `ARRCControls` and `XRHoop`, not a copy. It uses
`XRObjectGrab`, `XRBodyAnchor`, the same button interaction, click and haptics.
The existing AR station tests cover the extracted behavior.

`@nabla/engine/xr/hoop` adds board, hollow rim, visual net and scoreboard.
Collision surfaces go through `ARRoomPhysics` like any other room mesh. There is
no disk filling the hoop and no net collider trapping balls. The scoreboard is
updated only when the counter or pinned state changes.

`@nabla/engine/sports/hoop` exposes device-independent `HoopScoring`. It consumes
ball positions in rim coordinates, radii and held state. A score requires a free
ball to approach from above, cross down through the opening with radius clearance,
and then fully leave below. Segment interpolation catches fast crossings. Holding
balls, moving/unpinned baskets, below-to-above passes and partial rim bounces do
not score. Track removal and repositioning clear passage history, not the count.

The host composes it with existing physics:

```ts
const hoop = new XRHoop(scene)
roomPhysics.afterPhysicsStep = () => hoop.sampleBalls(roomPhysics.ballSamples)
// Before stepping the shared room world:
hoop.update(availableHands, dt)
roomPhysics.update(dt, [...roomSurfaces, ...hoop.collisionSurfaces])
```

`beforePhysicsStep` / `afterPhysicsStep` run once per actual 90 Hz room substep.
Ball samples expose copies of state, not mutable bodies. The same ball objects
remain grabbable, throwable and responsive to gunshots.

## Vehicles pushing room props

AR's R/C adapter now accepts `roomWorld: () => World | null`. `Simulation` exposes
read-only `entityCollisionParts()` from its authored chassis/equipment colliders,
plus spherical tyre envelopes from its raycast wheel radii and live wheel poses.
No decorative model bounding boxes are used for chassis collision geometry.

`XRScaledBodyContacts` mirrors those shapes into the shared room world in metres.
Kinematic poses interpolate at room physics substeps, so moving chassis and wheels
push any dynamic room body: balls, loose magazines, cartridges, guns and arrows.
The same Rapier contact solver handles them; there are no separate per-object
shove rules. Clearing/replacing a vehicle removes its mirrored bodies. Placement
teleports do not become artificial high-speed impacts.

The ordinary full-size vehicle simulation still owns drive forces, suspension,
road contacts and towing. The boundary currently transfers vehicle movement into
room-prop contacts, not prop impulses back into the full-size vehicle simulation.
Tyres use spherical envelopes, not detailed tread meshes. These are explicit
limitations of this initial scaled-contact support.

Tests cover scoring direction, held balls, rim clearance, partial bounces,
repeated/fast passages, actual shared-world ball passage through the torus,
station pinning, existing driving controls, prop pushing, shape scaling and cleanup.
Real Quest placement, throwing and vehicle/prop contact feel require headset tests.
