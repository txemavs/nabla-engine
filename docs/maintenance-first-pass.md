# Maintenance pass: compatibility and documentation

Reviewed on 2026-10-23. Documentation remains in English; the Spanish reading edition
is maintained separately. No public runtime API or scene schema is changed by this pass.

## Corrected contracts

- Engine ownership: headless scene/simulation versus browser renderer, input and storage.
- Time limits: session frame cap 0.1 s; simulation accepts eight fixed steps and counts
  only its own dropped time.
- Relay: in-memory health, entity and claim state; reload validation and rate limit;
  health/death outcomes for reported hits; no server-side geometric hit validation.
- Atlas: the two checked cells publish a stable entry and a hash-named package.
  See [publication evidence and regression procedure](terrain-publication-contract.md).
- Scene compatibility: explicit stock URL migration is retained; it is not a general
  schema upgrader. Studio examples are not local files in this checkout.

## Current light authoring, compatible reading

`scripts/author-truck-rear-lights.mjs` now writes `nabla.light.<role>[.l|.r].<suffix>`
material names instead of `extras.vehicleLightChannel`. It removes that old material
field and the redundant material side after transferring their meaning to the name.
Unrelated extras are preserved. Node side metadata remains necessary for separating
trailer clusters. Re-running the authoring script preserves its output.

The regression test runs the authoring script on temporary copies of the shipped
tractor/trailer GLBs. It compares channels/sides, emissive colors, material count and
binary payload, then checks a second run produces identical bytes. Existing rendering
tests cover legacy extras and named materials. The runtime's legacy reader is retained.

**The shipped GLBs have not been rewritten.** Proposed next migration: audit tools
that select materials by their old names/extras, regenerate the truck assets, update
asset-specific test selectors and repack distributable assets together. Confirm lights
visually before publication. Retire the legacy reader only after auditing saved scenes,
third-party assets and supported package versions; current evidence does not justify removal.

## Other compatibility retained

| Compatibility                   | Consumer / reason                                | Removal requirement                                     |
| ------------------------------- | ------------------------------------------------ | ------------------------------------------------------- |
| Stock `/studio/` asset URLs     | `scene/asset-urls.ts`, invoked by scene parsing  | Explicit migration of stored documents                  |
| Legacy key names in actions     | `legacyInputAction`, runtime action APIs         | Migrate hosts to semantic action IDs                    |
| Old weapon poses                | Browser preference fallback                      | Version and migrate saved preferences                   |
| CPU particle path               | Active rendering fallback                        | Backend parity before retirement                        |
| Generic `manifest.json` entries | Local generators and observed Atlas publications | Publisher/consumer migration, not filename substitution |

## Verification scope

Run the focused terrain suite from the publication guide, plus:

```sh
npx vitest run test/render/truck-light-authoring.test.ts test/render/asset-light-targets.test.ts test/render/start-lights.test.ts test/render/vehicle-light-controller.test.ts test/scene/asset-urls.test.ts
node --test services/relay/server.test.mjs
node scripts/check-manual.mjs
```

Install the relay's own locked dependencies with `npm ci --prefix services/relay`
before its tests. This pass completed 87 focused Vitest tests and 8 relay tests;
the manual checker passed for 26 chapters, 357 local links and 66 public entry points.
A scoped TypeScript check of the two new regression files and their imports passed
with Node and Vite types. The global typecheck could not complete for the reason below.
The Spanish PDF was regenerated and checked for page bounds, navigation and layout.

The Git index reported `bad signature 0x00000000` / `index file corrupt` at the start
of this pass. It was not rebuilt: doing so could lose staging information. File-level
checks and tests remain usable; normal Git status/diff/staging require separate repair
with a backup of the index and preservation of working files.

The global typecheck is also blocked: `game/drive.ts`, untouched by this pass, contains
18,957 NUL bytes and no source text. Recover its latest working content from a verified
backup or editor history before rebuilding; blindly restoring HEAD could lose uncommitted
work. This pass does not replace it.
