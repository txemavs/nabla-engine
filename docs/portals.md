# Portals: current implementation

One simulation owns physical traversal. One renderer draws portal views. Studio
owns the controls and saved-project address book. There is no second legacy
portal simulation to activate.

## Source map

- `src/entity/portal/portal.ts`: mouths, reciprocal links, validation and rigid transforms.
- `src/scene/migrations/carrier-portals.ts`: migration of saved reference carriers.
- `src/simulation/simulation.ts`: swept crossing, clearance, host-relative velocity,
  boarding, ramp coordination and the exit lock.
- `src/render/portal/portals.ts`: remote projection and clipping.
- `src/render/portal/environment.ts`: temporary destination sky/environment.
- `studio/portal-controls.ts`: rear tablets and carrier controls.
- `studio/portal-registry.ts`: project-wide addresses and remote windows.

`createCarrierPortal(hostId, sternId)` creates the single stock stern mouth.
The old plural factory and `src/render/portal/carrier.ts` remain compatibility
re-exports/wrappers only. New code uses the singular factory and scene migration.

## Carrier and saved scenes

The stock carrier has a stern portal and armoured bow glass. Loading an old
reference carrier removes its old bow mouths and their children, disconnects
partners, and installs missing bow glass and a stern mouth once. Existing stern
IDs, placements and links are preserved. Authored side mouths are preserved.
Migration operates on a parsed copy and is idempotent; saved data changes only
through the normal host save/export action.

The garage door must finish closing before its portal opens. During a connection,
the closed visual door uses a horizontal collision apron. Its collider transform
is updated in Rapier alongside the animation. Opening the garage door first
closes the portal. Hosted frame colliders belong to the existing carrier body.

## Playing

Studio uses the hovering monitor. Its small body follows a support cushion about
1.25 m above the ground and clears kerbs and ramps without foot collisions. It
still collides with walls and the bow window. Unsupported falls settle onto the
next supporting surface; this is not unrestricted noclip flight. The optional
walking controller remains available to other Engine clients.

E boards the nearby vehicle. Within a carrier garage, a nearby car is preferred
over the enclosing hull; hull reach remains 2.75 m for ordinary boarding. A monitor
can leave the stopped helm, traverse the stern, return from the ground, and stay
in the same carrier interior. A car must be unlatched before traversing.

## Traversal contract

Local +Z is the front of a mouth. Crossing goes from +Z to −Z and maps through
`destination * rotateY(pi) * inverse(source)`, preserving metres and handedness.
Mouths must have matching apertures and reciprocal links. Open mouths traverse;
windows show the destination but block passage; closed road mouths block passage.
Closed carrier mouths restore the ordinary garage opening/door behavior.

The full body must fit. The exit corridor must be clear, including suspended map
box colliders. Crossings preserve the actor and driver, transform velocity relative
to moving hosts, clear old contacts, and lock the exit until the body clears it.
Relinking and closure are atomic and rejected when an actor occupies the opening.

Rapier uses a nearby floating origin while scene coordinates stay planetary.
Rebasing translates physics positions and queries, not authored objects. Enabling
flight or docking only detaches the wheel controller: it preserves the body and
its joints. Sleeping vehicle controllers do not inject artificial suspension
velocity; throttle explicitly wakes them. Physics worlds are freed on disposal.

## Validation and limits

Unit journeys cover the monitor, A3, moving cargo, blocked exits, rotated gates,
ramps, docking, and orbit-to-ground-to-the-same-carrier return. Browser journeys
cover portal controls, registry windows, remote rendering and the driving route.
See [validation](architecture/cleanup-validation.md) for the latest run.

Transfer occurs at the actor centre. There are no split vehicle meshes or general
contacts across a seam. A connected assembly cannot traverse. The project registry
can show remote scenes as windows; physical traversal is between mouths in the
loaded simulation. Rendering a distant view does not guarantee destination map
streaming. CSS interiors and arbitrary-speed moving mouths are not fully supported.

The [historical proposal](archive/portals-proposal-20260928.md) is reference material,
not a description of extra live portal systems.
