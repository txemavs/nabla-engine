# Engine configuration by topic

Engine tuning lives in small, typed topic files under `src/config`. Import their
public entries from `@nabla/engine/config` or `@nabla/engine/config/<topic>`.
Values have English source comments describing units and behavior. These modules
contain data and small validation helpers; they do not create worlds or renderers.

| Topic              | Source                                         | Application mechanism                                                                                              |
| ------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Camera             | [camera.ts](../src/config/camera.ts)           | `GameRuntime({ camera: overrides })` in both shared and browser runtimes; independent settings per instance        |
| Controls           | [controls.ts](../src/config/controls.ts)       | Build-time defaults for mouse sensitivity, gamepad deadzone and keyboard steering                                  |
| Performance        | [performance.ts](../src/config/performance.ts) | Browser `performance` option; named presets and supported quality choices                                          |
| Shadows            | [shadows.ts](../src/config/shadows.ts)         | Quality keys select cascade count, map size, reach and texel-scaled bias; `shadowBiasRange` bounds the live factor |
| Lighting           | [lighting.ts](../src/config/lighting.ts)       | Browser fallback lights; geographic lights support `fieldLights.layers` and `fieldLights.look` overrides           |
| Terrain scheduling | [streaming.ts](../src/config/streaming.ts)     | Build-time sampling/install budgets and floating-origin distance; tile/cache limits remain in performance presets  |
| Simulation         | [simulation.ts](../src/config/simulation.ts)   | Build-time fixed stepping, gravity, solver and player movement defaults                                            |

## Camera example

```ts
import { GameRuntime } from '@nabla/engine/runtime/browser'

const game = new GameRuntime({
  canvas,
  scene,
  camera: {
    autoCenterDelayMs: 10_000,
    autoCenterBlendMs: 500,
  },
})
```

