# Entity

One node's schema and the checks for each kind. Capabilities come from current
components, so imported scenes need no flag migration.

**Owns:** field schemas, capability vocabulary, portal/vehicle/road/terrain/source
contracts.
**Does not own:** the document, the transform graph, meshes on screen.

`entityCapabilities(entity)` is the public capability API. The vocabulary is
`transform`, `appearance`, `clone`, `solid-edit`, `drive`, `fly`, `interior`,
`dock`, `portal`, `sprite` and `light`. Adding a word to a list does not create
physics or a renderer. Agency adapters can expose this list; this folder does not
implement Agency's registry.

Stock factories live in [`src/catalog`](../catalog/README.md). Portal mouths:
[`portal/`](portal/README.md). Vehicle fields: `vehicle/`.

- Tests: `test/scene`, `test/portal`
- Architecture: [invariants](../../docs/architecture.md)
