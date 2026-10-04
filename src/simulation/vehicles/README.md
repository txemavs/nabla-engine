# Vehicle controllers

Independent wheeled, boat and flight behaviour. They borrow a Rapier body and
do not own a world.

**Owns:** drivetrain, buoyancy, assisted/aircraft flight.
**Does not own:** boarding, portals, docking, or the shared clock.

- Boat/flight contract: [boat-flight-runtime](boat-flight-runtime.md)
- Wheeled contract: [wheeled](wheeled/wheeled-runtime.md)
- How-to: [create a vehicle](../../catalog/vehicles/creating-a-vehicle.md)
- Tests: `test/simulation`

- Generated reference: [REFERENCE.md](REFERENCE.md)
