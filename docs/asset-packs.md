# Asset packs

Run `npm run assets:pack` after changing authored GLBs. The game dev and build
commands run this automatically. Original files in `assets/library` remain the
source of truth. Generated `assets/packs` files are ignored by Git and copied by
Vite into the game distribution. The game postbuild removes packed standalone GLBs
from `game-dist` only, so production publishes the models inside the pack. Source
GLBs remain available in development and in the engine authoring package.

The version 1 index (`/packs/index.json`) maps existing library URLs to independent
gzip blocks inside a content-addressed `assets.<hash>.pak`. Only a requested
model's byte range is downloaded. Blocks are lossless: hierarchy, extras, pivots,
materials, animations and vertex precision are preserved byte for byte. The
builder verifies every compressed block. Shared geometry and instance material
ownership continue to be handled by `AssetLibrary`.

Serve the index with revalidation and hashed packs with immutable caching. Serve
PAK bytes unchanged with HTTP byte ranges (206 and correct Content-Range); do not
apply HTTP content encoding to a PAK. A server returning a full 200 response is
cancelled and the loader falls back to the original GLB. Missing indexes and
custom URLs also retain the ordinary loader. Production game hosting must support
byte ranges because the packed originals are removed from that distribution.
External hosts that keep originals can use the compatibility fallback.

Decoded blocks are verified with SHA-256 and retained in the browser Cache API
under `nabla-assets-v1`, keyed by content hash. Changed models get a new key;
unchanged models retain cached bytes even when the pack changes. Storage denial
does not prevent loading. Cache storage is performance data, not player settings;
the default-settings button does not clear it. Clear this cache in developer tools
to measure a cold visit. Browser storage can evict it at any time.

The main loader also supports Meshopt-authored GLBs. This initial pack deliberately
does not quantize, simplify, flatten, or transcode authored assets. KTX2 conversion
and collision preprocessing require separate quality and compatibility validation;
packing alone does not implement them. GPU objects and shaders still require
device-specific initialization, using the existing presentation warmup.

Packing discourages casual individual-file downloading; it is not encryption or
DRM. Anything rendered by a browser can be extracted. Do not store secrets here.

## Validation and measurements

`npm run assets:pack` reports raw and packed byte totals and verifies round trips.
For the initial 21 models: 13,510,464 raw bytes become 7,110,547 packed bytes
(47.4% fewer than uncompressed source). This is not a speedup claim against a
server already applying compression. Measure cold navigation, warm navigation,
first vehicle appearance and longest frame on the same device/network before
changing rollout defaults. The pack reduces transferred bytes; it does not remove
GLTF parsing or guarantee faster decoding.

Implementation: `scripts/pack-assets.mjs` owns the build format and compression
level; `src/render/entity/asset-pack.ts` owns ranges, validation and persistent
cache; `src/render/entity/assets.ts` owns model parsing and shared instances.

Chromium benchmark (21 models, sequential transfer and GLTF parsing, simulated
1 MB/s and 30 ms latency): original GLBs 14.49 s, cold pack 8.23 s, warm decoded
cache 0.16 s. The browser test compares scene hierarchies, vertex counts and extras.
This measures model loading, not complete game startup, GPU uploads or shader
compilation. Reproduce with `npm run test:e2e -- asset-pack`.
