import { test, expect } from '@playwright/test'

// Software WebGPU (SwiftShader): absolute times are slow, but pipeline and shader-module counts
// per frame are what this measures; they must fall to ~0 once the scene is warm.
test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: [
      '--enable-unsafe-swiftshader',
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--use-vulkan=swiftshader',
      '--use-angle=swiftshader',
      '--disable-vulkan-surface',
      '--use-webgpu-adapter=swiftshader',
      '--ignore-gpu-blocklist',
    ],
  },
})

test('WebGPU game frames create no pipelines after warmup', async ({ page }) => {
  test.setTimeout(600000)
  await page.addInitScript(() => {
    const counts = {
      pipelines: 0,
      asyncPipelines: 0,
      modules: 0,
      push: 0,
      pop: 0,
      bindGroups: 0,
      buffers: 0,
      textures: 0,
      submits: 0,
    }
    const labels: string[] = []
    ;(window as unknown as { gpuLabels: string[] }).gpuLabels = labels
    ;(window as unknown as { gpuCounts: typeof counts }).gpuCounts = counts
    const wrap = (proto: object, name: string, key: keyof typeof counts) => {
      const p = proto as Record<string, (...a: unknown[]) => unknown>
      const original = p[name]
      if (!original) return
      p[name] = function (this: unknown, ...args: unknown[]) {
        counts[key]++
        const label = (args[0] as { label?: string } | undefined)?.label
        if (
          label &&
          (key === 'pipelines' || key === 'modules' || key === 'buffers' || key === 'bindGroups')
        )
          labels.push(key + ':' + label)
        return original.apply(this, args)
      }
    }
    const D = (globalThis as unknown as { GPUDevice?: { prototype: object } }).GPUDevice
    const Q = (globalThis as unknown as { GPUQueue?: { prototype: object } }).GPUQueue
    if (D) {
      wrap(D.prototype, 'createRenderPipeline', 'pipelines')
      wrap(D.prototype, 'createRenderPipelineAsync', 'asyncPipelines')
      wrap(D.prototype, 'createShaderModule', 'modules')
      wrap(D.prototype, 'pushErrorScope', 'push')
      wrap(D.prototype, 'popErrorScope', 'pop')
      wrap(D.prototype, 'createBindGroup', 'bindGroups')
      wrap(D.prototype, 'createBuffer', 'buffers')
      wrap(D.prototype, 'createTexture', 'textures')
    }
    if (Q) wrap(Q.prototype, 'submit', 'submits')
  })
  await page.route('**/frame-cost', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><body style="margin:0"><canvas style="width:800px;height:600px"></canvas></body>',
    }),
  )
  await page.goto('/frame-cost')
  const logs: string[] = []
  page.on('console', (m) => logs.push(m.text().slice(0, 300)))
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message))
  const hasGpu = await page.evaluate(
    async () => !!(navigator.gpu && (await navigator.gpu.requestAdapter())),
  )
  test.skip(!hasGpu, 'No WebGPU adapter in this browser')
  const result = await page.evaluate(async (root) => {
    const { GameRuntime } = await import(`/@fs/${root}/src/runtime/browser.ts`)
    const { createEntity } = await import(`/@fs/${root}/src/entity/schema.ts`)
    const { createRenderBackend } = await import(`/@fs/${root}/src/render/backend.ts`)
    const canvas = document.querySelector('canvas')!
    const backend = await createRenderBackend('webgpu', {
      canvas,
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
    })
    const floor = createEntity('floor', 'box', [0, 0.5, 0])
    floor.size = [40, 1, 40]
    const block = createEntity('block', 'box', [4, 2, -8])
    block.size = [3, 3, 3]
    const runtime = new GameRuntime({
      canvas,
      backend,
      sea: false,
      audio: false,
      onDiagnostics: () => undefined,
      scene: {
        version: 1,
        name: 'Frame cost',
        geography: { latitude: 43.3, longitude: -2.9, altitude: 0, imagery: 'offline' },
        entities: [floor, block, createEntity('spawn', 'spawn', [1, 1.7, 0])],
      },
    } as never)
    const counts = (window as unknown as { gpuCounts: Record<string, number> }).gpuCounts
    const t0 = performance.now()
    const played = Promise.race([
      runtime.play().then(() => 'played'),
      new Promise((r) => setTimeout(() => r('play timeout'), 240000)),
    ])
    const playState = await played
    const playMs = performance.now() - t0
    const raf = () => new Promise<number>((r) => requestAnimationFrame(r))
    const sample = async (frames: number) => {
      const before = { ...counts }
      const start = await raf()
      let last = start
      const gaps: number[] = []
      for (let i = 0; i < frames; i++) {
        const now = await raf()
        gaps.push(now - last)
        last = now
      }
      const delta: Record<string, number> = {}
      for (const k of Object.keys(counts)) delta[k] = counts[k] - before[k]
      gaps.sort((a, b) => a - b)
      return { msPerFrame: (last - start) / frames, median: gaps[gaps.length >> 1], delta }
    }
    const warm = await sample(30)
    const labels = (window as unknown as { gpuLabels: string[] }).gpuLabels
    const mark = labels.length
    const steady = await sample(60)
    const tally: Record<string, number> = {}
    for (const l of labels.slice(mark)) tally[l] = (tally[l] ?? 0) + 1
    const rebuilt = Object.entries(tally)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 10)
    const info = (backend.renderer as unknown as { info: { render: unknown } }).info.render
    runtime.dispose()
    return { playState, playMs, warm, steady, rebuilt, info }
  }, process.cwd())
  console.log(JSON.stringify(result, null, 1))
  console.log(
    logs
      .filter((l) => /rror|Lost|warn|WebGPU/i.test(l))
      .slice(0, 40)
      .join('\n'),
  )
  expect(result.playState).toBe('played')
  // A warm frame must not build pipelines, shader modules or per-object bind groups.
  expect(result.steady.delta.pipelines).toBe(0)
  expect(result.steady.delta.modules).toBe(0)
  expect(result.steady.delta.bindGroups).toBeLessThan(60)
})
