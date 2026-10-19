/**
 * Performance benchmark for Nabla Engine.
 *
 * Modes:
 *   - Headless (default): software renderer via SwiftShader, capped at ~32 fps.
 *   - Headed (--headed): visible Chrome window, GPU-accelerated, no rAF throttling.
 *
 * Usage:
 *   node scripts/benchmark-game.mjs [output.json] [--headed] [--cold] [--irun]
 *     [--renderer=webgl|webgpu] [--runs=N] [--quality=<preset>]
 *
 * Options:
 *   --headed   Visible window with GPU rendering (requires display and GPU).
 *   --cold     Cold cache run (clear cache before each quality level).
 *   --irun     Use Irun/Ventas geographic terrain instead of flat example: the Atlas package
 *              folder through the dev server's same-origin /tiles proxy, spawn cell 16224/11998 (Zaisa).
 *              Override the folder with NABLA_BENCH_TERRAIN.
 *   --renderer Backend under test (`?renderer=`); default webgl.
 *   --runs     Warm runs per quality; the report adds the median of each metric.
 *   --quality  Quality preset (default custom).
 *   NABLA_BENCH_VIEWPORT  CSS viewport, default 1920x1080.
 *   NABLA_BENCH_QUERY  extra query parameters, e.g. `photo=lo`.
 *   NABLA_BENCH_WARMUP / NABLA_BENCH_FRAMES / NABLA_BENCH_LOAD_TIMEOUT  frame counts and load timeout.
 *
 * Output: JSON + markdown in docs/benchmarks/<YYYY-MM-DD>/ when no output path given.
 *
 * Compare warm, stationary chase-camera profiles at a fixed viewport.
 * Never equate CPU timing with GPU timing.
 */
import assert from 'node:assert/strict'
import { chromium } from '@playwright/test'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const outputArg = args.find((a) => !a.startsWith('--'))
const headed = args.includes('--headed')
const coldCache = args.includes('--cold')
const useIrun = args.includes('--irun')
const option = (name, fallback) =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback
const rendererParam = option('renderer', 'webgl')
const runs = Math.max(1, Number(option('runs', '1')))
// NABLA_BENCH_VIEWPORT=1280x720 for memory-limited software runs; default 1920x1080.
const viewport = (process.env.NABLA_BENCH_VIEWPORT ?? '1920x1080').split('x').map(Number)

const dateString = new Date().toISOString().slice(0, 10)
const outputDir = join('docs', 'benchmarks', dateString)

const browserArgs = headed
  ? [
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
    ]
  : rendererParam === 'webgpu'
    ? [
        '--enable-unsafe-swiftshader',
        '--enable-unsafe-webgpu',
        '--enable-features=Vulkan',
        '--use-vulkan=swiftshader',
        '--use-angle=swiftshader',
        '--use-webgpu-adapter=swiftshader',
        '--disable-vulkan-surface',
      ]
    : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist']

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  headless: !headed,
  args: browserArgs,
})

const baseUrl = process.env.NABLA_BENCH_URL ?? 'http://127.0.0.1:5174/'
const terrainBase = process.env.NABLA_BENCH_TERRAIN ?? '/tiles'
const sceneParam = useIrun
  ? `terrain=${encodeURIComponent(terrainBase)}&tile=16224/11998`
  : 'example=flat'
const qualities = [option('quality', 'custom')]

const results = []

