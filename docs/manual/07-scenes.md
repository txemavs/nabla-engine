# 7. Scenes, entities, and authored data

[Manual contents](README.md)

A `SceneDocument` is validated JSON, currently version 1. Its required fields are
`version`, `name`, and `entities`. Optional document fields describe cursor state,
geography, sky, and water. The normal parser limits the document to 20,000 entities;
an explicit experimental large-scene path exists and should not be treated as an
unlimited performance guarantee.

Entities have stable IDs, editable names, a parent reference, a rigid transform,
size, color, motion, and mass. The schema's kinds are `group`, `box`, `vehicle`,
`spawn`, `solid`, and `terrain`. Optional payloads such as `vehicle`, `visual`,
`portal`, `light`, or `geometry` describe capabilities. A kind and its payload
must satisfy validation together.

## Validation and identity

Call `parseScene(raw)` at import boundaries. It validates structure and relationships,
including duplicate IDs, missing parents, cycles, spawn requirements, transforms,
and kind-specific constraints. Do not bypass validation because JSON parsing
succeeded: syntactically valid JSON can still be an invalid scene.

The parser also calls `migrateStockAssetUrls`; consequently, an older blanket claim
that parsing performs no normalization is too strong. This targeted URL migration
does not imply general scene-version conversion or automatic retuning of content.

Use IDs for references and names for labels. Changing a name must not change physics.
Entity positions are relative to parents. Dynamic bodies and the spawn obey root
constraints; an arbitrary visual hierarchy is not automatically a supported
physical hierarchy. Size is explicit, not inherited transform scale.

## Editing and saving

`SceneGraph` resolves authored transforms. `SceneEditor` provides validated edits
and history. A failed transaction must leave the prior document usable. During
play, mutable poses belong to simulation; save the authored document unless the
application deliberately implements a “capture runtime state” operation.

The [shared example](../../examples/manual/scene.mjs) is a small factory returning
validated data. To add a crate, create a `box`, set `motion: 'dynamic'`, choose its
mass and size, append it before `parseScene`, and place it above the floor. To save
that authored scene, serialize the returned document with `JSON.stringify` in the
host's storage/export flow.

Geometry import, streamed map replacement, and interactive editing have different
internal paths. Do not use optimized internal map transactions as an unvalidated
external-file import API.

## Source of truth

- [Document schema and validation](../../src/scene/document.ts).
- [Entity schema and factory](../../src/entity/schema.ts).
- [Graph](../../src/scene/graph.ts) and [history](../../src/scene/history.ts).
- [Stock URL migration](../../src/scene/asset-urls.ts).
