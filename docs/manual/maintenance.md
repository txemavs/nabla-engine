# Manual maintenance and evidence

[Manual contents](README.md)

## Editorial contract

Write this manual in English. Keep chapter names stable so links remain useful to
people and agents. Explain purpose, usage, ownership, failure behavior, and cleanup.
Link to canonical source paths rather than line numbers that drift. Identify
internal implementation paths separately from public imports. Put complete runnable
examples in `examples/manual/` and link to them instead of duplicating long programs.

The first source review used the 2026-10-23 working tree based on
`7015b8c25a083c8fa22e2d608d395ad74540e16c`, package 0.3.9. Existing uncommitted runtime
and reference-game changes were included in inspection. This is a provenance note,
not a claim that all statements were tested on every platform.

## Update procedure

1. Read `AGENTS.md`, inspect the diff, and identify the state owner being changed.
2. Read the implementation and its relevant tests. Resolve contradictions by
   distinguishing intended operational contracts from implemented behavior.
3. Update the affected chapter and configuration/format/recipe appendices.
4. Update an executable example if the public contract changes. Prefer public imports.
5. If package exports change, run `node scripts/check-manual.mjs --write-reference`.
6. Run `node scripts/check-manual.mjs`, the example checks in appendix D, and scoped
   formatting. Run broader repository checks appropriate to the implementation change.
7. Record actual validation and remaining limitations below; do not infer browser,
   headset, live-service, or performance results from compilation.

## Change-to-document map

| Changed area                      | Review chapters                  |
| --------------------------------- | -------------------------------- |
| Package exports or build          | 2, 4, 25, 26, appendix A         |
| Scene/entity schemas              | 3, 7, 8, appendix C, examples    |
| Runtime/session/worker behavior   | 5, 6, 9, 24                      |
| Terrain loader/publisher contract | 10, 24, 26, appendices C/E       |
| Vehicle schema/runtime/rigs       | 11–13, 18                        |
| Character/weapons/authority       | 14, 15, 22                       |
| Rendering/audio/UI/XR             | 17–21, appendix B                |
| Diagnostics/tests                 | 24, 25, this verification record |

## Reconciled discrepancies (2026-10-23)

The [first maintenance pass](../maintenance-first-pass.md) corrected architecture
ownership and time limits, relay state/reload semantics, the stock-URL migration
exception and the stale local Studio example link.

Live Atlas responses contradicted the earlier hash-only description: both checked
cells publish `manifest.json` and a hash-named package. Recorded fixtures pass the
current consumer. See the [terrain contract](../terrain-publication-contract.md)
for evidence, compatibility limits and repeatable checks. The Vite comment no
longer presents User-Agent as a cure for missing-object 403 responses.

The flat scene/flat tile distinction remains intentional: `createFlatTestScene`
is geographic fixture data with a nonphysical circuit visual, not the colliding
box floor in the manual example. Historical design proposals are not API contracts.

A wording edit does not certify runtime behavior. Keep dated fixtures and tests
alongside changes to published contracts.

## Verification record

Authoring validation on **2026-10-23**, using Node.js **24.22.0** on Windows:

| Check                                                    | Observed result                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                                          | Passed; public JavaScript and declarations produced                                                                              |
| `node examples/manual/session.mjs`                       | Passed; car reached approximately 24.98 km/h, pause preserved its pose, authored data remained unchanged, disposal checks passed |
| `node examples/manual/contracts.mjs`                     | Passed; scene rejection, coordinate parsing, selected physics defaults, and single pickup ownership                              |
| `npx tsc -p examples/manual/tsconfig.json`               | Passed; browser example checked against public declarations                                                                      |
| Five `examples/modularity` programs listed in appendix D | Passed: headless vehicle, custom prefab, wheeled runtime, boat/flight, and menu                                                  |
| `node scripts/check-manual.mjs`                          | Passed; 26 chapters, 35 checked Markdown files, 363 local links, 66 public entry points at this pass                             |
| `npm run docs:check`                                     | Passed; existing generated reference reported 625 modules and 7,936 functions                                                    |
| Scoped Prettier check                                    | Passed for manual pages, manual examples, and the checker                                                                        |

Rapier emitted its existing initialization deprecation warning during physical
examples; the assertions and process exits still passed. The speed above is a
functional observation from this run, not a performance benchmark or a vehicle
calibration target.

Source inspection covers the cited implementation and public entry points. No live
Atlas publication, headset, rendered browser session, or performance benchmark was
run for this documentation task. The full gameplay suite and game deployment build
were not required to validate documentation-only changes. Existing and concurrently
updated working-tree implementation changes were preserved. No gameplay code was
changed by this manual task, so the development server was not restarted.

## Checker boundaries

`scripts/check-manual.mjs` checks all local Markdown links in this manual and its
example README, including heading fragments, expected chapter count, and the exact
generated export inventory. It checks source targets for generated export links.
It skips remote links and does not execute arbitrary prose examples.

The inventory is derived from `package.json`; run its generator rather than editing
appendix A by hand. The checker uses the repository's Prettier configuration so
regeneration and formatting agree. Manual semantics still require human or agent
review against changed source.

## Instance settings isolation — 2026-10-23

The second maintenance pass gives each browser runtime its own storage snapshot,
XR/calibration readers and live terrain/smoke/beam values. See
[settings ownership and host migration](20-interface.md#settings-ownership).
Existing PC/VR keys and migration readers are retained. Different namespaces make
persistence independent; the unnamed legacy profile remains last-writer-wins for
future instances. Page UI and mixed renderer backends remain separate integration
concerns.

Validation: package build, TypeScript, game build, generated reference check and
manual links pass. The full unit run reports 2,111 passing tests; its terrain-folder
suite is blocked by Windows symlink privileges (`EPERM` in setup, followed by its
cleanup error). The three added visual-owner tests also pass. Two Chromium browser
tests pass: simultaneous real runtimes with deferred XR, PC-to-VR scope switching,
independent destruction/recreation, and settings backup/import/reset. Chromium was
run through the installed Chrome executable because the downloaded Playwright
binary could not launch on this machine.

## PR integration and host compatibility — 2026-10-23

PRs #309 (health readout) and #310 (navigation lookup index) are integrated with
the settings migration. The complete working-tree check now passes, including
2,131 unit tests (14 skipped), package/type checks and the game build. The terrain
route test uses a directory junction on Windows and still checks realpath escape
protection. The network integration test waits for a received snapshot rather than
a fixed 30 ms delay. Relay tests: 27 passing. Four Chromium tests pass in each of
Engine and Euskadi, covering all saved profiles and simultaneous runtime isolation.
See [the host audit](../host-settings-compatibility.md) for release coordination.
