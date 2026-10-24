# Appendix B. Configuration reference

[Manual contents](README.md)

Configuration is divided by owner and lifetime. The table points to canonical
definitions rather than duplicating hundreds of tuning fields. Inspect exported
types and normalizers before adding a user-facing setting.

| Area                              | Canonical source                                                | Application point                               |
| --------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- |
| Physics, gravity, player movement | [simulation.ts](../../src/config/simulation.ts)                 | Engine defaults and supported runtime overrides |
| Camera behavior                   | [camera.ts](../../src/config/camera.ts)                         | Runtime `camera` options and camera APIs        |
| Logical bindings                  | [input-bindings.ts](../../src/config/input-bindings.ts)         | Shared action mapping                           |
| Control tuning                    | [controls.ts](../../src/config/controls.ts)                     | Input and control consumers                     |
| Lighting                          | [lighting.ts](../../src/config/lighting.ts)                     | Environment/presentation                        |
| Vehicle appearance                | [vehicle-appearance.ts](../../src/config/vehicle-appearance.ts) | Shared material/presentation defaults           |
| Streaming                         | [streaming.ts](../../src/config/streaming.ts)                   | Terrain scheduling                              |
| Performance                       | [performance.ts](../../src/config/performance.ts)               | Budgets and presets                             |
| Display                           | [display.ts](../../src/config/display.ts)                       | Frame cap and resolution                        |
| Gameplay presentation             | [gameplay-tuning.ts](../../src/config/gameplay-tuning.ts)       | Weapons, cameras, and effects                   |
| Audio mix                         | [mixer.ts](../../src/audio/mixer.ts)                            | Runtime mix and persisted choices               |
| Device setting scope              | [settings-scope.ts](../../src/runtime/settings-scope.ts)        | Install before storage reads                    |

## Selected defaults at the review baseline

| Setting                               | Value    | Meaning                                   |
| ------------------------------------- | -------- | ----------------------------------------- |
| `simulationDefaults.fixedStepSeconds` | `1 / 60` | Fixed physics timestep, seconds           |
| `simulationDefaults.maxSubsteps`      | `8`      | Bound on catch-up ticks                   |
| `simulationDefaults.maxFrameSeconds`  | `0.1`    | Submitted frame-duration cap, seconds     |
| `simulationDefaults.gravity`          | `9.81`   | Acceleration, m/s²                        |
| `simulationDefaults.solverIterations` | `15`     | Rapier solver iterations                  |
| `defaultAudioMix.master`              | `1`      | Master gain                               |
| `defaultAudioMix.engine`              | `1`      | Engine-category gain                      |
| `defaultAudioMix.music`               | `0.3`    | Music gain                                |
| Renderer without explicit preference  | `webgl`  | Actual fallback may differ from a request |

The executable contracts example asserts selected physics defaults to make changes
visible during manual validation. Revisit their explanations when assertions change;
do not simply update expected numbers without reviewing implications.

## Browser runtime options worth knowing

`canvas` and `scene` are required. The browser implementation requires scene geography
even for offline content. Optional `tiles` activates geographic content loading;
geography alone does not. `startupTerrain` selects `spawn`, `nearby`, or `area`.
`hud`, `audio`, `locale`, `messages`, `touchControls`, and `acceptsInput` control
experience integration. `onProgress`, `onFrame`, `onDiagnostics`, `onMessage`, and
`onError` expose host observations.

`clock` selects automatic/manual scheduling. `display` controls frame/resolution
policy. `assetQuality` requires a new runtime. `backend` supplies a prepared renderer.
`music`, `startCameras`, and `startLights` configure presentation. Consult
[BrowserGameRuntimeOptions](../../src/runtime/browser.ts) for full types and individual
lifetimes; this table is not a substitute for its declarations.

## Environment and diagnostic parameters

| Name                                             | Owner and purpose                            |
| ------------------------------------------------ | -------------------------------------------- |
| `NABLA_HTTPS_CERT`, `NABLA_HTTPS_KEY`            | Vite local HTTPS file paths; supply together |
| `NABLA_TILES_UPSTREAM`                           | Vite terrain proxy upstream                  |
| `NABLA_STUDIO_UPSTREAM`, `NABLA_CACHE_UPSTREAM`  | Optional development service proxies         |
| `VITE_NABLA_TILES_URL`                           | Browser build's default terrain route        |
| `renderer=webgl/webgpu/auto`                     | Reference-host backend request               |
| `physicsWorker=0`                                | Diagnostic inline-physics comparison         |
| `loadingWorkers=0`                               | Diagnostic loading-worker comparison         |
| `diagnostics=1`, `perfLog=1`, `performanceLog=1` | Distinct host/runtime diagnostic paths       |

These settings are not all npm library options. Environment values are read by
their owning build/server code; URL parameters are parsed by specific host/runtime
paths. Do not assume arbitrary query parameters configure an installed module.
