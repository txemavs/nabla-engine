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
  // A side-mirror lens catching coloured blocks, tyre smoke and marks behind the driver.
  { name: 'mirror-capture', maxMean: 2 },
] as Array<{ name: string; maxMean: number }>

for (const view of views) {
  test(`WebGPU car mirrors match WebGL: ${view.name}`, async ({ page }) => {
    await page.route('**/mirror-parity-test', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;background:#f0f"></body>',
      }),
    )
    await page.goto('/mirror-parity-test')
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
      async ({ root }) => {
        const T = await import(`/@fs/${root}/node_modules/three/build/three.module.js`)
        const { createRenderBackend } = await import(`/@fs/${root}/src/render/backend.ts`)
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
          scene.background = new T.Color('#93b7cd')
          scene.add(new T.HemisphereLight('#c8d8ff', '#6b5a48', 0.9))
          const sun = new T.DirectionalLight('#ffffff', 2.5)
          sun.position.set(-3, 5, 4)
          scene.add(sun)
          const ground = new T.Mesh(
            new T.PlaneGeometry(80, 80).rotateX(-Math.PI / 2),
            new T.MeshStandardMaterial({ color: '#5a5a5c', roughness: 0.9 }),
          )
          scene.add(ground)
          // Blocks behind the car (+z), where the mirror looks.
          const colors = ['#c0603a', '#3a8fc0', '#e0c040', '#50a050', '#a040a0']
          colors.forEach((color, i) => {
            const box = new T.Mesh(
              new T.BoxGeometry(1.5, 1 + i * 0.6, 1.5),
              new T.MeshStandardMaterial({ color, roughness: 0.6 }),
            )
            box.position.set(-6 + i * 3, (1 + i * 0.6) / 2, 8 + (i % 2) * 4)
            scene.add(box)
          })
          // Substitutes inside the capture: tyre smoke and marks behind the car.
          const { TireSmoke } = await import(`/@fs/${root}/src/render/entity/tire-smoke.ts`)
          const { TireMarks } = await import(`/@fs/${root}/src/render/entity/tire-marks.ts`)
          const smoke = new TireSmoke()
          const marks = new TireMarks()
          scene.add(smoke.root, marks.root)
          for (let i = 0; i < 40; i++) {
            smoke.update(1 / 30, [[-2.5, 0, 5]], 1, new T.Vector3())
            marks.update(
              0.06,
              'car',
              [
                {
                  contactPoint: [-2.5 + i * 0.05, 0, 3 + i * 0.4],
                  contactNormal: [0, 1, 0],
                  slip: 1,
                },
              ],
              new T.Vector3(),
            )
          }
          const { CarMirrors } = await import(`/@fs/${root}/src/render/entity/car-mirrors.ts`)
          const car = new T.Group()
          const housing = new T.Group()
          housing.position.set(-0.9, 1.1, -0.3)
          car.add(housing)
          // Lens facing back (+z) and in (+x), towards the driver.
          const lens = new T.Mesh(
            new T.PlaneGeometry(0.22, 0.14).rotateY(0.35),
            new T.MeshStandardMaterial({ color: '#333' }),
          )
          lens.userData.nabla = { mirror: 'left' }
          housing.add(lens)
          scene.add(car)
          scene.updateMatrixWorld(true)
          const mirrors = new CarMirrors([lens], new T.Vector3(0, 1, 0), 0, {}, car)
          const camera = new T.PerspectiveCamera(60, 480 / 320, 0.05, 200)
          camera.position.set(-0.68, 1.12, -0.12)
          camera.lookAt(housing.position)
          camera.updateMatrixWorld()
          let now = 0
          const draw = () => {
            mirrors.render(renderer, scene, camera, true, (now += 1000))
            renderer.render(scene, camera)
          }
          const frame = draw
          for (let i = 0; i < 10; i++) {
            frame()
            await new Promise((r) => setTimeout(r, 250))
          }
          frame()
          images.push(canvas.toDataURL('image/png').split(',')[1])
        }
        return { kinds, images }
      },
      { root: process.cwd() },
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
      `mirror parity ${view.name}: mean ${diff.meanDiff.toFixed(2)}, max ${diff.maxDiff}, ` +
        `>8: ${(diff.over8 * 100).toFixed(3)}%, >32: ${(diff.over32 * 100).toFixed(3)}%`,
    )
    expect(errors).toEqual([])
    expect(diff.over32).toBeLessThan(0.005)
    expect(diff.meanDiff).toBeLessThan(view.maxMean)
  })
}
