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
