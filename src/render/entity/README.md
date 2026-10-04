# Entity rendering

How authored entities look: vehicles, lamps, avatar, instruments, thrusters.

**Owns:** model presentation, wheels, lights, GPS casing, ship HUD.
**Does not own:** physics or catalog recipes.

Generic equipment controllers live in
[`vehicle-presentation/`](../vehicle-presentation/README.md). Stock selectors
stay in [`src/catalog/presentation`](../../catalog/presentation/README.md).

- Tests: `test/render`
