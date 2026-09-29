# Browser tests

Run `npm run test:e2e` after installing Playwright Chromium and its system
libraries. Tests start their own Vite server (or reuse port 5173).

UI tests import `test` and `expect` from `studio-test.ts`. The fixture waits for
Studio's `data-startup="ready"` signal when navigating to its entry page; receiving
HTML is not enough to guarantee that the file, menu and input handlers are bound.
`startup.spec.ts` deliberately uses raw Playwright to test the loading state.

After pressing Play/Stop, wait for the button to become enabled before sending
game input. Both transitions yield a paint and can prepare/dispose simulation
resources asynchronously. Do not replace this signal with arbitrary sleep delays.

`localCircuit` gives coordinate editing tests a local scene without geographic
anchors. GPS inspector tests explicitly use geographic scenes. Native world tests
use `native-map.ts` / `planet-fixture.ts` or their own mocked canonical manifests,
not live providers or retired browser-side OSM generation. Generated context is
not an outliner entity and is not saved as authored content.

Tests that construct a `SceneView` directly must drain `flushMapInstall` when
inspecting generated context: the application's animation loop normally performs
that work incrementally. `ready` covers asynchronous assets, not frame-budgeted
map installation.

The GLB/binary converter tests retain small legacy-format inputs to cover offline
import/rollback utilities. They do not imply that the game streams local-grid
artifacts. Native streaming and downloads are covered by `planet-world.spec.ts`.

Render probes import Three.js from `/e2e/render-fixture.ts`, so materials and
objects share the application's Vite module instance. Do not import a second
copy from `node_modules/three/build` or use retired `/view.ts`/`/csm.ts` URLs.
Engine imports use `/@fs${root}/src/...` with the repository root passed explicitly
into `page.evaluate`. Cache/worker and navigation probes have small fixture entries
in this directory. CSS selectors and `.glb`/`.bin` suffixes are not filesystem
paths: do not rewrite them when moving test files.

The shadow-quality UI journey uses the bundled circuit so shader coverage does
not depend on live elevation/imagery services. Network-specific journeys provide
their own fixtures. Use a separate test port while a development session is open.
