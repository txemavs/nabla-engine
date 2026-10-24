# Menu settings audit

Reviewed 2026-10-24 against the current source. This is a backlog, not a list of newly implemented controls.

## Worth adding next

| Priority | Setting       | Current implementation                                                                  | Suggested home / constraint                                                                                         |
| -------- | ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 3        | Key rebinding | `game/settings-controls.ts` lists/searches bindings from `src/config/input-bindings.ts` | Controls → Keys. Currently a reference table, not a remapping UI; requires conflict handling and desktop/XR parity. |

## Implemented camera, keyboard and shadows

- Video → Options: automatic centering toggle, delay, recovery ramp and ordinary view-transition duration. Zero duration changes views instantly. Authored entrances and cinematic motion retain their own timing.
- Controls → Keyboard steering: rise and release/countersteer time constants. Smaller values respond faster. The filter runs before physics dispatch, so inline and worker simulations receive the same tuned input; analog steering is unchanged.
- Video → Shadows: profile default or an explicit sun-shadow tier, applied on reload. Labels show actual map size and cascade count: the historical 4096 tier is four 2048-pixel cascades, not a 4096-pixel map.
- Camera motion is saved in nabla.cameraMotion, keyboard response extends nabla.input, and the sun-shadow override uses nabla.sunShadowQuality. All use the runtime SettingsStore and participate in export/import/reset.

## Existing controls that are easy to miss

- Terrain load radius and memory cells now live in Video → Distances. Disk budget, clearing and missing-tile diagnostics remain in Cache. Existing storage and URL overrides are unchanged.
- Controls → Mouse and gamepad now exposes sensitivity (0.1–4×, default 1×), vertical inversion and standard-gamepad dead zone (0–50%, default 12%).
- Gamepad USB calibration already exists; do not add a second competing calibration screen.
- FOV, Bodycam, smoke/fire, lights/shadows, moon magnification and sky visibility already have controls; preserve their current owners and storage keys.
- Per-vehicle mirrors, lamps, reversing alarm and exhaust remain contextual under Main → current vehicle.

## Info implemented in this pass

Main → Info now adds active renderer, physics execution, session and settings mode, active quality profile, actual canvas buffer and CSS viewport/DPR, live resolution scale, configured FPS cap, FSR mode/sharpening, terrain counts and streaming budget, browser-reported logical processors/memory, secure context/isolation, WebXR API presence and visible gamepads. A copy button exports only these displayed diagnostics. It does not export settings, URLs, location, multiplayer tokens or cache contents.

Memory is explicitly approximate; FPS cap is not measured FPS; WebXR API presence is not session support. Browser online state is not relay connectivity. No GPU model, GPU memory or frame-time figures are invented. A subsequent performance panel should consume the engine frame telemetry rather than estimate FPS with another animation loop.

Internal worker timeouts, networking authority, terrain validity thresholds, collision tolerances, timestep limits and shader constants should remain implementation constraints, not user preferences.