async function runBenchmark(quality, warmRun) {
  const context = await browser.newContext({
    viewport: { width: viewport[0], height: viewport[1] },
    deviceScaleFactor: 1,
  })

  if (coldCache && !warmRun) {
    await context.clearCookies()
  }

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))

  const url = `${baseUrl}?${sceneParam}&diagnostics=1&quality=${quality}&renderer=${rendererParam}${process.env.NABLA_BENCH_QUERY ? '&' + process.env.NABLA_BENCH_QUERY : ''}`
  console.log(`[${warmRun ? 'warm' : 'cold'}] Loading: ${url}`)

  const loadStart = Date.now()
  await page.goto(url)

  const hudVisible = page.locator('#game-hud:not(.hidden)')
  await hudVisible.waitFor({ timeout: Number(process.env.NABLA_BENCH_LOAD_TIMEOUT ?? 120000) })
  const timeToHud = Date.now() - loadStart

  // Focus without a click: a slow software frame can block Playwright's actionability checks.
  await page.evaluate(() => document.getElementById('game-canvas').focus())
  await page.keyboard.press('KeyC')
  await page.keyboard.press('KeyC')

  const data = await page.evaluate(
    (params) =>
      new Promise((resolve, reject) => {
        const { warmupFrames, sampleFrames } = params
        const canvas = document.getElementById('game-canvas')
        const timeout = setTimeout(() => {
          canvas.removeEventListener('nabla:frame', listener)
          reject(new Error('Timed out collecting runtime diagnostics'))
        }, 180000)

        // A WebGPU canvas has no WebGL context to query.
        const gl = canvas.dataset.renderer === 'webgpu' ? null : canvas.getContext('webgl2')
        const extension = gl?.getExtension('WEBGL_debug_renderer_info')
        const renderer = !gl
          ? 'WebGPU'
          : extension
            ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)
            : gl.getParameter(gl.RENDERER)

        const timerExt = gl?.getExtension('EXT_disjoint_timer_query_webgl2') ?? null
        const gpuTimingAvailable = timerExt !== null

        const rendererInfo = window.nablaRuntime?.renderer?.info
        const memory = rendererInfo
          ? {
              geometries: rendererInfo.memory?.geometries ?? 0,
              textures: rendererInfo.memory?.textures ?? 0,
            }
          : null

        let warmup = warmupFrames
        const samples = []
        const installSpikes = []
        let maxInstallMs = 0

        const listener = (event) => {
          const detail = event.detail
          if (warmup-- > 0) return

          samples.push(detail)

          if (detail.installMs > 5) {
            installSpikes.push({ frame: samples.length, installMs: detail.installMs })
          }
          if (detail.installMs > maxInstallMs) {
            maxInstallMs = detail.installMs
          }

          if (samples.length >= sampleFrames) {
            clearTimeout(timeout)
            canvas.removeEventListener('nabla:frame', listener)
            resolve({
              renderer,
              gpuTimingAvailable,
              memory,
              samples,
              installSpikes,
              maxInstallMs,
            })
          }
        }
        canvas.addEventListener('nabla:frame', listener)
      }),
    {
      warmupFrames: Number(process.env.NABLA_BENCH_WARMUP ?? (headed ? 120 : 90)),
      sampleFrames: Number(process.env.NABLA_BENCH_FRAMES ?? (headed ? 300 : 180)),
    },
  )

  if (errors.length) {
    console.error('Page errors:', errors)
    throw new Error(errors.join('\n'))
  }

  const mean = (key) => data.samples.reduce((sum, s) => sum + s[key], 0) / data.samples.length
  const percentile = (key, p) => {
    const sorted = data.samples.map((s) => s[key]).sort((a, b) => a - b)
    return sorted[Math.floor((sorted.length - 1) * p)]
  }

  const gpuSamples = data.samples.filter((s) => s.gpuTiming?.frameMs !== undefined)
  const gpuFrameMean =
    gpuSamples.length > 0
      ? gpuSamples.reduce((sum, s) => sum + s.gpuTiming.frameMs, 0) / gpuSamples.length
      : null

  const gpuPassTotals = { mirrors: 0, portals: 0, main: 0, post: 0 }
  const gpuPassCounts = { mirrors: 0, portals: 0, main: 0, post: 0 }
  for (const s of data.samples) {
    if (s.gpuTiming?.passes) {
      for (const [pass, ms] of Object.entries(s.gpuTiming.passes)) {
        if (ms !== undefined && pass in gpuPassTotals) {
          gpuPassTotals[pass] += ms
          gpuPassCounts[pass]++
        }
      }
    }
  }

  const gpuPassMeans = {}
  for (const pass of Object.keys(gpuPassTotals)) {
    gpuPassMeans[pass] = gpuPassCounts[pass] > 0 ? gpuPassTotals[pass] / gpuPassCounts[pass] : null
  }

  const result = {
    backend: data.samples[0].backend ?? 'webgl',
    quality,
    cacheState: warmRun ? 'warm' : 'cold',
    renderer: data.renderer,
    gpuTimingAvailable: data.gpuTimingAvailable,
    samples: data.samples.length,
    fps: 1000 / mean('frameMs'),
    frameP50Ms: percentile('frameMs', 0.5),
    frameP95Ms: percentile('frameMs', 0.95),
    frameP99Ms: percentile('frameMs', 0.99),
    cpuMeanMs: mean('cpuMs'),
    cpuP95Ms: percentile('cpuMs', 0.95),
    physicsMeanMs: mean('physicsMs'),
    installMeanMs: mean('installMs'),
    installMaxMs: data.maxInstallMs,
    installSpikes: data.installSpikes.length,
    calls: mean('calls'),
    triangles: mean('triangles'),
    width: data.samples[0].width,
    height: data.samples[0].height,
    droppedSeconds: data.samples.at(-1).droppedSeconds - data.samples[0].droppedSeconds,
    timeToHudMs: timeToHud,
    memory: data.memory,
    gpu:
      gpuFrameMean !== null
        ? {
            frameMeanMs: gpuFrameMean,
            passes: gpuPassMeans,
          }
        : null,
  }

  assert(result.calls > 0 && result.triangles > 0 && Number.isFinite(result.cpuMeanMs))

  await page.close()
  await context.close()

  return result
}

try {
  for (const quality of qualities) {
    if (coldCache) {
      const coldResult = await runBenchmark(quality, false)
      results.push(coldResult)
      console.log(JSON.stringify(coldResult, null, 2))
    }

    for (let run = 0; run < runs; run++) {
      const warmResult = await runBenchmark(quality, true)
      results.push(warmResult)
      console.log(JSON.stringify(warmResult, null, 2))
    }
  }
} finally {
  await browser.close()
}

