# Geo

Mean-radius sphere, local east-up-south frame, slippy-tile indices, approximate
sun and moon, planet-fixed pose. No OSM tags, no scene documents.

**Owns:** `geoToLocal`, `localToGeo`, `toWorldPose`, `fromWorldPose`, tile indices.
**Does not own:** map imagery, streaming, or `SceneDocument.geography` persistence.

WGS84 latitude/longitude angles are mapped onto a sphere of 6,371,000 m, not a
survey ellipsoid. Local origin: +X east, +Y up, −Z north. Agency's patio wire
format uses +Z north; convert that axis explicitly.

`geoToLocal` and `localToGeo` use an Earth-centred frame, including antimeridian
crossings and large altitudes. Physics uses metres and double-precision numbers.
This is not orbital mechanics and not conventional WGS84 ECEF.

Parent overview: [`src/math`](../README.md). Product geography:
[docs/geography](../../../docs/geography.md). World poses:
[planetary-world](../../planet/planetary-world.md).

- Tests: `test/geography`

- Generated reference: [REFERENCE.md](REFERENCE.md)
