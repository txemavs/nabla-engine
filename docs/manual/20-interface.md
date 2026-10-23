# 20. Interface, settings, and languages

[Manual contents](README.md)

The interface combines browser HUD elements, reference-game settings panels, and
monitors displayed inside the world. The reusable engine supplies shared UI
composition and messages; the application host supplies product-specific content
and layout integration.

## Menus and monitors

`MonitorMenu` is usable without a vehicle or renderer. The existing example exercises
submenu navigation and action delivery:

```sh
npm run build
node examples/modularity/menu-only.mjs
```

A menu action describes intent; the host applies it to the relevant state owner.
Layered and HTML monitor implementations provide display options for different
contexts. Keep telemetry read-only and route user changes through the runtime or
application action rather than mutating arbitrary renderer objects.

## Settings ownership

Settings can come from authored scene data, engine defaults, runtime options,
host defaults, and saved user choices. There is no single universal precedence
rule for every field: inspect its resolver and storage reader. Some changes apply
live; others, such as an asset-quality selection, require a new runtime.

Each browser `GameRuntime` owns `runtime.settings`. It snapshots existing browser
preferences when constructed; subsequent writes update only that runtime's view
and its persistence target. Deferred XR readers, calibration, USB bindings, actor,
audio, weapon and camera preferences use that same owner. Terrain layers, asphalt
uniforms, ground-photo filtering, smoke density and beam masks are also owned by
the runtime, including tiles and effects created later.

```ts
const left = new GameRuntime({
  canvas: leftCanvas,
  scene,
  settings: { mode: 'pc', namespace: 'left' },
})
const right = new GameRuntime({
  canvas: rightCanvas,
  scene,
  settings: { mode: 'headset-pc', namespace: 'right' },
})
left.setCameraFovOffset(20) // right is unchanged
left.settings.setItem('nabla.myHostPreference', 'enabled')
```

Omit `namespace` to preserve the existing persistence location: PC keeps `nabla.*`;
VR uses `nabla.settings.headset.*` or `nabla.settings.headset-pc.*`. Existing saved
values win over host VR defaults, which win over engine defaults. The existing
`nabla.modeSeeded` marker and XR calibration migrations remain in use. No saved
preferences are deleted or rewritten into a new format on upgrade.

Two runtimes without a namespace have independent live values but share a saved
profile: the last write is what a future runtime restores. Give them different
namespaces for independent persistence. Named instances inherit missing values
from the legacy mode profile and write to
`nabla.settings.instances.<encoded-name>.<mode-key>`. Removing an override lets a
future instance inherit the legacy value again. Use `storage: null` for a session
with no persistence. A host can inject a `SettingsStorage`; implement `length` and
`key(index)` for a complete construction-time snapshot. Minimal adapters without
enumeration cache each key on its first read. Storage errors retain session values.

### Host migration

`installSettingsScope(mode)` now selects a default for **future** runtime stores
and the single-page host adapter; it never patches native `Storage` methods.
Existing keys and its return value remain compatible. Hosts that previously
called raw `localStorage` after installation must use `pageSettingsStorage()` for
boot-time reads and `runtime.settings` in runtime-bound controls. The reference
game has been migrated. Raw `localStorage` always addresses physical keys again.
Keep page URLs, reload actions, session overrides and document-wide HUD panels
under one host; they are not per-instance UI APIs.

`runtime.settings.switchMode(mode)` explicitly moves only that owner's storage
view to another profile. It does not reload already applied camera or quality
settings. The reference game's VR button uses it after requesting the session in
the user gesture, preserving the previous PC-to-VR behavior without redirecting
other runtimes. Recreate the runtime to apply all startup settings of another mode.

If a `mirrors` or `steeringWheel` options section is supplied, omitted storage now
uses `runtime.settings`; explicitly pass `storage: null` to retain memory-only
model adjustments. Explicit custom stores remain host-owned overrides. Standalone
render helpers keep their legacy defaults; use runtime methods to adjust a running
runtime. Shared asset caches, page UI and backend-selection globals are separate
concerns: this change does not establish arbitrary mixed-backend embedding support.

[RuntimeStartCameraController](../../src/runtime/start-camera-controller.ts) coordinates
the initial vehicle camera sequence over the existing pure `StartCameraSequencer`.
It owns sequence progress and the host hold promise, preserving descent settling,
engine-start ordering, skip behavior and the `data-start-cameras` status. Replacing a
hold prevents the old promise from releasing the newer one; rejected holds still settle.
The runtime retains preparation, input, XR gating and simulation lifecycle. This
controller adds no preference keys. Coverage: `test/runtime/start-camera-controller.test.ts`
and `test/runtime/start-cameras.test.ts`.

[RuntimeLightingPreferences](../../src/runtime/lighting-preferences.ts) owns the saved
lighting values under the unchanged `nabla.lightTuning` key. It applies sun and ambient
multipliers immediately after the environment refreshes their base intensities, then
applies exposure, shadow intensity, reflections and paint at the existing frame stage.
Lights and scene views remain runtime-owned; newly created lights use the current values
on the next application. Public snapshots are copies, and quality-based shadow capability
remains separate from the saved shadow preference. Coverage lives in
`test/runtime/lighting-preferences.test.ts` and the two-runtime browser test.

