# Boat and flight composition — phase 5

Public entry points are `@nabla/engine/vehicles/boat` and
`@nabla/engine/vehicles/flight`. Both receive borrowed Rapier adapter bodies from
`@nabla/engine/physics`. Neither imports vehicle entities, cars, stock models,
rendering, Studio or the scene coordinator, including type imports.

Run the standalone host:

```sh
npm run build
node examples/modularity/boat-flight.mjs
```

## Ownership and environment

`createBoat(body, engineForce)` creates only helm/throttle state.
`stepBoatInWater(boat, input, water, dt, active)` samples a world-space keel point
through `water.sample(keel, body)`. Return unit `up` and signed immersion `depth`
in metres. The default six-metre hull retains its existing buoyancy, planing,
stern thrust, throttle lag and damping equations. It is not a universal hull
solver: different hull dimensions will need their own hydrodynamic parameters.
The previous low-level `stepBoat` signature remains available with a narrow
structural runtime instead of requiring a car.

`createFlight(body, altitude, plane)` initializes flight state.
`stepFlight(runtime, input, environment, dt, active)` receives height, unit up,
local tangent quaternion, minimum altitude, planetary travel flag, and optional
rigidly docked cargo bodies. Cargo receives assisted hover/cruise acceleration
once per body, preserving the existing assembly behaviour. Aircraft lift and
container-assisted flight retain their previous equations. Cruise configuration
uses km/h; height, depth, body velocity and forces use SI.
The `off` helm mode retains the existing assisted-flight behaviour; this refactor
does not redefine a power cutoff or release cargo.

The host owns gravity, collisions, dock joints, world stepping, rebasing and
cleanup. Call controllers before stepping **one** shared world. Neither creates
a world, attaches wheels, schedules animation frames or destroys a body.
Controllers mutate their state and accumulate forces; never call them twice for
one body in the same physics tick. Inputs and samples must be finite; directions
must be normalized by the host. A zero timestep is a no-op; negative/nonfinite
timesteps are rejected by the new entry points.

## Existing application

`Simulation.pilotBoat` now supplies the current water level and planetary height.
`Simulation.fly` supplies the tangent frame and its dock registry. Boarding,
ramps, portals, ground/flight transitions and serialized vehicle definitions stay
in the coordinator. The active scene vehicle container still shares wheel fields; standalone
boat/flight clients need none. Splitting that container is a separate runtime
and schema change; it is not a compatibility path.

The ship HUD and boat console share `LayeredMonitor` for speed/altitude glyphs:
values update at 100 ms only while visible. The boat uses navigation-only mode
without canvas repainting. The ship retains its existing canvas artificial
horizon; this is an intentional remaining dynamic layer, not a claim that the
entire HUD is static. No new HTML rasterization, physics loop or monitor library
was added. Their mounting is still a scene presentation adapter responsibility.

## Regression coverage

- Independent hull follows an injected water-level change and propels without wheels.
- Independent flight shares lift with borrowed cargo without duplicate forces or world stepping.
- Architecture checks reject car/entity/catalogue/render imports from both runtimes.
- Existing boat, Cessna, carrier, boarding, dock, ramp and portal tests cover the coordinator.
