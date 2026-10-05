# Vehicle control profiles

Every seat in the browser game gets its on-screen controls and HUD readouts from a
**control profile**. A vehicle declares its profile as data; the runtime resolves it
each frame and drives the touch rigs and the HUD from it. Adding a vehicle type means
setting a field in its preset (or registering one new profile), never adding a branch
to `src/runtime/browser.ts`.

Source: [`src/runtime/control-profiles.ts`](../src/runtime/control-profiles.ts).
Tests: [`test/runtime/control-profiles.test.ts`](../test/runtime/control-profiles.test.ts)
and [`test/game/telemetry.test.ts`](../test/game/telemetry.test.ts).

## Built-in profiles

| Profile  | Used by                                           | Touch rig                                                               | Speed | Gear | In flight mode |
| -------- | ------------------------------------------------- | ----------------------------------------------------------------------- | ----- | ---- | -------------- |
| `none`   | On foot (also walking inside a carrier), trailers | Action bar only: Enter / exit, Camera                                   | no    | no   | –              |
| `road`   | Cars (`car`, `a3`) and trucks (`white-truck`)     | Steering wheel, accelerator, handbrake, turbo, plus the action bar      | yes   | yes  | `none`         |
| `flight` | Carrier (`carrier`) and future drones             | Mode 2 sticks (left climb / yaw, right pitch / roll) with their own bar | no    | no   | –              |

- **Touch rig** is the overlay drawn by `TouchDriving` (road and `none`) or
  `TouchFlight` (flight). Exactly one overlay is live while playing; `flight` hides
  the road overlay completely, so the wheel and pedals never appear inside the ship.
- **Speed / Gear** control the `km/h` and gear readouts: the `GameHud` telemetry line
  and the standalone game's `#speed-display` / `#gear-display`. The carrier shows its
  speed and altitude on its own helm monitors instead.
- **In flight mode** is the profile used while `vehicleInfo(id).flightMode` is true.
  A road chassis that can fly drops to `none` in the air.

Keyboard and gamepad mappings are not part of the profile; they still mix through
`GameInput` exactly as described in [Controls](controls.md).

## Declaring a vehicle's profile

Set `vehicle.controls` in the preset JSON (or on any scene entity's `vehicle`):

```json
{
  "id": "white-truck",
  "vehicle": {
    "controls": "road",
    "colliders": []
  }
}
```

Stock presets declare their profile explicitly:

| Preset                                   | `controls` |
| ---------------------------------------- | ---------- |
| `car`, `a3`, `white-truck`               | `road`     |
| `carrier`                                | `flight`   |
| `white-trailer`, `white-trailer-chassis` | `none`     |

The field is optional. When it is omitted (older saved scenes, procedural prefabs,
custom presets) `inferControlProfileId` picks one:

1. No vehicle (on foot) or `passive` (trailer) → `none`
2. `garage`, `interior` or `flight` (carrier-like) → `flight`
3. `boat` or `plane` → `none` (no touch rig yet; register one, see below)
4. Anything else → `road`

An explicit `controls` always wins over inference. An id that is not registered
resolves to `none`, so a typo hides controls instead of showing the wrong ones. A
test checks that every stock preset declares a registered profile that matches its
inferred one.

## Registering a new profile

Hosts and future vehicle types register a profile once, before play, and then point
presets at it:

```ts
import { registerControlProfile } from '@nabla/engine/runtime'

registerControlProfile({
  id: 'boat',
  description: 'Outboard: wheel for rudder, slider for throttle; speed without a gearbox.',
  touch: 'road', // reuse the wheel/accelerator rig
  hud: { speed: true, gear: false },
})
```

```json
{ "id": "outboard", "vehicle": { "controls": "boat", "boat": true } }
```

Profile fields:

| Field         | Meaning                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| `id`          | Lowercase letters, digits and dashes (≤ 40). The value used in `vehicle.controls`. |
| `description` | Short English description for docs and debugging.                                  |
| `touch`       | `'road'`, `'flight'` or `null` (action bar only).                                  |
| `hud.speed`   | Show the `km/h` readout.                                                           |
| `hud.gear`    | Show the gear readout (`P`, `R`, `D3`, `M3`).                                      |
| `inFlight`    | Optional profile id used while the vehicle is in flight mode.                      |

`registerControlProfile` rejects duplicate ids (pass `{ replace: true }` to override,
including a built-in), malformed ids and unknown touch rigs.
`unregisterControlProfile` removes host profiles; built-ins cannot be removed. Use
`controlProfiles()` to list what is registered.

A profile chooses among the existing rigs. A genuinely new on-screen rig (for example a
plane yoke) needs a new rig class plus a new `touch` value handled in
`touchRigState`; that is the only place that maps rigs onto overlays.

## How the runtime applies a profile

Each frame `GameRuntime` (in `browser.ts`):

1. Reads the seated vehicle's live definition with `Simulation.vehicleSpec(id)`, so
   host-placed vehicles (`installHostVehicles`, `placeVehicle`) resolve too.
2. Calls `resolveControlProfile(definition, { flightMode })`, then `controlSurfaces`.
3. Applies `touchRigState(surfaces.touch, playing)` to `TouchDriving` / `TouchFlight`
   and feeds road touch input only when `seatedRoad` is true.
4. Passes `showSpeed` / `showGear` to `GameHud` and exposes the surfaces to hosts as
   `GameFrame.controls` (`{ profile, touch, speed, gear }`).

Hosts with their own readouts should follow `GameFrame.controls`. The standalone game
does this in [`game/telemetry.ts`](../game/telemetry.ts):

```ts
onFrame(frame) {
  showTelemetry(frame) // hides #speed-display / #gear-display unless the profile shows them
}
```

`isRoadTouchDriving(vehicle, flightMode)` remains as a thin wrapper over the resolver
for existing callers; new code should use `resolveControlProfile`.
