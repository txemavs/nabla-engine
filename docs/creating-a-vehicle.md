# Create a vehicle

Start with the [module map](architecture/module-map.md). Choose one host:

1. **Scene host:** a serializable entity is consumed by the existing `Simulation`
   and public `SceneView`. This retains boarding, portals, cameras and docking.
2. **Standalone physics host:** create a body in your own shared world and attach
   `/vehicles/wheeled`, `/vehicles/boat` or `/vehicles/flight`. This needs no Studio
   or scene entity. You own input, steps, rendering and cleanup.

## A procedural scene car

A new procedural car needs only a prefab. `vehicleDefinition` derives an ordinary
four-wheel configuration from its dimensions; tune the returned definition without
changing the coordinator or rendering code:

```ts
import { createEntity, vehicleDefinition, type Entity } from '@nabla/engine'

export function createCompact(id: string): Entity {
  const car = createEntity(id, 'vehicle', [0, 1, 0])
  car.name = 'Compact'
  car.motion = 'dynamic'
  car.mass = 1100
  car.size = [1.8, 1.4, 4]
  car.color = '#647585'
  car.vehicle = {
    ...vehicleDefinition(car),
    drivenWheels: 'front',
    engineForce: 2800,
    driver: [-0.35, 0.55, 0],
    headOffset: [0, -0.15, -0.26],
    cameraDistance: 8,
  }
  return car
}
```

Add it to a version-1 scene containing exactly one spawn and a floor. Initialize
Rapier once with `initPhysics()`, construct `Simulation`, and feed `idleInput()`
with normalized forward/right values. `startInVehicle(id)` is useful for a test
host; normal play uses the boarding API. Step from the host clock. Do not create a
physics world per car. See the [complete custom prefab](../examples/modularity/custom-prefab.mjs), [headless scene](../examples/modularity/headless-vehicle.mjs)
and [independent wheeled runtime](../examples/modularity/wheeled-runtime.mjs).

## Add your model and equipment

Serve your GLB under an application-owned URL. `visual.body` supplies URL and local
transform; wheel and steering companions are optional. Keep colliders explicit,
metres/Y-up/−Z-forward. Use named mount nodes on new assets. Configure
`visual.presentation: 'my.compact'` and implement a
`VehiclePresentationAdapter` from `/vehicle-presentation`:

```ts
import { SceneView } from '@nabla/engine'
import type { VehiclePresentationAdapter } from '@nabla/engine/vehicle-presentation'
import { stockVehiclePresentation } from '@nabla/engine/vehicle-presentation/presets'

const compactAdapter: VehiclePresentationAdapter = {
  mount(model, entity, instrumentRecipe) {
    // Find YOUR named mounts. Return optional lights, mirrors, instruments,
    // beacons. See the equipment contract for constructors and resource ownership.
    // Returning {} is valid for a model with no optional equipment.
    return {}
  },
}
const view = new SceneView(scene, false, false, {
  vehiclePresentation: (entity) =>
    entity.visual?.presentation === 'my.compact'
      ? compactAdapter
      : stockVehiclePresentation(entity),
})
```

The resolver is supplied by your host; no edit to Simulation, SceneView or Studio
is needed. Stock Studio cannot know an arbitrary application adapter ID: register
it in your host composition or ship a catalogue adapter. Never assign the S3 ID to
an unrelated GLB just to obtain its instruments.

The [equipment guide](architecture/vehicle-equipment.md) specifies lamps, mirrors,
mount quads, animation and disposal. Model geometry/textures may be shared; dispose
only resources you own. Independent mounts are demonstrated at
`/examples/equipment.html` while running the development server.

## Monitors, settings and controls

Compose the same `/monitors` and `/menus` used for wall displays. See
[create a monitor](creating-a-monitor.md); physics must not depend on the screen.
The host handles menu actions, validates patches and uses `SceneEditor.update`
for undo/redo and persistence. Read existing saved values before prefab defaults.
The host translates keys/gamepads/touch into inputs and consumes menu keys before
feeding steering, clearing held controls when focus changes.

## Boat or aircraft

For an independent hull or airframe, use the [boat/flight example](../examples/modularity/boat-flight.mjs).
These APIs borrow a body and require no wheels. The existing scene serialization
still has legacy wheel fields; use stock scene factories for compatibility rather
than inventing a new JSON version. A plane may combine wheeled and flight control
on the same body; enable only the intended force controller at a time.

## Verify a new prefab

Test real contacts, drive/coast/brake/steer, shared-world rebasing, boarding and
cleanup. Check two instances together to catch destruction of shared assets.
For equipment, check missing mounts, power-off behaviour, paint and saved mirror
settings. Compare draw calls/triangles and secondary update counts with the same
camera and scene; geometry counts alone are not measured FPS.
