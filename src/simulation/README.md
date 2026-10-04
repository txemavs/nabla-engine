# Simulation

`Simulation` remains the public facade and owner of one Rapier world. It copies
the scene, owns player/control selection and runs the fixed-step sequence. Hosts
continue to use the same constructor, actions, snapshots and disposal API.

**Owns:** the Rapier world, boarding, portal crossing, docking, catch floor.
**Does not own:** cameras, audio, HUD, or Studio input.

Boarding/hover details: [vehicle interaction](vehicle-interaction.md).
Vehicle controllers: [`vehicles/`](vehicles/README.md).

The following internal modules do not import the coordinator or browser/runtime
code. Architecture tests enforce that dependency direction, including type imports.

| Module                                                 | Responsibility and lifetime                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `contracts.ts`                                         | Device-independent input and copied player snapshot types                                        |
| `entity-body.ts`                                       | Construct uninstalled collider bodies from authored entities; no world/registry ownership        |
| `map-collisions.ts`                                    | Deferred cooking order, soft installation budgets and conservative activation around every actor |
| `terrain-boundary.ts`                                  | Restrain actors near the edges of finite authored ground while allowing neighboring seams        |
| `catch-floor.ts`                                       | Own/remove the emergency planetary floor body; never substitute it for missing terrain           |
| `road-assist.ts`                                       | Own the optional road-centre spatial index and strength; manual steering takes precedence        |
| `portal-clearance.ts`                                  | Compute bodywork/tyre envelopes and conservative destination corridors                           |
| `portal-traversal.ts`                                  | Own crossing locks/events and preserve relative velocity across moving portal frames             |
| `vehicle-docking.ts`                                   | Own garage lock joints and validate parked/supporting geometry                                   |
| `vehicles/wheeled`, `vehicles/boat`, `vehicles/flight` | Existing independent vehicle behavior implementations                                            |

Subsystems receive explicit typed inputs or a narrow service interface. They do
not receive a mutable `Simulation`, use `any`, inherit its implementation, or
depend on method binding tricks. They borrow the world; only the facade frees it.
Docking removes lock joints, the catch floor removes its body and registries clear
their references before world disposal.

## Ordering and safety

Collision preparation and deferred installation happen before fixed steps.
Each tick records interpolation/portal history, updates moving interiors and
ramps, applies forces, advances physics, restrains finite terrain, resolves portal
crossings and updates support. This order is preserved by extraction.

Map cooking has a soft time/count budget. Colliders immediately needed for safety
can exceed it. Culling considers all actors, velocity look-ahead and suspended
map bodies at portal exits. Cheap rendering profiles do not reduce the physics
rate or remove required ground coverage.

## Remaining coordination

Player boarding/exit, interior state, gameplay actions and snapshot assembly
remain in the facade because they synchronize several subsystems. The facade is
still substantial; this is a responsibility-based decomposition, not a claim of
complete architectural simplification. Further extraction should follow a tested
ownership boundary, particularly player locomotion/interior transitions, rather
than splitting the file into arbitrary method groups.

Keep tuning in `src/config`, behavioral contracts beside the implementation and
the generated reference up to date. Existing physics/portal/garage regressions
verify compatibility; headless CPU and browser profile benchmarks are separate
from correctness tests.

- Generated reference: [REFERENCE.md](REFERENCE.md)
