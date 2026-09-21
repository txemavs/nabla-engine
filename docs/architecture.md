# Architecture and invariants

## Ownership

```text
SceneDocument (validated JSON v1)
  ├─ SceneEditor ─ transactions and undo/redo
  ├─ SceneGraph  ─ authored transform hierarchy
  └─ Simulation ─ one Cannon World ─ snapshots
                                      └─ host renderer and UI
```

| Module                            | Owns                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `src/scene.ts`                    | Schema, validation, entity factories and rigid transforms                       |
| `src/editor.ts`                   | Atomic editing transactions and bounded history                                 |
| `src/simulation.ts`               | Physics, character/vehicle controllers and interactions                         |
| `src/vehicle.ts`                  | Default procedural vehicle definition                                           |
| `src/presets.ts`, `src/sample.ts` | Optional authored content                                                       |
| `src/geography.ts`, `src/sky.ts`  | Geographic conversions, approximate astronomy and clock/atmosphere helpers      |
| `playground/`                     | Rendering, browser events, map fetching, location permissions and local storage |

Runtime engine modules do not import the playground or access `window`, `document`,
`localStorage`, Vue or Agency services. The engine uses Three.js math and Cannon-es
physics; it does not own a renderer or install global input handlers.

## Spatial contract

| Concept                    | Convention                                          |
| -------------------------- | --------------------------------------------------- |
| Distance / time / mass     | Metres / seconds / kilograms                        |
| Axes                       | Right-handed; +Y up                                 |
| Object and vehicle forward | −Z                                                  |
| Geographic local axes      | +X east, +Y up, −Z north                            |
| Persisted rotation         | Unit quaternion `[x, y, z, w]`                      |
| Inspector rotation         | Degrees, YXZ order                                  |
| Player camera yaw          | Radians                                             |
| Entity transform           | Translation/rotation relative to its parent         |
| Dimensions                 | Explicit geometry/collider size, no inherited scale |

Three.js owns matrix/quaternion operations. Rigid transforms make world-preserving
reparenting unambiguous; size changes do not rescale descendants. Supporting
inherited scale later requires an explicit scene and physics contract.

IDs are stable references. Names are editable labels. `kind`, `motion`, `vehicle`,
`visual`, `surface`, `geography` and `sky` carry behavior explicitly. Neither IDs
nor filenames select physics, and numbers are not inspected to guess their units.

Validation rejects duplicate IDs, missing parents, cycles, invalid dimensions,
nonunit quaternions and unsupported physical hierarchies. Exactly one spawn is
required. Dynamic bodies and the spawn are roots; visual descendants are supported.
Optional fields preserve compatibility with earlier scene-v1 documents.

## Physics and time

Each `Simulation` owns exactly one Cannon `World`. Controllers apply input before
each fixed 1/60-second tick. Accepted elapsed time is capped at 0.25 seconds per
call; excess is observable through `stats.droppedSeconds`. A fixed step does not
guarantee cross-platform or cross-library-version determinism.

Vehicles use four suspension rays with rear-wheel drive and explicit chassis
colliders. Wheels are not separate rigid bodies. The character is a dynamic box
with fixed rotation, bounded horizontal acceleration and contact-based grounding.
Jump requests are consumed once. Supporting-platform velocity is incorporated
into walking; this is not a complete stair or slope controller.

Entering removes the character body from the world. Exiting tests both sides,
support rays and oriented-box overlap against each collider part. The camera uses
obstacles from the same physics world and excludes its own player/vehicle.

Geographic scenes add a smooth spherical support surface and radial gravity.
Flight retains the same bodies, disables suspension and uses assisted attitude
and altitude control. See [vehicles](vehicle-assets.md) and [geography](geography.md).

## Authored state versus runtime state

`SceneEditor` validates the whole transaction before replacing its document.
Failed edits leave state and history intact; getters return copies. History retains
up to 100 previous states.

Play constructs a simulation from a validated copy. Physics never writes its poses
back into the document. Stop disposes the simulation and restores the authored
view. Cargo constraints and flight state are transient. The sky clock is authored
host state and can change while physics continues.

## Assets and rendering

`visual` declares model URLs and import transforms. `vehicle` declares colliders,
hubs, suspension, forces, viewpoints and optional garage/flight capabilities.
Presets are replaceable data, not simulator special cases.

The GLB library shares geometry/textures and clones instance transforms/materials.
Views dispose their owned resources without invalidating shared assets. Surface
textures and geographic resources have their own disposal paths. Pending map
requests are aborted when obsolete. Rendering is on demand in the editor, with
clock updates once per second in live mode, and continuous during play.

Earth/celestial rendering uses million-metre units. Local objects and tiles use
metres with a camera-relative render origin at large distances. Both passes share
haze color and converted distances; a logarithmic depth buffer supports the range.
They represent the same geographic location, not independent simulation worlds.

## Verification

Unit tests cover schema failure atomicity, hierarchy conversions, reparenting,
clock persistence, geographic round trips and tile coordinates. Physics journeys
exercise walking, collisions, safe exits, driving, garage entry/latching/release,
loaded flight, accelerated ascent, braking and return to ground.

Playwright covers editing, saving, reload, invalid imports, original asset loading,
gamepad mode 2, GPS, map switching, offline behavior, planetary views and clock
changes. Mocked map responses make provider-specific tests repeatable; live map
availability is a separate integration concern.
