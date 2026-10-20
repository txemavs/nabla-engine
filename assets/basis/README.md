# Basis Universal transcoder

`basis_transcoder.js` and `basis_transcoder.wasm` are copied unchanged from
`three/examples/jsm/libs/basis/` (three r186, Apache-2.0, Binomial LLC). The planet tile worker
loads them to transcode `KHR_texture_basisu` (KTX2) tile textures. They are served from `/basis/`
by default; set `tiles.basisTranscoderPath` when an application serves them elsewhere.
Update both files together whenever `three` is upgraded.
