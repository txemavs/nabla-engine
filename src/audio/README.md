# Audio

Synthesized vehicle sound. Shared context in `vehicle.ts`; each voice is its own
file (turbine, propeller, powertrain, tires).

**Owns:** graph, voices, tire squeal.
**Does not own:** the Studio mute button, preferences, or user activation.

Studio supplies DOM controls and browser activation. Engine does not read Studio
DOM or local storage.

- Tests: exercised through runtime/browser hosts
- Vehicles: [`src/catalog/vehicles`](../catalog/vehicles/README.md)
