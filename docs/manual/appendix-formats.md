# Appendix C. Data format reference

[Manual contents](README.md)

## Scene document

The public parser is `parseScene(unknown)`. The current schema requires version 1,
a nonempty name, and entities. Optional fields include `cursor`, `cursorOnGround`,
`geography`, `sky`, and `water`. Unknown fields are rejected by strict schemas.
See [document.ts](../../src/scene/document.ts) for exact bounds.

| Structure           | Key rules                                                                     |
| ------------------- | ----------------------------------------------------------------------------- |
| Geography           | `latitude`, `longitude`, `altitude`, `imagery`; optional `planetary`          |
| Sky                 | Discriminated by `mode`: `live` or `fixed`; fixed uses an ISO datetime `at`   |
| Water               | `mode` is `manual` or `tide`; level and amplitude have bounded numeric ranges |
| Entity transform    | Position tuple and unit quaternion; no arbitrary scale field                  |
| Parent relationship | Stable ID or null; globally validated for existence and cycles                |
| Spawn               | Exactly one; obeys root/physical hierarchy restrictions                       |

The normal entity limit is 20,000. There is an explicit experimental large-scene
parser option; resource budgets remain a separate concern. The parser normalizes
known stock asset URLs through a specific migration helper.

## Vehicle and visual payloads

[field.ts](../../src/entity/vehicle/field.ts) defines the vehicle and visual schemas;
[vehicle.ts](../../src/entity/vehicle/vehicle.ts) supplies defaults and validation.
Use those factories and existing recipes rather than writing an approximate JSON
shape from a prose guide. The executable scene example demonstrates a complete
procedural vehicle without a GLB.

`visual` identifies presentation resources and import transforms. Physical mass,
colliders, wheel placement, suspension, and behavior fields must remain explicit.
Presentation adapters are selected by ID, not inferred from display names.

## Geographic publications

The engine's `PlanetManifest` and Atlas's `nabla-z15-package/1` are different
contracts. The inspected adapter merges a pointed-to Z15 package with an engine
manifest; a raw package is not accepted merely because its filename is supplied
through `manifestFiles`. Z16 has another adapter path.

Current engine cell versions are 1, 2, 3, and 4, with an absent cell version treated
according to the contract. File hashes and byte sizes verify resource identity;
geometry revision identifies generated representation expectations. Never substitute
one of these checks for another.

See [chapter 10](10-terrain.md) for the deployed Atlas layout and the unresolved
consumer mismatch. See [contract.ts](../../src/planet/contract.ts),
[atlas-z15.ts](../../src/planet/atlas-z15.ts), and
[atlas-z16.ts](../../src/planet/atlas-z16.ts) for actual shapes.

## Network messages

[protocol.ts](../../src/net/protocol.ts) owns wire representation;
[authority-schema.ts](../../src/net/authority-schema.ts) bounds logical requests.
Use their encoders/validators and the authority abstraction. A shared item has an
instance ID, item type, count, and position; its identity is not its visible label.
Remote events and persisted scenes are separate formats and should not be parsed
interchangeably.
