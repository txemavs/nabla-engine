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
  // Late-afternoon sun over a ground plane with façade-sized blocks: near and far cascades.
  { name: 'shadows-near', look: [0, 0, -45], tier: 2048, maxMean: 2 },
  { name: 'shadows-far', look: [0, 4, -300], tier: 2048, maxMean: 2 },
] as Array<{ name: string; look: [number, number, number]; tier: number; maxMean: number }>

for (const view of views) {
  test(`WebGPU cascaded shadows match WebGL: ${view.name}`, async ({ page }) => {
    await page.route('**/shadow-parity-test', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;background:#f0f"></body>',
      }),
    )
    await page.goto('/shadow-parity-test')
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
        const { ShadowManager } = await import(`/@fs/${root}/src/render/shadows.ts`)
        const { shadowTiers } = await import(`/@fs/${root}/src/render/shadow-tiers.ts`)
        const { webgpuNodeKit } = await import(`/@fs/${root}/src/render/backend.ts`)
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
          renderer.shadowMap.enabled = true
          renderer.shadowMap.type = T.PCFShadowMap
          const scene = new T.Scene()
          // Black: WebGPU tone-maps a background colour, WebGL clears to it as is (not a shadow matter).
          scene.background = new T.Color(0x000000)
          scene.add(new T.HemisphereLight('#c8d8ff', '#6b5a48', 0.9))
          const materials: InstanceType<typeof T.Material>[] = []
          const ground = new T.Mesh(
            new T.PlaneGeometry(2000, 2000).rotateX(-Math.PI / 2),
            new T.MeshStandardMaterial({ color: '#8a8f7a', roughness: 1 }),
          )
          ground.receiveShadow = true
          scene.add(ground)
          materials.push(ground.material)
          const block = new T.MeshStandardMaterial({ color: '#d9cfc0', roughness: 0.9 })
          materials.push(block)
          // Deterministic blocks from 5 m to 400 m: every cascade gets casters.
          for (let i = 0; i < 40; i++) {
            const d = 14 + i * i * 0.25
            const x = (((i * 37) % 17) - 8) * (3 + d * 0.12)
            const h = 2 + ((i * 13) % 7) * 2
            const box = new T.Mesh(new T.BoxGeometry(3 + (i % 4), h, 3), block)
            box.position.set(x, h / 2, -d)
            box.castShadow = box.receiveShadow = true
            scene.add(box)
          }
          const camera = new T.PerspectiveCamera(60, 480 / 320, 0.1, 4000)
          camera.position.set(0, 8, 0)
          camera.lookAt(new T.Vector3(...view.look))
          camera.updateMatrixWorld()
          const shadows = new ShadowManager()
          shadows.init({
            camera,
            scene,
            lightDirection: new T.Vector3(0.55, -0.45, 0.7).normalize(),
            lightIntensity: 3.2,
            tier: shadowTiers[view.tier],
            nodeKit: webgpuNodeKit(renderer),
          })
          for (const material of materials) shadows.setupMaterial(material)
          const frame = () => {
            shadows.update(camera, new T.Vector3())
            renderer.render(scene, camera)
          }
          for (let i = 0; i < 10; i++) {
            frame()
            await new Promise((r) => setTimeout(r, 250))
          }
          frame()
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
      writeFileSync(`${shots}/${view.name}-webgl.png`, webgl)
      writeFileSync(`${shots}/${view.name}-webgpu.png`, webgpu)
      writeFileSync(`${shots}/${view.name}-diff.png`, Buffer.from(diff.png, 'base64'))
    }
    console.log(
      `shadow parity ${view.name}: mean ${diff.meanDiff.toFixed(2)}, max ${diff.maxDiff}, ` +
        `>8: ${(diff.over8 * 100).toFixed(3)}%, >32: ${(diff.over32 * 100).toFixed(3)}%`,
    )
    expect(errors).toEqual([])
    expect(diff.over32).toBeLessThan(0.005)
    expect(diff.meanDiff).toBeLessThan(view.maxMean)
  })
}
