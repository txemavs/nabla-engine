# Consuming Nabla from Agency

Integration has not been implemented. This guide defines the host boundary for
consuming 0.2 without reintroducing Agency-specific UI conventions into the engine.
There is no automatic compatibility with the earlier 0.1 API.

## Host responsibilities

- Own routes, accounts, permissions and remote persistence.
- Explicitly migrate old documents to validated `SceneDocument` v1.
- Create `SceneEditor` for editable views and `Simulation` for a play session.
- Translate keyboard, gamepad or touch events to `PlayerInput`.
- Render entity, wheel and player snapshots; present interaction/validation status.
- Dispose the simulation and host-owned resources when leaving the view.

Do not turn every physics frame into a reactive scene-document update. Authored
data changes through transactions; runtime snapshots update render objects.
`playground/main.ts` is the reference host implementation.

## Coordinate migration

1. Identify the source unit from its schema, not from numeric magnitude.
2. Convert millimetres to metres and CSS Y-down to world Y-up where applicable.
3. Convert declared angular units to unit quaternions.
4. Normalize model forward direction, pivot and mounting points in the adapter.
5. Convert Agency's patio +Z north to Nabla's −Z north.
6. Assign explicit kind, motion, dimensions and mass; validate before storage.

Resolve ambiguous old fields in the migration with source-domain knowledge.
Do not make the simulator infer units, behavior from IDs, or model physics from
filenames.

## Interaction contracts

| API / field                             | Host use                                                      |
| --------------------------------------- | ------------------------------------------------------------- |
| `interact()`                            | Enter/exit a nearby vehicle                                   |
| `toggleDock()`                          | Latch/release a car in a compatible garage                    |
| `transferControls()`                    | Switch between carrier and latched cargo                      |
| `toggleFlight()`                        | Request a valid ground/flight transition                      |
| `vehicleInfo()`                         | Steering, driver position, ramp/latch status and flight state |
| `PlayerInput.lift`, `turn`              | Altitude and yaw input independent of camera yaw              |
| `geography`, `geoToLocal`, `localToGeo` | Shared geographic origin and coordinate conversions           |
| `entity.surface`                        | Image on a physical ground surface                            |
| `sky`                                   | Live clock or a fixed UTC instant for host lighting/rendering |

Mode 2 gamepad mapping belongs to the input adapter. Cargo constraints and flight
state are runtime state disposed with the simulation. Geographic imagery fetching,
location permissions and sky rendering belong to the host.

## Integration sequence

1. Build and pack this repository; install the local tarball in an isolated Agency view.
2. Load the example and verify walking, driving, collisions and safe exits.
3. Connect persistence and repeat edit → save → reload → play → stop.
4. Serve packaged `assets/` at the app root, preserving `/world/`, `/geography/`
   and `/brand/`, or explicitly adapt the declared URLs.
5. Verify original models, garage transport, loaded flight and GPS/time persistence.
6. Add new capabilities through explicit contracts with interaction tests.

Portals and HTML interiors are future work. They should extend this baseline
without splitting physics ownership or silently changing scene coordinates.
