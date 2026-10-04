# Vehicles: start here

Stock vehicle definitions are JSON files next to their models, not code.

A3, S3 and the modern tractor derive wheel and steering poses from their body
GLBs. See the [anchor contract and generation workflow](../../../docs/vehicle-rigs.md).
Generated poses support headless physics; do not copy them back into preset JSON.

`assets/studio` is what this repo publishes. `assets/custom` is this machine only
and is gitignored. Both use `cars`, `planes`, `ships` and `boats`. Studio loads
both. To publish a vehicle, move its folder into `assets/studio`.

| Published now   | Folder                          |
| --------------- | ------------------------------- |
| S3 and A3       | `assets/studio/cars/a3`         |
| Container craft | `assets/studio/ships/container` |
| Portal frame    | `assets/studio/portals`         |

Jeep, police Focus, Cessna and the outboard stay in `assets/custom` until one is
ready to publish. `presentation` still names a code adapter (`nabla.s3`,
`nabla.wrangler`, `nabla.police`) for lights, mirrors and paint. A plain model
omits that field.

Spawn one by the `id` in its JSON. The folder name is not the catalog id.

```ts
import { presetVehicle } from '@nabla/engine/vehicles'
import { Simulation, initPhysics, createEntity } from '@nabla/engine'

await initPhysics()
const simulation = new Simulation({
  version: 1,
  name: 'Harbour',
  entities: [createEntity('spawn', 'spawn', [4, 2, 0]), presetVehicle('car', 'car', [0, 0.62, 0])],
})
// Feed input and call simulation.step(elapsedSeconds) from the host loop.
```

The host serves `assets/` at the site root, so a file's URL is its path under
that folder. Do not duplicate the binary models into Studio.

- `src/entity/vehicle/vehicle.ts`: vehicle contract and runtime state.
- `src/simulation/vehicles/boat.ts`: buoyancy, motor, steering and hull damping.
- `src/simulation/simulation.ts`: shared fixed step, boarding, driving and flight.
- `src/simulation/physics.ts`: Rapier adapter; all games use this same implementation.
- `src/render/entity/view.ts`: model presentation, wheels, steering and propellers.
- `src/audio/vehicle.ts`: shared audio context. Each voice is its own file beside it (turbine, propeller, powertrain, tires, gear clack).
- `studio/vehicle-audio.ts`: Studio sound button, preference and browser activation.

Import this folder or the public package. A new vehicle is a JSON preset plus its GLB.
Reuse the shared physics; do not add a second vehicle simulation to Studio.

The police Focus definition is `assets/custom/cars/police/police-focus.json`. Its light bar stays
in code (`catalog/presentation/police-equipment.ts`) because it walks the mesh.

See [create a vehicle](../../../docs/creating-a-vehicle.md) for the public APIs,
custom adapters and standalone wheeled/boat/flight hosts.
