# Contributing

Use Node.js 22.12+ (`.nvmrc` selects Node 22), install with `npm ci`, and run the
playground with `npm run dev`. Do not commit dependency folders or build/test output.

## Development workflow

1. Keep changes focused and preserve the current edit/play behavior.
2. Put engine contracts/controllers in `src/`; browser-only code belongs in `playground/`.
3. Keep unit/physics tests beside their modules and browser journeys in `tests/`.
4. Update the relevant English documentation when contracts or controls change.
5. Format and run the checks appropriate to the change.

```bash
npm run format
npm run check
npx playwright install --with-deps chromium
npm run test:e2e
npm pack --dry-run
```

`check` covers formatting, TypeScript, unit/physics tests, package build and demo
build. CI also runs Chromium tests and checks package contents. Browser screenshots
and failure traces are written to ignored `test-results/`. Unit tests need no GPU.

The development server polls files to support mounted Windows/WSL workspaces.
For environments with a preinstalled browser, Playwright accepts
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`; install that browser's system dependencies
through the environment's normal tooling rather than committing local runtime paths.

## Contracts to preserve

- SI units, Y-up, −Z forward and explicit import conversions.
- Stable IDs, validated JSON and one owner of each mutable fact.
- One simulation world and fixed-step clock; no per-vehicle worlds.
- Authored data stays separate from runtime poses and constraints.
- Host-owned rendering, input, storage, network requests and permissions.
- Explicit collider definitions; never derive physics from display names.
- Dispose owned GPU resources and cancel obsolete async work.

Use the original `assets/brand/source.svg` for branding. Keep source artwork
unchanged; adapt presentation through layout/CSS. Record provenance for new assets.

The next planned capability is portals. Specify their transform and interaction
contracts before adding cross-boundary behavior; retain the current regression
journeys for walking, transport, flight and geographic continuity.

Browser checks use Playwright's `chromium` channel (full Chromium in headless
mode), including on CI. Avoid silently switching to Headless Shell: the WebGL
rendering path must match the locally validated browser.

For the full local Studio/cache/generator environment, follow
[Local development](docs/local-development.md). Browser test readiness and fixture
conventions are documented in [tests/README.md](tests/README.md).