Ten seconds are measured from the last manual look, not from the last steering
input. During the grace period automatic exterior heading and road look-ahead
remain suspended. After ten seconds recovery ramps up over half a second.
Ground and flight recovery use the same settings. Cockpit look stays manual;
overhead view intentionally follows vehicle orientation (heading-up; on foot it follows the
walking heading), but only its roll-independent ground heading: while the vehicle tumbles the
overhead and exterior views hold a calm heading (see the `tumble*` settings below and
[camera modes](controls.md#camera-modes)). Replay retains overrides.

Overhead and cinematic tuning (see [camera modes](controls.md#camera-modes)):

| Setting                                              | Default             | Meaning                                          |
| ---------------------------------------------------- | ------------------- | ------------------------------------------------ |
| `mapHeight` / `mapMaxHeight`                         | 45 / 600 m          | Vehicle overhead base and maximum height         |
| `footMapHeight`                                      | 18 m                | On-foot overhead height at wheel zoom 1          |
| `mapHeadingResponse` / `mapMaxYawRate`               | 12 s⁻¹ / 6 rad/s    | Driving heading follower (yaw-rate feed-forward) |
| `mapFollowResponse`                                  | 8 s⁻¹               | Driving position follower (critically damped)    |
| `tumbleHeadingResponse` / `tumbleMaxYawRate`         | 2.5 s⁻¹ / 1.2 rad/s | Heading follower while the vehicle tumbles       |
| `tumbleFollowResponse`                               | 3 s⁻¹               | Overhead position follower while tumbling        |
| `tumbleUprightness` / `tumbleTiltRate`               | 0.5 / 3 rad/s       | Tumbling: up axis past 60°, or swinging faster   |
| `tumbleSettleSeconds` / `tumbleRecoverySeconds`      | 0.4 s / 1.5 s       | Upright time to end a tumble; ease back after    |
| `tumbleTrackSpeed`                                   | 3 m/s               | Tumbling faster than this aims along the travel  |
| `cinematicDistanceScale` / `cinematicMinDistance`    | 2.4 / 9 m           | Orbit radius vs. chase distance, minimum         |
| `cinematicElevation`                                 | 0.32                | Height above the target as a fraction of radius  |
| `cinematicOrbitSeconds`                              | 48 s                | One full orbit; 0 holds the angle still          |
| `cinematicBob` / `cinematicFov` / `cinematicDamping` | 0.8 m / 38° / 4 s⁻¹ | Drift, lens, height smoothing                    |

`createGameCameraState(overrides)` supports hosts that update cameras directly.
Camera overrides are validated before use. Durations must be finite and
non-negative; ordered ranges and positive divisors/FOV are checked. Do not mutate
the exported defaults. To change a running camera's settings, recreate its state
with `createGameCameraState` so telemetry and framing share the same settings.

## Display, synchronization and scaling

[display.ts](../src/config/display.ts) owns `maxFps`, `resolutionScale` and
`resolutionScaleMode`. Without a host or player choice the resolution scale is **fixed**
at the quality preset's step (`presetResolutionScales`; the runtime reads
`performance.preset`):

| Quality preset (`quality=`) | Default scale (fixed) |
| --------------------------- | --------------------- |
| `ultra` — Ultra             | 100%                  |
| `high` — Alta               | 90%                   |
| `balanced` — Equilibrada    | 80%                   |
| `low` — Baja                | 50%                   |
| `mobile` — Móvil            | 45%                   |
| `minimal` — Mínima          | 40%                   |
| `custom` — Predeterminada   | 80%                   |

Passing an explicit `resolutionScale` (for example
`display: { maxFps: 60, resolutionScale: 0.75 }`) fixes that scale instead (**manual**,
0.25..1). **Auto** stays available: `display: { resolutionScaleMode: 'auto' }` starts at 50%
and adapts within 0.5..1 by frame budget. Call `runtime.setDisplay({ maxFps: 30 })` during
play, or `setDisplay({ resolutionScaleMode: 'auto' })` to switch to adaptation. The auto controller,
the ~3 s boot probe, the skinnable splash and the attract boot view are documented in
[Boot, splash and dynamic resolution](boot-and-splash.md). A cap of zero follows
browser cadence; positive caps are integers from 30 to 360. The automatic loop
retains real timestamps, carries fractional scheduling remainder and does not
produce catch-up render bursts after a stall. Physics still uses fixed steps.
Manual-clock hosts control their own frame submission and do not use this cap.

Scaling multiplies the selected quality profile's effective device pixel ratio.
At scale 1 the profile is unchanged; 0.5 renders half its width and height.
Changing FPS does not recreate render targets. The demo exposes these live
controls under **Rendimiento**, preserving them in `fps` and `scale`
URL parameters. Changing its quality preset explicitly reloads the demo.

Synchronization is managed by the browser through
[requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame).
There is no exposed native swap-chain/VSync-off control in this WebGL host; zero
does not promise uncapped rendering beyond the browser/display cadence.

The renderer offers standard resolution scaling only (the **Escala de
resolución** control and `resolutionScale`); there is no upscaling or
reconstruction backend, and the settings UI does not advertise one.

## Scope and precedence

Global source defaults require rebuilding Engine and updating the consumer's
package. Importing a defaults object does not change a live runtime. Camera,
performance and field-light options are per-instance overrides; physics/control
defaults are intentionally build-time values in this change. Physics tuning must
be consistent between gravity, boats, flight and wheeled vehicles.

The standalone browser game has an explicit `browserPerformanceDefaults` profile.
Its precedence is browser defaults, then a selected named preset, then explicit
host overrides. `normalizePerformance` accepts the quality choices listed in its
topic file; unsupported choices fall back to defaults. Existing runtime and
shadow-tier imports re-export the same definitions for compatibility.

Authored content remains in its existing topic files rather than being copied
into a competing global table:

- Vehicle definitions and validation: [vehicle fields](../src/entity/vehicle/field.ts).
  Each vehicle stores its own mass, suspension, engine/brake force, seats and
  camera distance. Stock vehicle recipes live under `assets/library`; changing
  camera defaults does not overwrite a vehicle's authored camera distance.
- Scene sky/water and geography: [scene document](../src/scene/document.ts),
  [sky clock](../src/planet/sky.ts) and [water model](../src/runtime/water.ts).
- Terrain sources and offline coverage: `GameRuntimeOptions.tiles` and
  [PlanetSourceOptions](../src/render/planet/world.ts).
- Lights, portals, roads and terrain content: the corresponding `field.ts`
  schemas under `src/entity`, exposed through the public scene API.

This catalog centralizes the settings listed above. It is not a claim that every
numeric literal in the legacy engine has been audited or made configurable.
Algorithmic tolerances, geometry topology, schema versions and unit conversions
are implementation contracts, not application preferences. Additional tunable
policies found during review should move into their topic file without changing
their behavior or duplicating authored content.

## Maintenance

### Road vehicles and trailer couplings

`roadVehicleDefaults` in `src/config/simulation.ts` owns the direction-change and
gear-shift defaults, idle RPM and trailer coupling limits. These are build-time
defaults; a vehicle's `powertrain.shift` block (schema in `src/entity/vehicle/field.ts`,
type `GearboxTuning`) overrides them per recipe.

**Idle.** Cars idle at `roadVehicleDefaults.idleRpm` = 1,000 RPM (S3, A3, procedural cars; it
was 900): the rev counter rests on 1,000 at a standstill. A recipe's `powertrain.idleRpm`
overrides it; the stock truck idles at 750 RPM (was 650), a usual heavy-diesel idle. The engine
note (`engineNoteHz` in `src/audio/powertrain.ts`) is a sawtooth at rpm / 24 through a lowpass
at 260 + 0.14 x rpm Hz (+700 Hz at full load): 1,000 RPM idle = 41.7 Hz with a 400 Hz cutoff,
which sounds like an engine at low revs rather than the previous sub-bass rumble (rpm / 30 with a
30 Hz floor and a 180 + 0.1 x rpm cutoff, i.e. 30 Hz / 270 Hz at the old 900 RPM idle). The
truck's 750 RPM idle sits at 31.3 Hz. The engine-start voice ends its catch on that idle pitch
(`EngineStartSound.idleRpm`), so the start hands over to the idle note without a jump.

**D/R changes brake first.** The opposite pedal never engages the other direction
while the vehicle is rolling: the wheels brake until the speed is below
`directionChangeSpeed` (0.5 m/s), the vehicle stays planted for `directionChangeSeconds`
(0.3 s, previously a 1 s timer that also started at 0.8 m/s), then the gear flips, a
gear clack is counted and torque stays cut for `directionShiftSeconds` (0.15 s).
Releasing the pedal or rolling again restarts the dwell. Coasting retains the selected
direction.

**Gear changes.** `shift.seconds` (torque cut, default 0.12 s), `cooldownSeconds`,
`upshiftRpm`/`downshiftRpm` (default 92.8 % and one third of `maxRpm`),
`torqueFraction`, `rpmResponse` (engine inertia, 1/s) and `launchRpm` are per recipe.
Every automatic change, manual change and D/R engagement increments the drivetrain
`shiftCount` (`vehicleInfo(id).gearShifts`). Only the audible ones, D/R engagement and
manual paddle shifts, increment `clackCount` (`vehicleInfo(id).gearClacks`);
automatic up/down shifts are silent. `VehicleEffects.updateAudio` plays one
`VehicleAudio.gearChange(profile)` per `gearClacks` increase.
The clack is synthesized (no sample file): two impacts plus an optional air release,
shaped by `shift.clack` (`clunkHz`, `clickHz`, `gain`, `decaySeconds`, `echoSeconds`,
`airSeconds`). Omitted fields give the light car clack.

**Neutral and park.** Stopped (below 0.5 m/s) with the handbrake (Space) on and no pedal
pressed, D/R drops to N after `shift.neutralSeconds` (default 0.4 s, truck 0.8 s), and N to P
after a further `shift.parkSeconds` (default 1.5 s, truck 2.5 s); reaching P is audible (one
clack) and the brakes then hold the vehicle. Releasing the handbrake never returns to D or R:
only W (D) or S (R) leaves N/P, through the usual dwell (`directionSeconds`) and a clack.
From N, W while already rolling forward engages a gear that suits the speed immediately;
S while rolling still brakes to a stop first. `vehicleInfo(id).parked` is true in P (gear 0);
displays use `gearLabel(gear, manual, parked)`: `R`, `N`, `P`, `D<n>`, `M<n>`.

**Park on entering, then start-up.** Every road vehicle (car, S3, A3, truck, procedural car,
host-spawned vehicle) spawns in P, and every way into the driver's seat selects P again: E,
`startInVehicle` (scenario/host spawn in the seat, `?vehicle=`) and `transferControls`. The
sequence is then:

1. **P and held.** Gear 0, parked, automatic mode, pending D/R requests cleared
   (`engagePark`). The HUD and cluster show `P`.
2. **Cranking** (`ignitionCrankSeconds`, 0.6 s): a short synthesized starter sound plays
   (`VehicleAudio.engineStart`, no sample file) and the engine turns at a pulsing starter speed
   around `crankingRpm` (250). The engine note is silent and the needles are still.
3. **Needle sweep** (`ignitionSweepSeconds`, 1 s): the engine has caught at `ignitionFlare` x
   idle (1.6); its normal sound fades in and settles to idle while every needle of the vehicle's
   cluster rises smoothly (cosine easing) from its live reading to full scale, holds briefly and
   falls back, like a real instrument self-test. `vehicleInfo(id).gaugeSweep` (0..1) drives it;
   digital readouts and the gear letter keep their real values.
4. **Running.** Idle, still in P; W selects D and S selects R as usual. The lights, off until
   now, switch to position lights (`GameRuntimeOptions.startLights`, default `'position'`; see
   [Vehicle lights](controls.md#vehicle-lights)).

The whole sequence takes 1.6 s. `vehicleInfo(id).ignition` reports `cranking`, `sweep` or
`running`; `ignitionCount` increases once per start. **Input during the start-up is not lost, only deferred:** the vehicle stays in P
and the pedals deliver no torque until the sequence ends; a pedal still held at that moment then
engages D/R through the normal dwell. Paddle shifts are refused in P, as always. Hosts that want
P without the sequence pass `new Simulation(doc, { ignition: false })`. Boats, planes and
flight-capable vehicles (no gear selector) keep their previous behaviour.

**P really holds.** In P the full service brake is applied to every wheel, occupied or not
(an unoccupied vehicle left in D/R keeps the light 0.4 x drag brake). The Rapier vehicle brake
cancels wheel velocity before gravity is integrated, so a braked car on a slope still crept
downhill by g x sin(slope) x dt every step (about 2.5 cm/s on 10 degrees). P therefore also acts
as a parking pawl: a stiff damped spring on the distance crept since P engaged
(`parkHoldStiffness` 400 1/s², `parkHoldDamping` 40 1/s, per unit mass, along the vehicle's
forward axis, relative to the supporting body), limited to `parkHoldFriction` 0.8 x g (about a
38 degree slope) and released above `parkHoldSlipSpeed` (1.5 m/s, e.g. rammed).

The stock truck recipe defines its own diesel gearing, 750 RPM idle, 2,400 RPM
ceiling and 120 km/h forward speed limit, plus a slow heavy gearbox: 0.55 s torque cut,
shifts at 1,950/1,000 RPM, a heavier flywheel, a 60 kN wheel-force limit and a low,
long clack with air release. Passive trailers use wheel rolling
resistance instead of artificial body damping. Engine audio follows the piloted
road vehicle, including vehicles without an explicit powertrain recipe.

Connected tractor/trailer bodies collide and articulation is limited to 65 degrees
in either direction. While the piloted tractor pushes in reverse, horizontal
trailer contact impulses approximate coupling load: 45 kN sustained for 0.12 s
or a 250 kN impact releases the joint. Ground-support contacts are excluded.
This is a gameplay approximation, not a measured joint stress model. The trailer
remains a physical body and its unsupported front drops when the tractor leaves;
the broken tow link is cleared so recovery cannot silently reconnect it.

Compound-body inertia includes collider rotation and offset about the authored
chassis origin, using a diagonal approximation. Vehicle masses remain authored
in their recipes. Regression tests cover delayed direction changes, the loaded
truck reaching 120 km/h, normal reversing, overload detachment and a car impact.

Keep one owner for each setting. Document its units, supported range, precedence
and lifetime. Preserve existing values during extraction. Add a behavioral test
when changing a setting's meaning, and regenerate the reference with
`npm run docs:generate`; `npm run docs:check` rejects stale documentation.

For weak machines, start with `performance: { preset: 'mobile' }`; `minimal` lowers
the pixel-ratio cap further to 0.35 while retaining the same conservative collision
coverage. See the [measured comparison](architecture/performance-review-2026-10-04.md).

## Runtime language and shared Play UI

`GameRuntime` from `/runtime/browser` accepts `locale: 'en' | 'es'` and an optional
`messages` dictionary keyed by English templates. English is the fallback. Language
is per instance; no singleton changes another host. `createRuntimeText` is also
available from `/runtime` for custom HUDs. Templates use `{0}`, `{1}`, etc. for
values. Touch controls, camera notices, equipment menus, monitors and the gallery
use the resolver. Authored entity names and lower-level simulation diagnostics
remain authored data, not automatic translations.

`hud: true` mounts the shared gameplay HUD. `touchControls` selects the Studio
drive rig (`auto` on coarse pointers, `always`, `hidden`, or `false`): wheel,
accelerator, red handbrake and turbo, ported from agency-ui
`AgencyStageDriveRig.vue`. `acceptsInput` lets a host add its menu/panel focus
policy; Engine still owns keyboard, mouse, gamepad and touch bindings.
`releaseInput()` clears commands without disposing the session. The standalone
game hosts pass `always` so the rig stays available beside the keyboard and
gamepad.

Mouse sensitivity and map wheel zoom live in `controlDefaults`.
`controlDefaults.showPilotTouchRing` (default `false`) gates the cockpit circular
touch ring around the on-screen steering wheel; set it `true` (or pass `true` as
the `TouchDriving` constructor flag) to restore the Studio twist overlay without
bringing the deleted code back. F9 toggles the Engine wheel diagnostic overlay;
markers are allocated on demand for every axle.
