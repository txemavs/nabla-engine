# Planetary object addresses and portal view environments

A scene's geographic origin is a **working frame**, not the address of the world.
Rendering and physics need nearby coordinates; persistence and identity need
planet-wide ones.

Studio version-3 saves and travel UI: [named projects](../../docs/studio-projects.md).
Product remaining work: [planetary addresses](../../docs/planetary-world.md).

## Implemented foundation

Each georeferenced root entity receives a stable project-global UUID and a
planet-fixed `WorldPose`:

```json
{
  "id": "a-global-object-uuid",
  "locationId": "the-current-payload-working-set",
  "entityId": "car-a",
  "pose": {
    "frame": "nabla-earth-sphere-v1",
    "position": [4700000, 4200000, 300000],
    "rotation": [0, 0, 0, 1]
  }
}
```

`locationId` and `entityId` locate the object's serialized payload. They are not
its physical address. The planet pose is authoritative when opening a version-2
file; the local transform is reconstructed in the payload's working frame.

Children retain transforms relative to their parent. Wheels do not need independent
GPS anchors. A portal on the ship follows the ship.

Engine exports `toWorldPose`, `fromWorldPose`, `worldPoseGeography` and
`reframeVector` from [`src/math/geo`](../math/geo/README.md). The model is Nabla's
**mean-radius sphere**, with +Y north and longitude zero on +X. GIS/Isaac adapters
must convert axes explicitly.

## Portal sky correction

Each portal evaluates the destination camera's atmosphere, stars, fog and light
intensities, renders the remote view, then restores the main context. Local paired
portals reuse the main globe. Cross-location windows use a separate destination
scene, capped at two. See [`src/render/portal`](../render/portal/README.md).

Altitude is measured against the planet surface. Tests cover ground-to-orbit and
orbit-to-ground atmospheric separation, cleanup on render failure, global pose
migration, and roundtrip precision across Madrid and Sydney (`test/world`,
`test/geography`).
