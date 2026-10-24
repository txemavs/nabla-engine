# Host settings compatibility audit

Reviewed on 2026-10-23. Scope: this Engine checkout, its reference game and examples,
and the adjacent Euskadi host sources plus their `engine/` working copy. This is a
local integration audit, not a claim about every deployed Engine consumer.

## Migrated consumers

- Reference game: boot resolvers use `pageSettingsStorage()`; runtime-bound controls,
  backup/import/reset, XR, model adjustments and quality writes use `runtime.settings`.
  Desktop, standalone headset, PC headset, AR and scenario pages share these modules.
- Euskadi's Engine working copy: the isolated settings migration was applied as a
  contextual patch, retaining unrelated local changes. Package build and typecheck pass.
- Euskadi municipal signs: `irunSignSettingsStorage(runtime)` uses the runtime store.
  Its fallback supports the previously pinned Engine, which has no `settings` property.
  This fallback reads only the unchanged, historically unscoped `euskadi.irun-signs`
  key. It does not depend on the old `nabla.*` Storage patch.
- Vehicle light calibration: runtime and SceneView now inject the same store into
  `readVehicleLights`/`writeVehicleLights`. Calibration caches are scoped to that store
  and refresh when its saved value changes, including a play-mode change. Existing
  `nabla.vehicle-lights.<model>` PC and VR keys retain their meaning.

`field-lights.ts` still uses native storage for `nabla-lamps-z15:` geographic cache
entries. That prefix never matched `nabla.` and is not a player setting. Standalone
light-calibration helpers retain their legacy default; multi-instance hosts pass the
owner's store explicitly. Euskadi's scenario launcher uses sessionStorage for its
one-shot menu flag, also outside the removed patch. No examples needed migration.

## Preservation checks

[Browser regressions](../test/browser/e2e/host-settings-compatibility.spec.ts) seed
physical keys from the old implementation, run the real host boot adapters and a
browser GameRuntime, then check all three profiles. They verify FOV, quality, smoke,
XR quality, unchanged native Storage methods, unchanged existing values at boot and
writes only to the selected profile. The same tests run in Euskadi's Engine copy.
[Light calibration tests](../test/render/vehicle-light-tuning.test.ts) check saved
PC/VR calibration, independent writes, reset and switching profiles.

Validation results:

- Four Chromium tests pass in each checkout: three saved-profile cases and two-runtime
  coexistence/disposal/recreation.
- Euskadi: 44 selected unit tests pass, including its legacy-host fallback, XR
  calibration migration, quality, terrain entry and visual ownership.
- Engine package build and generated-reference checks pass.
- Euskadi package build, full typecheck and Vite build with `vite.euskadi.config.ts` pass.
- The primary checkout passes the complete `npm run check`: rigs, generated reference,
  formatting, package build, typecheck, 2,131 unit tests and the game build (14 skipped).
  Networking tests use the explicit world-frame argument. The real-relay regression
  waits for an applied snapshot instead of assuming delivery within 30 ms.
- Euskadi dev server is running at port 8707 using its existing Vite configuration
  and same-origin `/tiles` route; no HTTPS certificate was configured in this local copy.

The Euskadi `game/drive.ts` copy contained 18,957 null bytes before migration. The
original was preserved in the primary checkout's ignored
`local-backup/euskadi-before-settings/game/drive.ts`, then reconstructed from the
previously recovered valid baseline before applying settings changes.

## Release coordination

Remote main at `0e9a00cd` is integrated: PR #309 adds a health readout and PR #310
optimizes navigation lookup. The drive host retains both `healthDisplay` and its
local music option. Both PRs are also applied to Euskadi's local Engine copy.

Euskadi's `ENGINE_REF` must name the resulting settings integration commit. The pin
is recorded in the host after committing, so this document does not embed its own
commit hash. Until that commit is published, use `ENGINE_SOURCE` with the validated
local Engine source; a remote builder cannot fetch a local-only commit. Preserve the
host overlay when updating its Engine checkout. The signs adapter remains compatible
with the previous pin, `7015b8c25a083c8fa22e2d608d395ad74540e16c`.

## Game page module naming

The reference game entry formerly named `game/drive.ts` is now
[`game/game-page.ts`](../game/game-page.ts). `game/main.ts` selects this module; the
terrain and XR entry routes remain unchanged. Historical recovery/backup paths above
retain their original names.

The host contract remains `game/drive-host.ts`, including `setDriveHost`, `driveHost`
and its global symbol. The adjacent Euskadi host sources register through that contract
and do not import the old page module directly. The rename requires no host configuration
or `ENGINE_REF` changes in this commit.

Validation for the rename: Engine checks and PC/HeadSet browser compatibility tests;
an isolated overlay of the adjacent Euskadi host also passes its HeadSet configuration
check and Vite production build with the new game-page module. The host checkout and
its pinned Engine revision are not modified.

## Host preferences contract (2026-10-24)

The earlier migration/release sections are historical evidence. Engine PR #315 and
Euskadi PR #51 supersede the hardcoded municipal-sign key: the engine no longer knows
`euskadi.irun-signs`. Euskadi registers that unchanged key before runtime creation
from both terrain and drive host entry modules, preserving existing saved values.

For ordinary host preferences, use the public package entry:

```ts
import { registerPreferenceKey } from '@nabla/engine/runtime/settings-backup'
registerPreferenceKey('my-host.preferences')
```

This adds a key to backup/import/reset eligibility; it does not create a storage adapter
or namespace. Keys must match the validated `<namespace>.<name>` form; `nabla.` is
reserved and invalid keys throw `RangeError`. Repeated registration is harmless.

Traffic-sign integration uses `setTrafficSignsStorageKey(key)` from
`src/runtime/traffic-signs-host.ts` (internal source module, not a public package
subpath). It registers the key and selects it for the settings section and initial
scenery physics radius. The legacy default is captured when the runtime settings store is constructed. The section also
requires `data-irun-signs="true"`. Euskadi's source overlay imports this module directly.

New hosts should pass `settings: { trafficSignsStorageKey: 'my-host.signs' }` to
GameRuntime, or null to disable the selection. Each SettingsStore captures its own
readonly key, used by both the HUD and scenery physics. Omission captures the legacy
page default at construction; later default changes do not affect existing runtimes.
Saved keys are not renamed. The host-key allowlist remains module-global; registering
backup eligibility does not grant another runtime ownership of live values.

Engine PR #311 also moves place-label ownership to the host. The runtime no longer
requests `NavigationPlaceLookup` every frame. Hosts may use that exported helper and
`TouchDriving.setPlace`; the engine otherwise leaves the place label empty. Lookup
weights distance by settlement reach (city 6 km, town 3 km, village 1.5 km, unclassified
2 km), not administrative boundary polygons.

Regression evidence: `test/runtime/settings-backup.test.ts`,
`test/runtime/traffic-signs-host.test.ts`,
`test/presentation/navigation-places.test.ts` and the settings HUD browser test.