[RuntimeWeaponPreferences](../../src/runtime/weapon-preferences.ts) owns sidearm tuning,
weapon-wheel comfort settings, muzzle-flash calibration and the per-weapon pose cache.
Existing `nabla.sidearmTuning`, `nabla.weaponWheel`, `nabla.muzzleFlash`,
`nabla.weaponPoses` and `nabla.weaponPoses.<id>` keys are unchanged. Saved per-weapon
poses override rig poses, which override legacy poses; provisional results are not
cached while the rig loads. Flash preferences now load after the runtime settings
store exists, fixing the previous field-initialization ordering that ignored saved
flash values. Combat, model loading and preview actions remain in their existing owners.
Tests: `test/runtime/weapon-preferences.test.ts` and the two-runtime browser test.

[RuntimeDisplayController](../../src/runtime/display-controller.ts) owns the runtime's
display settings and adaptive resolution state. It preserves preset defaults, explicit
manual scaling, auto-mode limits, FPS budgets and probe application. The runtime still
owns the GPU probe, frame loop, resize operations and host notifications. This controller
does not introduce storage keys: hosts continue to restore and save display preferences
through their existing controls. Regression coverage includes
`test/runtime/display-controller.test.ts`, `test/runtime/resolution-scale.test.ts` and
the two-runtime browser test.

[RuntimePlanetPreferences](../../src/runtime/planet-preferences.ts) owns the live
planet layers, clouds and solar flare preferences. It preserves `nabla.planetVisual`
and the existing startup order: valid saved preferences override the quality-selected
cloud style, then the host's `sea` option determines initial sea visibility. Startup
never saves those overrides. Numeric setters validate before changing state; changes update
only that runtime's sky and persist through its settings store. Snapshot methods
return copies. Rendering lifecycles, the sky clock and physical water remain separate.
Regression coverage: `test/runtime/planet-preferences.test.ts` and the two-runtime
browser test in `test/browser/e2e/runtime-settings.spec.ts`.

[RuntimeCameraPreferences](../../src/runtime/camera-preferences.ts) handles each runtime's
FOV offset and ActionCam/bodycam preferences. It uses the existing camera state and
ActionCam settings rather than duplicating live state. Camera options establish the base
FOV before the saved offset is applied; startup reads do not write preferences. The HUD,
menu and public setter share the same FOV normalization and persistence path. Existing
`nabla.cameraFov`, `nabla.actionCam`, `nabla.actionCamSettings` and `nabla.bodycam`
keys still go through the runtime's settings store, including legacy profile fallback.
Motion, bodycam reset, camera transitions and XR remain under their existing owners.
Regression coverage: `test/runtime/camera-preferences.test.ts` and
`test/browser/e2e/runtime-settings.spec.ts`.

Internally, [RuntimeVisualSettings](../../src/runtime/visual-settings.ts) owns the
terrain visual state, beam settings and shared smoke-density object for one runtime.
Current and later-created views receive the same objects. `GameRuntime` retains
its public methods, lifecycle checks, terrain refreshes and startup preference
precedence. Only explicit smoke edits persist through the supplied runtime store;
boot and quality overrides do not write preferences. The component creates no
listeners or GPU resources of its own; existing scene/view owners still dispose
their textures and effects. It has no dependency on the whole `GameRuntime`.

Regression evidence: [store contracts](../../test/settings-scope.test.ts),
[two browser runtimes](../../test/browser/e2e/runtime-settings.spec.ts), and
[XR calibration migrations](../../test/game/xr-calibration.test.ts).

For a new setting, document its owner, units, default, valid range, persistence key,
scope, and whether it requires reload. Test absent, invalid, and previously saved
values. Avoid creating an undocumented URL parameter as the sole product control;
existing source-selection and diagnostics parameters have specific roles.

## Language and accessibility

The engine includes English, Spanish, and Basque catalogs. Browser runtime options
include `locale` and message overrides; English is the fallback. Put user-facing
messages through that mechanism instead of scattering literal strings across
event handlers. Retain keyboard navigation, descriptive accessible control names,
and visible focus when adapting a HUD.

Use shared theme tokens and styles. The generated stylesheet has its own generator
and checks; edit source styles rather than hand-editing generated output. Preserve
the explicit CAM/FOV arrangement in `AGENTS.md` for Euskadi-related UI work.

## Source of truth

- [Messages](../../src/runtime/messages.ts) and [catalogs](../../src/i18n/index.ts).
- [Settings scope](../../src/runtime/settings-scope.ts).
- [Monitor menu](../../src/render/monitors/menu.ts).
- [Theme](../../src/ui/theme.ts) and [style source](../../src/ui/styles/index.css).
- [UI conventions](../ui-ux-pattern.md).

See the [host compatibility audit](../host-settings-compatibility.md) for the Euskadi migration, validation and release-pin requirements.
