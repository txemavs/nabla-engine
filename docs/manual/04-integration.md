# 4. Using the engine in another project

[Manual contents](README.md)

The public integration boundary is `package.json`'s `exports` map. A file existing
under `src/` does not make its path importable from an installed package. Appendix A
is generated from that map and links each entry to its implementation.

## Install a locally built package

```sh
npm run build
npm pack
```

Run those commands in the engine checkout. In the consuming project, install the
tarball path printed by npm, then import public subpaths. Use the actual output
filename rather than hard-coding the version in automation. `npm pack --dry-run`
inspects contents without creating the archive.

| Integration level          | Import                           | What the application supplies             |
| -------------------------- | -------------------------------- | ----------------------------------------- |
| Validated data             | `@nabla/engine/scene`            | Data and persistence                      |
| Headless session           | `@nabla/engine/runtime/session`  | Clock and logical input                   |
| Gameplay coordinator       | `@nabla/engine/runtime/core`     | Rendering, scheduling, device integration |
| Complete browser runtime   | `@nabla/engine/runtime/browser`  | Canvas, scene, options, host UI           |
| Standalone vehicle runtime | `@nabla/engine/vehicles/wheeled` | Shared physics world and stepping         |

Two modules export a class named `GameRuntime`: `runtime/core` re-exports the
coordinator in `runtime/game.ts`, while `runtime/browser` implements the complete
browser composition. They have different constructors and responsibilities. Preserve
the full import path when copying an example.

## Serve resources explicitly

Installing JavaScript does not publish its model, texture, sound, or worker URLs.
The reference Vite host uses `assets/` as its public directory. Another host must
provide equivalent URLs or configure the applicable resource recipes. Check the
network panel for failed resource requests before diagnosing model or shader logic.
Keep asset provenance with any redistributed content.

Worker bundling also belongs to integration verification. Test the production build,
not only Vite's development module resolution. The engine's
[package checker](../../scripts/check-package.mjs) runs independent examples against
an installed tarball and is useful for detecting accidental checkout-only imports.

## Reference-game composition

An application can also compose `game/` from a pinned checkout. The inspected host
hooks include `setTerrainHost` and `setDriveHost`; register them before the relevant
page entry runs. This is source-level composition, not a package export guarantee.
Keep regional coordinates, branding, room selection, and opening presentation in
the host. See [reference-game startup](../game-runtime.md) for that workflow.

## Source of truth

- [Public exports](../../package.json).
- [Core coordinator](../../src/runtime/game.ts).
- [Game page](../../game/game-page.ts): mounts the game scene, runtime, HUD and XR bindings.
- [Terrain hooks](../../game/terrain-host.ts) and [drive hooks](../../game/drive-host.ts).
- [Asset distribution](../asset-packs.md).
