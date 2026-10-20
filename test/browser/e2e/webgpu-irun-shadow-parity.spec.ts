import { test, expect } from '@playwright/test'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'

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
// Real Irun geometry: cell 15/16211/12003 (terrain + OSM buildings GLBs). They are not in the
// repo (11 MB); point NABLA_IRUN_TILES at the cell folder of a local z15 tree to run this.
const tiles = process.env.NABLA_IRUN_TILES
const files = {
  terrain: 'terrain-ad8550fe0459ce7d.glb',
  buildings: 'buildings-osm-8b7a0e12579eb3ab.glb',
}
const views = [
  // Looking down-sun, where the buildings throw their shadows: 40 m up, then 12 m over the roofs.
  { name: 'irun-shadows-high', eye: [0, 40, 0], look: [180, 0, 160], maxMean: 2 },
  { name: 'irun-shadows-low', eye: [-100, 12, -100], look: [60, 0, 60], maxMean: 2 },
] as Array<{
  name: string
  eye: [number, number, number]
  look: [number, number, number]
  maxMean: number
}>

for (const view of views) {
  test(`WebGPU cascaded shadows match WebGL on Irun: ${view.name}`, async ({ page }) => {
    test.skip(
      !tiles || !Object.values(files).every((f) => existsSync(`${tiles}/${f}`)),
      'Set NABLA_IRUN_TILES to the local 15/16211/12003 cell folder',
    )
    await page.route('**/irun-tile/*', (r) =>
      r.fulfill({
        contentType: 'model/gltf-binary',
        body: readFileSync(`${tiles}/${r.request().url().split('/').pop()}`),
      }),
    )
    await page.route('**/irun-shadow-parity-test', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;background:#f0f"></body>',
      }),
    )
    await page.goto('/irun-shadow-parity-test')
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
      async ({ root, view, files }) => {
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
          const { GLTFLoader } = await import(
            `/@fs/${root}/node_modules/three/examples/jsm/loaders/GLTFLoader.js`
          )
          // Plain materials: the photo drapes are not part of this check, the cascades are.
          const terrain = new T.MeshStandardMaterial({ color: '#8a8f7a', roughness: 1 })
          const facade = new T.MeshStandardMaterial({ color: '#d9cfc0', roughness: 0.9 })
          materials.push(terrain, facade)
          const loader = new GLTFLoader()
          for (const [kind, file] of Object.entries(files)) {
            const gltf = await loader.loadAsync(`/irun-tile/${file}`)
            gltf.scene.traverse((o: InstanceType<typeof T.Mesh>) => {
              if (!o.isMesh) return
              o.material = kind === 'terrain' ? terrain : facade
              o.castShadow = o.receiveShadow = true
            })
            scene.add(gltf.scene)
          }
          scene.updateMatrixWorld(true)
          // Eye and target heights are above the ground under them.
          const ray = new T.Raycaster()
          const ground = (x: number, z: number) => {
            ray.set(new T.Vector3(x, 1000, z), new T.Vector3(0, -1, 0))
            return ray.intersectObjects(scene.children, true)[0]?.point.y ?? 0
          }
          const camera = new T.PerspectiveCamera(60, 480 / 320, 0.1, 4000)
          const [ex, ey, ez] = view.eye
          const [lx, ly, lz] = view.look
          camera.position.set(ex, ground(ex, ez) + ey, ez)
          camera.lookAt(lx, ground(lx, lz) + ly, lz)
          camera.updateMatrixWorld()
          const shadows = new ShadowManager()
          shadows.init({
            camera,
            scene,
            lightDirection: new T.Vector3(0.55, -0.45, 0.7).normalize(),
            lightIntensity: 3.2,
            tier: shadowTiers[2048],
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
      { root: process.cwd(), view, files },
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
      `irun shadow parity ${view.name}: mean ${diff.meanDiff.toFixed(2)}, max ${diff.maxDiff}, ` +
        `>8: ${(diff.over8 * 100).toFixed(3)}%, >32: ${(diff.over32 * 100).toFixed(3)}%`,
    )
    expect(errors).toEqual([])
    expect(diff.over32).toBeLessThan(0.005)
    expect(diff.meanDiff).toBeLessThan(view.maxMean)
  })
}
