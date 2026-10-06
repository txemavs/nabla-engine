# Portals: current implementation

One simulation owns physical traversal. One renderer draws portal views. Studio
owns the controls and saved-project address book. There is no second legacy
portal simulation to activate.

## Source map

- `src/entity/portal/portal.ts`: mouths, reciprocal links, validation and rigid transforms.
- `src/simulation/simulation.ts`: swept crossing, clearance, host-relative velocity,
  boarding, ramp coordination and the exit lock.
- `src/render/portal/portals.ts`: remote projection and clipping.
- `src/render/portal/environment.ts`: temporary destination sky/environment.
- `studio/portal-controls.ts`: rear tablets and carrier controls.
- `studio/portal-registry.ts`: project-wide addresses and remote windows.

`createCarrierPortal(hostId, sternId)` creates the single stock stern mouth.
Use it explicitly when composing a carrier scene. The palette, sample and planet
factories already include the stern mouth. Carriers placed while playing get it too: pass
`presetEntities('carrier', id)` (vehicle first, then the hosted mouth) to
`GameRuntime.placeVehicle` / `spawnVehicle`, as the host fleet (`?vehicles=`) and the
add-vehicle menu do. A bare `presetVehicle('carrier')` has no mouth, so its portal monitor
(left door screen) stays dark and offers no portal controls. The plural factory and saved-scene
migration have been removed: loading never rewrites authored portals or glass.

## Carrier and saved scenes

The stock carrier has armoured bow glass. Its scene assembly adds one stern portal;
custom side mouths and links remain ordinary authored entities.

The garage door must finish closing before its portal opens. During a connection,
the closed visual door uses a horizontal collision apron. Its collider transform
is updated in Rapier alongside the animation. Opening the garage door first
closes the portal. Hosted frame colliders belong to the existing carrier body.

## Placing portals while playing

The game add menu («Añadir…», group **Objetos**) offers engine placeables from
`src/catalog/placeables.ts`: **Portal** (one closed Stargate mouth), **Galería 2.5D** (the
gallery example: a window-linked pair with its 2.5D sprite figures), **Sprite**, **Farola de
autopista** and **Farola de barrio**. `GameRuntime.spawnEntities(entities, ahead)` stands the
batch on the ground in front of the player or the driven vehicle, facing them, with fresh ids;
`placeEntities` takes an explicit pose, `placedObjects` lists the batches and `removePlaced`
takes one away. Simulation and view install them with `addPlaced` / `removePlaced`
(`assertPlaceable`: no parents, vehicles, terrain or dynamic bodies; links only inside the
batch). Removing a linked portal closes the partner that stays.

A placed portal starts closed and unlinked. Its panel lists every portal in the scene —
other placed portals, host portals and carrier sterns — and links/opens them through
`configurePortal`, exactly as authored mouths do. Hosts list fixed portals with `?portals=`
(see [Game library → Host portals](game-library.md#host-portals)).

The carrier PORTAL panel's Lat/Lon **Ir** form now calls `Simulation.relocateVehicle`: the ship
(and anyone in its cabin) moves to that point, keeping its current altitude (at least 15 m
orthometric) with velocity cleared, and settles from there.

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
