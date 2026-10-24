# 12. Vehicles

[Manual contents](README.md)

A vehicle combines an entity, a validated vehicle definition, a control profile,
and optional visual presentation. Its size and mass belong to the entity; the
vehicle payload defines such things as wheels, suspension, forces, seats, and
camera placement. Concrete recipes belong in catalogs or application content.

## Create and drive a vehicle

Use `presetVehicle` for an existing catalog vehicle, or compose `createEntity` with
`vehicleDefinition` for a procedural one. The complete
[custom prefab example](../../examples/modularity/custom-prefab.mjs) builds a compact
car, validates the scene, enters it, and verifies acceleration:

```sh
npm run build
node examples/modularity/custom-prefab.mjs
```

Start with a known-good definition and change one group of parameters at a time.
Check wheel placement and suspension travel before compensating with engine force.
Check mass and collider shape before tuning braking. The ignition and parked state
are part of vehicle interaction; applying throttle immediately after entry is not
equivalent to a running engine already in a driving state.

## Families and composition

Wheeled and two-wheeled runtimes have separate public subpaths. The two-wheeled
system adds balance, rider shifts, braking, pitch behavior, and crashes. Boat and
flight modules can run independently with a shared physics world and injected
environment. See the runnable [boat/flight example](../../examples/modularity/boat-flight.mjs).

The high-level scene/simulation container still shares some wheel-oriented fields;
do not infer from standalone boat/flight APIs that every high-level schema is fully
independent of wheeled assumptions. Some ship and aircraft presentation remains
model-specific. These are current boundaries, not an invitation to invent a
universal spawn interface.

## Interaction, equipment, and damage

Entering and leaving a vehicle changes player simulation state. Exit placement
must account for support and obstacles. Trailers, docking, cargo constraints, and
forklift behavior use existing simulation ownership. They must not create competing
bodies for the same authored entity.

Vehicle damage and visual destruction are different layers. A smoke or debris
effect is not the authoritative health state. When adding a family, test spawning,
entry, ignition, driving, stopping, exit, recovery, and disposal; add trailer or
flight journeys when applicable.

Tuning contains gameplay assumptions. A visually convincing motorcycle is not
evidence of measured real-world suspension or braking accuracy.

## Source of truth

- [Definition schema](../../src/entity/vehicle/field.ts).
- [Default definition](../../src/entity/vehicle/vehicle.ts).
- [Wheeled runtime](../../src/simulation/vehicles/wheeled/runtime.ts).
- [Two-wheeled runtime](../../src/simulation/vehicles/two-wheeled/runtime.ts).
- [Damage](../../src/simulation/vehicle-damage.ts).
- [Vehicle creation guide](../creating-a-vehicle.md).
