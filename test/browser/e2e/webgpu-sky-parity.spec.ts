import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'

// Software WebGPU (SwiftShader) is enough for pixels, not for timings.
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

const shots = process.env.NABLA_PARITY_SHOTS
const views = [
  // Late afternoon over Irun, looking at the sun: dome colour, sun disc, halo and glare.
  // Mean bound 6: the earth below the horizon lacks the GLSL cloud/night-light patch (not ported).
  { name: 'day-sun', at: '2026-06-21T18:00:00Z', look: 'sun', maxMean: 6 },
  // Night over Irun, looking up: stars, Milky Way, planets and the moon.
  { name: 'night-sky', at: '2026-06-21T23:30:00Z', look: 'up', maxMean: 2 },
] as const

for (const view of views) {
  test(`WebGPU sky matches WebGL: ${view.name}`, async ({ page }) => {
    await page.route('**/sky-parity-test', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;background:#f0f"></body>',
      }),
    )
    await page.goto('/sky-parity-test')
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => {
      if (!m.text().includes('GPU stall')) console.log('[page]', m.text().slice(0, 300))
    })
    const hasGpu = await page.evaluate(
      async () => !!(navigator.gpu && (await navigator.gpu.requestAdapter())),
    )
    test.skip(!hasGpu, 'No WebGPU adapter in this browser')
    const { kinds, images } = await page.evaluate(
      async ({ root, view }) => {
        const T = await import(`/@fs/${root}/node_modules/three/build/three.module.js`)
        const { createRenderBackend } = await import(`/@fs/${root}/src/render/backend.ts`)
        const { GeographicView } = await import(`/@fs/${root}/src/render/planet/sky.ts`)
        const { configureWorldRenderer } = await import(
          `/@fs/${root}/src/render/planet/world-environment.ts`
        )
        const kinds: string[] = []
        const images: string[] = []
        for (const preference of ['webgpu', 'webgl']) {
          const canvas = document.createElement('canvas')
          canvas.id = preference
          canvas.style.cssText = 'display:block;width:480px;height:320px'
          document.body.append(canvas)
          const backend = await createRenderBackend(preference, {
            canvas,
            antialias: false,
            logarithmicDepthBuffer: true,
          })
          kinds.push(backend.kind)
          const renderer = backend.renderer
          renderer.setPixelRatio(1)
          renderer.setSize(480, 320, false)
          configureWorldRenderer(renderer)
          const doc = {
            version: 1,
            name: 'Sky parity',
            geography: { latitude: 43.3383, longitude: -1.7894, altitude: 20, imagery: 'offline' },
            entities: [],
          }
          const sky = new GeographicView(doc, () => {}, false, { textures: false })
          sky.setLayers({ sky: true, planets: true, sun: true, moon: true, clouds: false })
          const clock = { mode: 'fixed', at: view.at }
          sky.update([0, 2, 0], new T.Vector3(), clock)
          const camera = new T.PerspectiveCamera(60, 480 / 320, 0.1, 1e6)
          camera.position.set(0, 2, 0)
          const target =
            view.look === 'sun'
              ? sky.sunDirection.clone().add(camera.position)
              : new T.Vector3(0.3, 2.9, -0.4)
          camera.lookAt(target)
          camera.updateMatrixWorld()
          // WebGPU compiles pipelines asynchronously: keep drawing until they are ready.
          for (let i = 0; i < 8; i++) {
            sky.render(renderer, camera, camera.position)
            await new Promise((r) => setTimeout(r, 250))
          }
          // Read the canvas in the same task as its last frame (before the swap chain drops it).
          sky.render(renderer, camera, camera.position)
          images.push(canvas.toDataURL('image/png').split(',')[1])
        }
        return { kinds, images }
      },
      { root: process.cwd(), view },
    )
    expect(kinds).toEqual(['webgpu', 'webgl'])
    const [webgpu, webgl] = images.map((b64) => Buffer.from(b64, 'base64'))
    const diff = await page.evaluate(
      async ([a, b]) => {
        const load = async (b64: string) => {
          const img = new Image()
          img.src = 'data:image/png;base64,' + b64
          await img.decode()
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const g = c.getContext('2d')!
          g.drawImage(img, 0, 0)
          return g.getImageData(0, 0, c.width, c.height)
        }
        const [x, y] = [await load(a), await load(b)]
        const out = new ImageData(x.width, x.height)
        let over8 = 0,
          over32 = 0,
          max = 0,
          sum = 0
        for (let i = 0; i < x.data.length; i += 4) {
          const d = Math.max(
            Math.abs(x.data[i] - y.data[i]),
            Math.abs(x.data[i + 1] - y.data[i + 1]),
            Math.abs(x.data[i + 2] - y.data[i + 2]),
          )
          max = Math.max(max, d)
          sum += d
          if (d > 8) over8++
          if (d > 32) over32++
          const v = Math.min(255, d * 8)
          out.data.set([v, v, v, 255], i)
        }
        const c = document.createElement('canvas')
        c.width = x.width
        c.height = x.height
        c.getContext('2d')!.putImageData(out, 0, 0)
        const pixels = x.width * x.height
        return {
          pixels,
          meanDiff: sum / pixels,
          maxDiff: max,
          over8: over8 / pixels,
          over32: over32 / pixels,
          png: c.toDataURL('image/png').split(',')[1],
        }
      },
      [webgl.toString('base64'), webgpu.toString('base64')] as const,
    )
    if (shots) {
      mkdirSync(shots, { recursive: true })
      const { writeFileSync } = await import('node:fs')
      writeFileSync(`${shots}/sky-${view.name}-webgl.png`, webgl)
      writeFileSync(`${shots}/sky-${view.name}-webgpu.png`, webgpu)
      writeFileSync(`${shots}/sky-${view.name}-diff.png`, Buffer.from(diff.png, 'base64'))
    }
    console.log(
      `sky parity ${view.name}: mean ${diff.meanDiff.toFixed(2)}, max ${diff.maxDiff}, ` +
        `>8: ${(diff.over8 * 100).toFixed(3)}%, >32: ${(diff.over32 * 100).toFixed(3)}%`,
    )
    expect(errors).toEqual([])
    expect(diff.over32).toBeLessThan(0.005)
    expect(diff.meanDiff).toBeLessThan(view.maxMean)
  })
}
