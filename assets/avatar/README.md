# Player body (avatar)

Files: `avatar.glb` (skinned body, 41 `mixamorig` bones, 1.70 m, feet at y = 0, faces +Z, head
socket marked `nabla_attach: createMonitorAvatar`) and `avatar.anims.glb` (clips `idle`, `walk`,
`run`, `jump_start`, `jump_loop`, `jump_land`, `crouch_idle`, `crouch_walk`, `sit`, `drive`).
The mannequin body and the shared clips, served at `/avatar/…`.

**Default body:** `prota/` (Gepeto's original "prota", 65 bones, belt + holster with the
holstered USP + baton hung at its sockets, recolourable `nabla_color_slot` materials), using
`avatar.anims.glb` for its clips. Credits: [prota/LICENSES.md](prota/LICENSES.md). The
mannequin stays here for hosts that ask for it with `setPlayerBody({ model:
'/avatar/avatar.glb', animations: '/avatar/avatar.anims.glb' })`. Held weapons go to
`WeaponSocket_R` (grip on the socket); remote players get the same via
`runtime.createWeaponProp(slot, body)`.
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
  animState:
    | 'idle'
    | 'walk'
    | 'run'
    | 'jump_start'
    | 'jump_loop'
    | 'jump_land'
    | 'crouch_idle'
    | 'crouch_walk'
    | 'sit'
    | 'drive'
  yaw: number // radians, gameplay heading (0 faces −Z)
  position: [number, number, number] // feet, local metres (world space of the scene)
  speed: number // horizontal m/s (sets the stride rate)
}
```

- Local player: `runtime.avatarState` (null until the body is loaded).
- Remote player: `const rig = await runtime.setPlayerBody(assets)` (or
  `PlayerBodyRig.load(assets)`), then per remote `const body = rig.create()`, add `body.root` to
  the scene and call `body.apply(state, dt)` every frame (interpolate `position`/`yaw` between
  packets first). `body.dispose()` when the player leaves. Clips and geometry are shared; each
  body has its own skeleton.
