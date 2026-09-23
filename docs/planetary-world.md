# Planetary object addresses and portal view environments

A scene's geographic origin is a **working frame**, not the address of the world
and not a constraint on which destinations a project may contain. Rendering and
physics need nearby coordinates; persistence and identity need planet-wide ones.

## Implemented foundation

Project files now use version **2**. Version 1 files and legacy scene imports are
upgraded in memory, without overwriting the original file. Each georeferenced
root entity receives a stable project-global UUID and a planet-fixed `WorldPose`:

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
its physical address. The planet pose is authoritative when opening a version 2
file; the local transform is reconstructed in the payload's working frame. Missing,
duplicate or invalid root references are rejected. Saving edited working copies
updates the planet poses at transaction boundaries, not on every animation frame.

Children retain transforms relative to their parent. Wheels do not need independent
GPS anchors: their planetary transform is obtained by composing their local pose
with the vehicle's global pose. A portal on the ship similarly follows the ship.
Root identities survive save/open and ordinary edits; future transfer operations
must preserve that identity while updating the payload/working-set reference.

Engine exports `toWorldPose`, `fromWorldPose`, `worldPoseGeography` and
`reframeVector`. They use JavaScript double precision and rotate orientation and
velocity between frames. The explicit model is Nabla's existing **mean-radius
sphere**, with +Y north and longitude zero on +X. It is not conventional WGS84
ECEF; GIS/Isaac adapters must convert the model and axes explicitly. This avoids
silently relabeling an approximation as survey-grade coordinates.

## What remains before an Australia portal is playable

The runtime still runs one active local scene. This change is a persistence and
coordinate foundation, not a completed planet-wide streaming runtime.

1. Make working sets spatial caches selected around observers and open portal
   destinations, rather than the ownership boundary for authored objects.
2. Resolve portal endpoints by global root UUID plus child/entity reference.
3. Load and retain a destination working set before showing an open portal.
4. Map the remote observer into the destination frame. Render that frame's terrain,
   objects and environment with its own visibility/collision budget.
5. Transfer a player or vehicle hierarchy, orientation and velocities atomically;
   remove its old runtime body without changing its global identity or duplicating it.
6. Keep a ship's orbital frame alive while its pilot is on Earth. Avoid serializing
   physics motion into authored edit history unless explicitly requested.

In particular, do not feed Sydney coordinates into Madrid's physics scene as
multi-million-metre floats. Version 2 still validates each cached scene against
the current local scene bounds; arbitrary reassignment to a distant working frame
requires the streaming/transfer work above. Full world-object CRUD and portal
routing across working sets are not yet wired into Studio.

## Portal sky correction

The previous remote pass moved the camera but reused the main observer's atmosphere.
Now each portal evaluates the destination camera's atmosphere, stars, fog and direct/
ambient light intensities, renders the remote view, then restores the main context
in a `finally` cleanup. The same globe and textures are reused; no duplicate network
loader or planet geometry is created per portal. Existing main-camera shadow maps
remain a separate limitation; this is not a remote shadow-cascade implementation.

Altitude is measured against the planet surface, not subtracted from the working
frame's altitude. Moving a frame into orbit must not turn that frame's origin into
sea level or inflate the planet radius.

Tests cover ground-to-orbit and orbit-to-ground atmospheric separation, cleanup on
render failure, an orbital working-frame origin, global pose migration, stable
identities, and roundtrip precision/orientation/velocity across Madrid and Sydney.
