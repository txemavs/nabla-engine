# Portal entities

Authored mouths, reciprocal links, validation and rigid transforms.

**Owns:** the `portal` field, pair checks, `createCarrierPortal(hostId, sternId)`.
**Does not own:** swept crossing, remote drawing, or Studio's address book.

`createCarrierPortal` creates the single stock stern mouth. Use it explicitly when
composing a carrier scene. The palette, sample and planet factories already include
it. Loading never rewrites authored portals or glass.

The stock carrier has armoured bow glass. Custom side mouths remain ordinary
authored entities. Hosted frame colliders belong to the existing carrier body.
The garage door must finish closing before its portal opens; opening the door
first closes the portal.

- Crossing: [`src/simulation`](../../simulation/README.md)
- Drawing: [`src/render/portal`](../../render/portal/README.md)
- Play contract: [portals](../../../docs/portals.md)
- Tests: `test/portal`

- Generated reference: [REFERENCE.md](REFERENCE.md)
