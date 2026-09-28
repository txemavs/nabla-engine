# Vehicle interaction

Studio uses the hovering monitor while playing (a 1.25 m ground cushion and a small collider). Editing is deliberately static: use
**Jugar / F8**, approach a vehicle, then **E** to enter or leave it. Pressing E
in edit mode explains that sequence. Model streaming mode pauses physics and
shows that fact in the interaction HUD. The walking option remains available to other Engine hosts; Studio explicitly selects hover.

`Simulation.nearestVehicle` measures a 2.75 m reach from the vehicle's oriented
size bounds, rather than from its centre or the distant carrier helm. The
closest reachable vehicle is selected, with a hull penalty for carriers so an
enclosing garage does not steal interaction from its parked car. A physical ray to the hull rejects other
solid obstructions. Stops are required (under 1.5 m/s); a passenger already
inside a carrier can take the helm if relative speed is below 2 m/s. This is
instant interaction, not a door-opening/boarding animation. Each asset's authored
bounds must match its model. The Rapier ray adapter identifies colliders by their
handles rather than relying on JS wrapper identity.

E on a stopped boat dismounts onto one of two tested deck positions above the
hull collider. Occupied positions are rejected. The character inherits deck
velocity and can press E again to retake the helm. This avoids requiring solid
terrain outside the hull, where there is only water. Other vehicles retain their
existing supported exits and the carrier retains its interior exit. Boat visual
cabin geometry is not automatically converted into collision geometry.

The HUD uses the same candidate query as the action. Keyboard E, controller
interaction and the touch Enter/Exit button call the same simulation method.
`data-vehicle` on the viewport canvas exposes the currently controlled entity
for browser regression checks.

Tests cover ordinary perimeter boarding for car/boat/carrier, falling onto the
boat, dismount/re-entry, wall and distance rejection. A Chromium journey starts
play from an elevated spawn and completes E enter/exit/re-entry. Existing boat
buoyancy/steering tests also run. The earlier physics/portal failures have been resolved; see `cleanup-validation.md`
for current verification.

Backup before these edits:
`/home/txema/backups/nabla-boarding-20260928/source.tgz`.
