# 16. Portals

[Manual contents](README.md)

Portals are implemented scene and runtime features. They connect mouths with
explicit transforms and reciprocal links, render a destination view, and allow
supported physical traversal. Some older prose discusses them as a proposal;
use the current code and traversal tests to determine implemented behavior.

A portal may be a root mouth or be hosted directly by a vehicle under the validated
scene contract. Hosted collider shapes belong to that vehicle's existing body.
The visual destination view is not evidence of a separate simulation world.

## Connection and crossing

The portal schema and validators define valid mouth shape, parentage, and reciprocal
links. The root package exports factories including `createPortal`,
`createPortalPair`, and `createCarrierPortal`. Read their actual signatures before
constructing data; do not manufacture IDs or connection fields from a screenshot.

Traversal must transform position, orientation, and relevant relative velocity.
Moving vehicle-hosted mouths also require host motion to be accounted for. Clearance
and occupancy constrain whether a crossing or connection change is allowed.
Presentation must reset interpolation after teleportation rather than visually
sweeping the actor across the distance between mouths.

## Practical verification

Start with the existing portal factories and a simple static scene. Verify a
reciprocal pair through `parseScene`, then walk through both directions. Repeat
with a vehicle only after confirming its dimensions fit the aperture. For hosted
portals, repeat while the host moves and while the player is inside it.

Useful focused regressions include:

```sh
npx vitest run test/simulation/placed-portals.test.ts
```

Inspect the broader portal tests when changing mapping or moving interiors. A
passing static pair is insufficient evidence for moving mouths, safe exits, or
remote environment rendering. Preserve authored scene data when making runtime
connection changes unless the application explicitly saves an edit.

## Source of truth

- [Portal schema](../../src/entity/portal/field.ts) and [factories/mapping](../../src/entity/portal/portal.ts).
- [Traversal](../../src/simulation/portal-traversal.ts).
- [Clearance](../../src/simulation/portal-clearance.ts).
- [Portal rendering](../../src/render/portal/portals.ts).
- [Current portal guide](../portals.md).
