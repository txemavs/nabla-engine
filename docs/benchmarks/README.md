# Performance Benchmarks

This directory contains performance benchmark results for Nabla Engine.

## Running Benchmarks

### Prerequisites

- Node.js 22.12.0 or later
- npm dependencies installed (`npm install`)
- Chrome browser installed (for headed mode)
- For GPU timing: a WebGL2-capable GPU with `EXT_disjoint_timer_query_webgl2` support

### Windows Baseline Command (RTX GPU)

To produce a reproducible performance baseline on a Windows PC with an RTX GPU and Chrome:

```powershell
# Start the development server in one terminal
npm run dev

# In another terminal, run the headed benchmark
npx playwright install chromium
node scripts/benchmark-game.mjs --headed
```

**Important:** The development server must be running at `http://localhost:5174/` before
running the benchmark. The `--headed` flag enables GPU-accelerated rendering in a visible
Chrome window, which is required for accurate GPU timing measurements.

Results are written to `docs/benchmarks/<YYYY-MM-DD>/benchmark-headed.json` and
`docs/benchmarks/<YYYY-MM-DD>/benchmark-headed.md`.

### Benchmark Modes

| Mode                | Description                       | Use Case                              |
| ------------------- | --------------------------------- | ------------------------------------- |
| Headless (default)  | Software renderer via SwiftShader | CI, cross-platform CPU timing         |
| Headed (`--headed`) | GPU-accelerated Chrome window     | GPU timing, real performance baseline |

### Command Options

```
node scripts/benchmark-game.mjs [output.json] [options]

Options:
  --headed   Visible window with GPU rendering (requires display and GPU)
  --cold     Cold cache run (measures initial load performance)
  --irun     Use Irun/Ventas geographic terrain instead of flat example

Examples:
  node scripts/benchmark-game.mjs                    # Headless, flat scene
  node scripts/benchmark-game.mjs --headed           # GPU benchmark, flat scene
  node scripts/benchmark-game.mjs --headed --cold    # GPU with cold+warm cache runs
  node scripts/benchmark-game.mjs results.json       # Custom output path
```

### Output

Each benchmark run produces:

1. **JSON report** with raw metrics
2. **Markdown report** with formatted tables

Metrics include:

- **Frame timing:** FPS, P50/P95/P99 frame times
- **CPU timing:** Mean and P95 main-thread time
- **GPU timing:** Frame and per-pass times (when available)
- **Render stats:** Draw calls, triangles
- **Memory:** Geometries, textures (via `renderer.info`)
- **Streaming:** Install spikes, time to HUD

### GPU Timing

GPU timing uses the WebGL2 `EXT_disjoint_timer_query_webgl2` extension to measure
actual GPU execution time. Results arrive 2-3 frames after render due to async
query readback.

Per-pass GPU timing:

- `mirrors` — Vehicle mirror reflection passes
- `portals` — Portal view rendering
- `main` — Main scene, sky, and shadow passes
- `post` — Postprocessing (FSR, DoF, lens flare)

GPU timing is unavailable:

- In headless mode (SwiftShader does not support the extension)
- On GPUs that don't expose the extension
- When a disjoint event invalidates queries (GPU power state changes)

### Comparing Results

Results are stored by date in `docs/benchmarks/<YYYY-MM-DD>/`. To compare
performance across changes:

1. Run benchmarks on the base branch
2. Apply changes
3. Run benchmarks again
4. Compare the JSON/Markdown reports

The benchmark uses deterministic settings (fixed viewport, DPR 1, quality preset)
to minimize variance between runs.

### Tiles and Terrain

The flat example scene (`?example=flat`) loads bundled offline tiles with no
network dependency. Geographic terrain (`--irun`) requires the dev server proxy
to `atlas.chained.world`. The proxy path `/atlas-live/euskadi/terraform/` is
configured in `vite.game.config.ts`.

**Note:** GPU-less CI environments cannot verify GPU timing or real GPU performance.
The headed benchmark is designed for local testing on machines with a display and
GPU.
