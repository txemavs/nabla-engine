# Appendix D. Practical recipes

[Manual contents](README.md)

Run the following from the repository root after `npm ci` and `npm run build`.
The examples use public package imports. Their assertions check functional
contracts, not production performance or remote-service availability.

| Goal                               | Command or file                                 | Expected result                                                            |
| ---------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- |
| Build a valid authored scene       | [scene.mjs](../../examples/manual/scene.mjs)    | Factory returns a validated floor, spawn, and car                          |
| Drive and manage session lifetime  | `node examples/manual/session.mjs`              | Car moves, pause/resume works, document stays unchanged, cleanup completes |
| Check data and authority contracts | `node examples/manual/contracts.mjs`            | Invalid scene rejected, geography parsed, item granted once                |
| Mount a browser game               | [browser.ts](../../examples/manual/browser.ts)  | Host integration module returning a cleanup function                       |
| Typecheck the browser integration  | `npx tsc -p examples/manual/tsconfig.json`      | No type errors against built public declarations                           |
| Drive a stock vehicle headlessly   | `node examples/modularity/headless-vehicle.mjs` | Ignition and acceleration assertions pass                                  |
| Create a procedural vehicle        | `node examples/modularity/custom-prefab.mjs`    | Custom car drives                                                          |
| Own a wheeled runtime directly     | `node examples/modularity/wheeled-runtime.mjs`  | Shared-world standalone vehicle checks pass                                |
| Compose boat and flight runtimes   | `node examples/modularity/boat-flight.mjs`      | Independent hull/flight behavior checks pass                               |
| Use menus without a renderer       | `node examples/modularity/menu-only.mjs`        | Navigation/action checks pass                                              |

## Recipe: add a dynamic crate

In `createManualScene`, create another `box` before calling `parseScene`, give it
a unique ID, set `motion` to `dynamic`, set mass and size, and position it above the
floor. Append it to `entities`. Run the session example and inspect its physical
pose through the simulation API; verify the authored position remains unchanged.
This teaches the distinction between saved data and runtime state.

## Recipe: start on foot

In the browser module, replace `runtime.play({ vehicleId: 'manual-car' })` with
`runtime.play()`. The existing spawn becomes the starting point. Keep the floor
and geography. A browser runtime requires geography even when it has no terrain
provider; removing `tiles` and removing `geography` are different operations.

## Recipe: investigate a missing cell

Read the exact failed URL and status. Check the `/tiles/z/…` path and the publication's
actual hashed filename. For Atlas, interpret missing-object 403 according to
`AGENTS.md`. Then check whether the response schema matches the consumer path.
The verified cells publish `manifest.json`; follow its exact package pointer.
Do not guess a hash, invent an index endpoint or treat absence as an authentication issue.
Chapter 10 links captured publication metadata and its regression tests.

## Recipe: add a public export

Add the implementation and declaration-producing build input, expose the subpath
in `package.json`, and create an independent public-import example. Regenerate
appendix A with `node scripts/check-manual.mjs --write-reference`, then run the
manual checker, build, and consumer example. Before release, run the existing
installed-package checker. Update the behavioral chapter as well as the generated
inventory; an export list alone does not explain its lifecycle.
