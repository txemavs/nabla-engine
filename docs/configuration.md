# Engine configuration by topic

Engine tuning lives in small, typed topic files under `src/config`. Import their
public entries from `@nabla/engine/config` or `@nabla/engine/config/<topic>`.
Values have English source comments describing units and behavior. These modules
contain data and small validation helpers; they do not create worlds or renderers.

| Topic              | Source                                         | Application mechanism                                                                                             |
| ------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Camera             | [camera.ts](../src/config/camera.ts)           | `GameRuntime({ camera: overrides })` in both shared and browser runtimes; independent settings per instance       |
| Controls           | [controls.ts](../src/config/controls.ts)       | Build-time defaults for mouse sensitivity, gamepad deadzone and keyboard steering                                 |
| Performance        | [performance.ts](../src/config/performance.ts) | Browser `performance` option; named presets and supported quality choices                                         |
| Shadows            | [shadows.ts](../src/config/shadows.ts)         | Quality keys select cascade count, map size, reach and bias                                                       |
| Lighting           | [lighting.ts](../src/config/lighting.ts)       | Browser fallback lights; geographic lights support `fieldLights.layers` and `fieldLights.look` overrides          |
| Terrain scheduling | [streaming.ts](../src/config/streaming.ts)     | Build-time sampling/install budgets and floating-origin distance; tile/cache limits remain in performance presets |
| Simulation         | [simulation.ts](../src/config/simulation.ts)   | Build-time fixed stepping, gravity, solver and player movement defaults                                           |

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
overhead view intentionally follows vehicle orientation. Replay retains overrides.

`createGameCameraState(overrides)` supports hosts that update cameras directly.
Camera overrides are validated before use. Durations must be finite and
non-negative; ordered ranges and positive divisors/FOV are checked. Do not mutate
the exported defaults. To change a running camera's settings, recreate its state
with `createGameCameraState` so telemetry and framing share the same settings.

## Display, synchronization and scaling

[display.ts](../src/config/display.ts) owns `maxFps` and `resolutionScale`.
Browser hosts can pass `display: { maxFps: 60, resolutionScale: 0.75 }` at creation,
or call `runtime.setDisplay({ maxFps: 30 })` during play. A cap of zero follows
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

The current renderer uses standard resolution scaling, not DLSS reconstruction.
[NVIDIA's supported integration](https://developer.nvidia.com/blog/how-to-integrate-nvidia-dlss-4-into-your-game-with-nvidia-streamline/)
uses native graphics APIs/Streamline. Nabla's WebGL renderer has no such backend;
an RTX card alone does not enable DLSS in it. A native rendering backend would be
a separate integration project. Temporal or spatial web upscaling is possible
future work, but is not implemented or advertised as DLSS here.

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

The stock truck recipe defines its own diesel gearing, 650 RPM idle, 2,400 RPM
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

Mouse sensitivity and map wheel zoom live in `controlDefaults`. F9 toggles the
Engine wheel diagnostic overlay; markers are allocated on demand for every axle.
