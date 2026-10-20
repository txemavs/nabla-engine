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
  // Tyre, exhaust and muzzle smoke sprites over an asphalt plane and the sky colour.
  // Overlapping sprites of one draw blend against the frame below the draw, so a dense plume core
  // comes out a little dimmer than under WebGL (particle-nodes.ts `displayBlend`): 2.5, not 2.
  { name: 'vehicle-smoke', maxMean: 2.5 },
  // Two skid trails (asphalt and grass tints) from the tyre-mark ring buffer.
  { name: 'vehicle-tyre-marks', maxMean: 2 },
  // A3 masked lenses: reverse band, brake half and the two trunk indicator halves, all lit.
  { name: 'vehicle-lamps', maxMean: 2 },
] as Array<{ name: string; maxMean: number }>

for (const view of views) {
  test(`WebGPU vehicle effects match WebGL: ${view.name}`, async ({ page }) => {
    await page.route('**/vehicle-parity-test', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;background:#f0f"></body>',
      }),
    )
    await page.goto('/vehicle-parity-test')
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
          const camera = new T.PerspectiveCamera(60, 480 / 320, 0.1, 200)
          const asphalt = new T.Mesh(
            new T.PlaneGeometry(60, 60).rotateX(-Math.PI / 2),
            new T.MeshStandardMaterial({ color: '#5a5a5c', roughness: 0.9 }),
          )
          scene.add(asphalt)
          const origin = new T.Vector3()
          if (view.name === 'vehicle-smoke') {
            const { TireSmoke } = await import(`/@fs/${root}/src/render/entity/tire-smoke.ts`)
            const { MuzzleSmoke } = await import(`/@fs/${root}/src/render/entity/muzzle-smoke.ts`)
            const { ExhaustSmoke } = await import(`/@fs/${root}/src/render/entity/exhaust-smoke.ts`)
            const tire = new TireSmoke()
            const muzzle = new MuzzleSmoke()
            const outlet = new T.Object3D()
            outlet.position.set(1.5, 0.4, -2)
            scene.add(outlet, tire.root, muzzle.root)
            const exhaust = new ExhaustSmoke(outlet, scene, { size: 900 })
            scene.add(exhaust.root)
            // Fixed steps: the pools fill the same way in both renderers. A stacked, standing plume
            // is the worst case of the display-space blend (see particle-nodes.ts).
            for (let i = 0; i < 40; i++) {
              tire.update(
                1 / 30,
                [
                  [-1, 0, -3],
                  [-1.6, 0, -3.4],
                ],
                1,
                origin,
              )
              // Rolling away slowly: the plume trails instead of stacking on one spot.
              outlet.position.x -= 0.06
              exhaust.update(1 / 30, true, 1, 6)
            }
            muzzle.burst(1000, [0.4, 1.2, -1.5])
            muzzle.update(1250)
            camera.position.set(0, 1.4, 2.5)
            camera.lookAt(0, 0.6, -3)
          } else if (view.name === 'vehicle-tyre-marks') {
            const { TireMarks } = await import(`/@fs/${root}/src/render/entity/tire-marks.ts`)
            const marks = new TireMarks()
            scene.add(marks.root)
            for (let i = 0; i < 80; i++) {
              const z = -i * 0.4
              const x = Math.sin(i * 0.08) * 2
              marks.update(
                0.06,
                'car',
                [
                  { contactPoint: [x - 0.8, 0, z], contactNormal: [0, 1, 0], slip: 0.9 },
                  {
                    contactPoint: [x + 0.8, 0, z],
                    contactNormal: [0, 1, 0],
                    slip: 0.7,
                    surface: 'grass',
                  },
                ],
                origin,
              )
            }
            camera.position.set(0, 3, 4)
            camera.lookAt(0, 0, -10)
          } else {
            const { createA3Lights } = await import(
              `/@fs/${root}/src/catalog/presentation/a3-lamps.ts`
            )
            // Lens names and groups as in the A3 model; one 1.2 m x 0.2 m lens per lamp.
            const lens = (name: string) => {
              const geometry = new T.PlaneGeometry(1.2, 0.2, 24, 8).translate(0.5, 0.05, 0)
              return new T.Mesh(geometry, new T.MeshStandardMaterial({ name, color: '#3a1010' }))
            }
            const model = new T.Group()
            const trunk = new T.Group()
            trunk.name = 'Luces_maletero'
            const right = new T.Group()
            right.name = 'Luz_derecha'
            const reverse = lens('PilotoFino')
            const strip = lens('Rojo 6')
            strip.position.y = 0.3
            const brake = lens('Rojo 6')
            brake.position.y = 0.05
            trunk.add(reverse, strip)
            right.add(brake)
            right.position.y = 0.6
            model.add(trunk, right)
            model.position.set(-0.5, 0.3, -1)
            createA3Lights(model)
            model.traverse((o: InstanceType<typeof T.Mesh>) => {
              const m = o.material as InstanceType<typeof T.MeshStandardMaterial> | undefined
              if (m?.emissive && m.emissive.getHex() !== 0) m.emissiveIntensity = 2.5
              if (o.isMesh) o.visible = true
            })
            scene.add(model)
            camera.position.set(0.1, 0.7, 0.6)
            camera.lookAt(0.1, 0.6, -1)
          }
          camera.updateMatrixWorld()
          const frame = () => {
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
      `vehicle parity ${view.name}: mean ${diff.meanDiff.toFixed(2)}, max ${diff.maxDiff}, ` +
        `>8: ${(diff.over8 * 100).toFixed(3)}%, >32: ${(diff.over32 * 100).toFixed(3)}%`,
    )
    expect(errors).toEqual([])
    expect(diff.over32).toBeLessThan(view.name === 'vehicle-smoke' ? 0.02 : 0.005)
    expect(diff.meanDiff).toBeLessThan(view.maxMean)
  })
}
