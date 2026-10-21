# Player body (avatar)

Files: `avatar.glb` (skinned body, 41 `mixamorig` bones, 1.70 m, feet at y = 0, faces +Z, head
socket marked `nabla_attach: createMonitorAvatar`) and `avatar.anims.glb` (clips `idle`, `walk`,
`run`, `jump_start`, `jump_loop`, `jump_land`, `crouch_idle`, `crouch_walk`, `sit`, `drive`).
The engine's default player body, served at `/avatar/…`.
Credits and licences: [LICENSES.md](LICENSES.md).

Wiring: `GameRuntime.play()` loads it unless the host called `runtime.setPlayerBody(assets)` (its
own body) or `runtime.setPlayerBody(null)` (monitor head only). The engine
(`src/render/entity/player-body.ts`) stands it under the monitor head on foot (chase/third-person
camera, CAM button); the head follows the body's head socket; seated it plays `drive`. Walk/run
follow the walker's walk and sprint speeds.

## Network contract (for multiplayer, Pepe)

Send per player, a few times a second:

```ts
type AvatarNetState = {
  animState: 'idle' | 'walk' | 'run' | 'jump_start' | 'jump_loop' | 'jump_land'
    | 'crouch_idle' | 'crouch_walk' | 'sit' | 'drive'
  yaw: number                       // radians, gameplay heading (0 faces −Z)
  position: [number, number, number] // feet, local metres (world space of the scene)
  speed: number                     // horizontal m/s (sets the stride rate)
}
```

- Local player: `runtime.avatarState` (null until the body is loaded).
- Remote player: `const rig = await runtime.setPlayerBody(assets)` (or
  `PlayerBodyRig.load(assets)`), then per remote `const body = rig.create()`, add `body.root` to
  the scene and call `body.apply(state, dt)` every frame (interpolate `position`/`yaw` between
  packets first). `body.dispose()` when the player leaves. Clips and geometry are shared; each
  body has its own skeleton.
