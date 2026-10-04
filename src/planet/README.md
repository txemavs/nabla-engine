# Planet

Map rules that turn a tile into geometry, collisions and published files.

**Owns:** OSM/elevation contracts, assembly, sky clock, sea coverage, places.
**Does not own:** streaming cadence, the sea shader, or the editor shell.

Earth and celestial objects render in a separate pass whose unit is one million
metres. Tiles and scene objects use metres. Both passes represent the same
location and do not create a second physics world. The Sun and Moon are visual
bodies with approximate mean radii; they are not destinations.

Local landcover uses darker grass/forest greens and warmer ochre soil. Unloaded
low-resolution terrain matches the lightest grass so the streaming boundary does
not flash a pale band.

- Addresses and working frames: [planetary-world](planetary-world.md)
- Publisher: [native generation](../../services/world-cache/native-generation.md)
- Sea shader: [sea surface](../render/planet/sea-surface.md)
- Product geography: [docs/geography](../../docs/geography.md)
- Tests: `test/planet`, `test/world`, `test/sea-coverage.test.ts`

- Generated reference: [REFERENCE.md](REFERENCE.md)
