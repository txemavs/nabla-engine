# Vehicles: start here

This folder owns the stock vehicle definitions. Each factory creates an ordinary
Entity: dimensions, mass, collider shapes, seats/helm, engine settings and visual
asset references. A game can use these without importing Studio:

```ts
import { createA3, createOutboard, createCarrier, createCessna } from '@nabla/engine/vehicles'
import { Simulation, initPhysics, createEntity } from '@nabla/engine'

await initPhysics()
const simulation = new Simulation({
  version: 1,
  name: 'Harbour',
  entities: [createEntity('spawn', 'spawn', [4, 2, 0]), createOutboard('boat', [0, 0.45, 0])],
})
simulation.setWaterLevel(0)
// Feed input and call simulation.step(elapsedSeconds) from the host loop.
```

| Vehicle         | Definition | Model in assets/world                                 |
| --------------- | ---------- | ----------------------------------------------------- |
| Audi A3         | a3.ts      | car.audi.a3.cabrio.glb, wheel and steering companions |
| Jeep            | jeep.ts    | car.jeep.gladiator.glb, wheel and steering companions |
| Outboard        | boat.ts    | boat.outboard.glb                                     |
| Container craft | carrier.ts | ship.container.5x10.glb                               |
| Cessna          | cessna.ts  | cessna.172.glb                                        |

The host serves `assets/world` at `/world`. Existing asset URLs stay stable so
saved scenes keep working. Do not duplicate the binary models into Studio.

- `src/entity/vehicle/vehicle.ts`: vehicle contract and runtime state.
- `src/simulation/vehicles/boat.ts`: buoyancy, motor, steering and hull damping.
- `src/simulation/simulation.ts`: shared fixed step, boarding, driving and flight.
- `src/simulation/physics.ts`: Rapier adapter; all games use this same implementation.
- `src/render/entity/view.ts`: model presentation, wheels, steering and propellers.
- `src/audio/flight.ts`: synthesized turbine/piston sound without editor UI.
- `studio/flight-audio.ts`: Studio sound button, preference and browser activation.

Old `src/catalog/a3.ts` and sibling imports are compatibility re-exports.
New code should import this folder or the public package. A new vehicle starts
with a definition here, references its assets, and reuses shared physics; avoid
adding a second vehicle simulation to Studio.
