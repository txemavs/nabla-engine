# 23. Extending the engine

[Manual contents](README.md)

Choose an extension point by responsibility before writing code. A new vehicle
recipe, a presentation adapter, a simulation behavior, and a host-specific scenario
are different changes and should not all be implemented inside `GameRuntime`.

| Intended change              | Start here                                        |
| ---------------------------- | ------------------------------------------------- |
| New authored entity data     | Entity schema, validator, and factory             |
| New vehicle tuning/model     | Recipe, catalog, rig, and presentation adapter    |
| New physical behavior        | Simulation or standalone family runtime           |
| New visible effect           | Presentation and its resource lifecycle           |
| New device action            | Logical bindings and input/control profile        |
| Regional content or branding | Application host hooks                            |
| New public module            | Package export, declarations, independent example |

## A reviewable implementation sequence

First identify the existing owner and read its tests. State the behavior in terms
of a concrete action and observable result. Define the smallest necessary contract,
including units and cleanup. Implement the behavior in its owning layer, then
bind the host or presentation to it.

For a public API, add an example that imports only exported package paths. Compile
and run it against the built package; when publishing, run the installed-tarball
checker too. An import working through Vite source aliases is insufficient evidence
that consumers can use it.

For a data extension, reject malformed combinations at the boundary. Do not silently
reinterpret a saved scene's mass, wheel arrangement, or scale to match new defaults.
If migration is intentional, document and test its exact scope. The existing
stock-asset URL migration is a specific implementation, not a general permission
to rewrite authored content.

## Avoid accidental coupling

Keep simulation independent of browser objects. Keep application-specific coordinates
out of generic defaults. Dispose listeners and GPU/audio resources with the owner
that created them. Preserve one authoritative state owner for inventory, claims,
and physics. Prefer a configured adapter to a switch on display names.

The [procedural prefab](../../examples/modularity/custom-prefab.mjs) is a useful
extension example: it adds content through existing factories without modifying
the physics engine. If your feature can be expressed this way, avoid broadening the
engine contract unnecessarily.

Update the relevant manual chapter, configuration/format reference, and public
entry-point appendix when the extension changes them. Record any new experimental
status and the verification still required.

## Source of truth

- [Contribution rules](../../CONTRIBUTING.md).
- [Architecture checks](../../test/architecture).
- [Public exports](../../package.json).
- [Package integration checker](../../scripts/check-package.mjs).