const median = (values) => {
  const sorted = values.filter((v) => typeof v === 'number').sort((a, b) => a - b)
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null
}
const warm = results.filter((r) => r.cacheState === 'warm')
const medians = Object.fromEntries(
  ['fps', 'frameP50Ms', 'cpuMeanMs', 'calls', 'triangles'].map((key) => [
    key,
    median(warm.map((r) => r[key])),
  ]),
)
medians.gpuFrameMeanMs = median(warm.map((r) => r.gpu?.frameMeanMs))

const report = {
  timestamp: new Date().toISOString(),
  renderer: rendererParam,
  runs,
  medians,
  mode: headed ? 'headed' : 'headless',
  scene: useIrun ? 'irun-ventas' : 'flat',
  scenario: headed
    ? `GPU benchmark, ${useIrun ? 'Irun/Ventas geographic' : 'flat Z15'}, 1920x1080 CSS, DPR 1, Chrome with GPU`
    : `Software benchmark, ${useIrun ? 'Irun/Ventas geographic' : 'flat Z15'}, 1920x1080 CSS, DPR 1, headless Chrome/SwiftShader`,
  results,
}

const outputPath = outputArg ?? join(outputDir, `benchmark-${headed ? 'headed' : 'headless'}.json`)

if (!outputArg) {
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }
}

writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`\nResults written to: ${outputPath}`)

const markdownPath = outputPath.replace(/\.json$/, '.md')
const md = generateMarkdown(report)
writeFileSync(markdownPath, md)
console.log(`Markdown written to: ${markdownPath}`)

function generateMarkdown(report) {
  const lines = [
    `# Nabla Engine Benchmark`,
    ``,
    `**Date:** ${report.timestamp}`,
    `**Mode:** ${report.mode}`,
    `**Scene:** ${report.scene}`,
    `**Scenario:** ${report.scenario}`,
    `**Renderer:** ${report.renderer} (${report.runs} warm run(s))`,
    ``,
    `**Medians:** ${JSON.stringify(report.medians)}`,
    ``,
    `## Results`,
    ``,
  ]

  for (const r of report.results) {
    lines.push(`### ${r.quality} (${r.cacheState})`)
    lines.push(``)
    lines.push(`| Metric | Value |`)
    lines.push(`|--------|-------|`)
    lines.push(`| Renderer | ${r.renderer} |`)
    lines.push(`| GPU Timing | ${r.gpuTimingAvailable ? 'Available' : 'Unavailable'} |`)
    lines.push(`| Samples | ${r.samples} |`)
    lines.push(`| FPS | ${r.fps.toFixed(1)} |`)
    lines.push(`| Frame P50 | ${r.frameP50Ms.toFixed(2)} ms |`)
    lines.push(`| Frame P95 | ${r.frameP95Ms.toFixed(2)} ms |`)
    lines.push(`| Frame P99 | ${r.frameP99Ms.toFixed(2)} ms |`)
    lines.push(`| CPU Mean | ${r.cpuMeanMs.toFixed(2)} ms |`)
    lines.push(`| CPU P95 | ${r.cpuP95Ms.toFixed(2)} ms |`)
    lines.push(`| Physics Mean | ${r.physicsMeanMs.toFixed(3)} ms |`)
    lines.push(`| Install Mean | ${r.installMeanMs.toFixed(3)} ms |`)
    lines.push(`| Install Max | ${r.installMaxMs.toFixed(2)} ms |`)
    lines.push(`| Install Spikes | ${r.installSpikes} |`)
    lines.push(`| Draw Calls | ${r.calls.toFixed(0)} |`)
    lines.push(`| Triangles | ${(r.triangles / 1000).toFixed(0)}k |`)
    lines.push(`| Resolution | ${r.width}x${r.height} |`)
    lines.push(`| Dropped Time | ${r.droppedSeconds.toFixed(3)} s |`)
    lines.push(`| Time to HUD | ${r.timeToHudMs} ms |`)

    if (r.memory) {
      lines.push(`| Geometries | ${r.memory.geometries} |`)
      lines.push(`| Textures | ${r.memory.textures} |`)
    }

    if (r.gpu) {
      lines.push(`| **GPU Frame Mean** | ${r.gpu.frameMeanMs.toFixed(2)} ms |`)
      for (const [pass, ms] of Object.entries(r.gpu.passes)) {
        if (ms !== null) {
          lines.push(`| GPU ${pass} | ${ms.toFixed(2)} ms |`)
        }
      }
    }

    lines.push(``)
  }

  lines.push(`## Notes`)
  lines.push(``)
  lines.push(`- CPU timings are main-thread submission time, not GPU execution time.`)
  lines.push(`- GPU timings use EXT_disjoint_timer_query_webgl2 when available.`)
  lines.push(`- GPU timings arrive 2-3 frames after render; some samples may be missing.`)
  lines.push(`- Install spikes indicate tile installation taking >5ms.`)
  lines.push(`- Headless mode uses SwiftShader (software renderer), capped at ~32 fps.`)
  lines.push(`- Headed mode requires a display and GPU for accurate GPU measurements.`)
  lines.push(``)

  return lines.join('\n')
}
