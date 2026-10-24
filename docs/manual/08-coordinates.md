# 8. Coordinates and world representation

[Manual contents](README.md)

The local spatial convention is metres, seconds, kilograms, Y up, and −Z forward.
Geographic local frames use +X east and −Z north; therefore +Z points south.
Persisted rotations are unit quaternions in `[x, y, z, w]` order. UI angles and
runtime angles are not interchangeable: inspect each API's units, especially
headings, camera yaw, and transition durations.

| Quantity             | Representation                      |
| -------------------- | ----------------------------------- |
| Entity position      | Parent-relative `[x, y, z]`, metres |
| Entity rotation      | Unit quaternion `[x, y, z, w]`      |
| Geographic position  | Latitude, longitude, altitude       |
| Geographic tile      | `{ z, x, y }` in Web Mercator       |
| Tile-local offset    | `dx` east and `dz` south, metres    |
| Physics elapsed time | Seconds                             |

## Converting an input location

The public `@nabla/engine/planet/lat-lon` module accepts common coordinate text
formats. `parseLatLon` returns `undefined` for an invalid location; handle that
before using `tileOffsetFromGeo`.

```js
import { parseLatLon, tileOffsetFromGeo } from '@nabla/engine/planet/lat-lon'

const location = parseLatLon('43.3386, -1.7899')
if (!location) throw new Error('Invalid geographic location')
const { tile, dx, dz } = tileOffsetFromGeo(location)
console.log(tile, dx, dz)
```

This fragment is exercised in [contracts.mjs](../../examples/manual/contracts.mjs).
The parser supports decimal and hemisphere forms; the Web Mercator grid excludes
the polar regions beyond its latitude limit. A general geographic scene schema
accepting ±90° does not make every tile conversion valid at those latitudes.

## Local geometry and planetary views

Use explicit geographic conversion functions rather than treating degrees as
metres or swapping longitude and latitude based on a guess. Scene geography
anchors local content and informs sky/environment behavior. It does not by itself
download terrain or guarantee a collision surface at the spawn.

Large-distance rendering and local physics have different precision concerns.
The presentation uses geographic frames and camera-relative techniques where
needed; keep authored transforms and physics contracts in their documented units.
Do not “fix” a distant visual offset by multiplying saved positions by an arbitrary
scale. Check the geographic anchor, frame conversion, altitude, and model import
transform separately.

For a practical check, place two entities ten metres apart in local X. They should
remain ten metres apart after a geographic round trip within the relevant numerical
tolerance. Use the existing geographic tests before changing conversion math.

## Source of truth

- [Coordinate parser](../../src/planet/lat-lon.ts).
- [Geographic math](../../src/math/geo/sphere.ts).
- [Tile math](../../src/scene/mercator.ts).
- [Transform representation](../../src/math/frame/vectors.ts).
