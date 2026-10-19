# Bullet-impact sounds

A shot that hits metal rings. What rings, and how, is decided by a **surface kind** carried by
what was hit, never by a model name. The table is `src/config/impact-sounds.ts`.

| Surface kind | Used for                                                   | Tone (vs. the vehicle clang)        |
| ------------ | ---------------------------------------------------------- | ----------------------------------- |
| `metal-body` | vehicle bodies (any entity with a `vehicle`)               | pitch ×1, level ×1, decay ×1        |
| `metal-sign` | road signs and traffic-light poles (scenery layers, hosts) | pitch ×1.5, level ×0.85, decay ×0.7 |

## Where a surface kind comes from

- **Physics bodies:** `Simulation.createSceneryPole(…, { surface })` tags a pole;
  `Simulation.shoot()` returns it as `hit.surface` (null when untagged).
- **Scenery layers:** `SceneryPhysics.layer(name, { surface })`. Default is
  `sceneryPhysicsDefaults.surface` (`metal-sign`) for sign-type layers; world layers (trees, lamp
  posts) are silent unless they set one; `surface: null` is silent.
- **Hand-handled scenery** (instanced signs whose mesh has `userData.sceneryShot`): the mesh may set
  `userData.impactSurface` to a kind (or `null` for silence); without it a handled hit rings as
  `sceneryImpactSurface` (`metal-sign`).
- **Vehicles:** a hit on an entity with a `vehicle` is `vehicleImpactSurface` (`metal-body`), as before.

`Gallery.shoot()` records the last ringing hit in `lastImpact` (`{ point, surface }`); the runtime
plays it with `VehicleAudio.metalImpact(point, surface)` right after the gunshot.

## The sound

No audio asset: it is the engine's procedural metal strike (`src/audio/metal-impact.ts`, four
resonant modes plus a noise tick through WebAudio, pooled in 8 spatial voices). The surface entry
shifts its pitch, level and ring-out; every hit adds its own small random pitch (±10 %), level
(−14 %…+10 %), decay and timbre variant. Each surface has a minimum interval between sounds
(`minInterval`, 40–60 ms) so a burst rings as a flurry instead of stacking voices.

## Add a surface

1. Add the kind and its tone to `impactSounds`.
2. Tag the surface: a layer option, a body shape, or `userData.impactSurface` on a hand-handled mesh.

No colour, lighting or material code is involved.
