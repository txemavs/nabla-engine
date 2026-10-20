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
  // Ground cloud shadow on the cascaded sun (patchGroundCloudShadow).
  { name: 'surface-cloud-shadow', maxMean: 2 },
  // Asphalt contrast at 2 on a photo-like drape (withAsphaltContrast).
  { name: 'surface-asphalt', maxMean: 2 },
  // River and sea wave normals, sea glint and shadowed flat colour.
  { name: 'surface-river', maxMean: 2 },
  { name: 'surface-sea', maxMean: 2 },
  // Instanced tree cards with the lifted, view-faded crown and alpha-tested shadows.
  { name: 'surface-trees', maxMean: 2 },
] as Array<{ name: string; maxMean: number }>

for (const view of views) {
  test(`WebGPU surface patches match WebGL: ${view.name}`, async ({ page }) => {
    await page.route('**/surface-parity-test', (r) =>
      r.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><body style="margin:0;background:#f0f"></body>',
      }),
    )
    await page.goto('/surface-parity-test')
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
          // Black: WebGPU tone-maps a background colour, WebGL clears to it as is.
          scene.background = new T.Color(0x000000)
          scene.add(new T.HemisphereLight('#c8d8ff', '#6b5a48', 0.9))
          const materials: InstanceType<typeof T.Material>[] = []
          const camera = new T.PerspectiveCamera(60, 480 / 320, 0.1, 4000)
          const sunDir = new T.Vector3(0.55, -0.45, 0.7).normalize()
          const plane = (material: InstanceType<typeof T.Material>, size = 400) => {
            const mesh = new T.Mesh(new T.PlaneGeometry(size, size).rotateX(-Math.PI / 2), material)
            mesh.receiveShadow = true
            scene.add(mesh)
            materials.push(material)
            return mesh
          }
          const blocks = (material: InstanceType<typeof T.Material>) => {
            materials.push(material)
            for (let i = 0; i < 12; i++) {
              const box = new T.Mesh(new T.BoxGeometry(3, 4 + (i % 3) * 3, 3), material)
              box.position.set(((i * 7) % 11) * 4 - 20, 3, -12 - i * 5)
              box.castShadow = box.receiveShadow = true
              scene.add(box)
            }
          }
          const photo = () => {
            // Orthophoto-like: dark asphalt band with bright paint stripes on grass.
            const c = document.createElement('canvas')
            c.width = c.height = 256
            const g = c.getContext('2d')!
            g.fillStyle = '#5d7044'
            g.fillRect(0, 0, 256, 256)
            g.fillStyle = '#6f6c66'
            g.fillRect(64, 0, 128, 256)
            g.fillStyle = '#eeeeea'
            for (let y = 0; y < 256; y += 32) g.fillRect(124, y, 8, 18)
            g.fillStyle = '#e8c840'
            g.fillRect(70, 0, 4, 256)
            const t = new T.CanvasTexture(c)
            t.colorSpace = T.SRGBColorSpace
            return t
          }
          const waterNormal = () => {
            const t = new T.TextureLoader().load('/geography/water-normal.png')
            t.wrapS = t.wrapT = T.RepeatWrapping
            return t
          }
          const sunLight = () => {
            const light = new T.DirectionalLight('#ffffff', 2.5)
            light.position.copy(sunDir).negate().multiplyScalar(100)
            scene.add(light, light.target)
          }
          let withShadows = false
          const { groundCloudShadow } = await import(
            `/@fs/${root}/src/render/planet/artistic-clouds.ts`
          )
          groundCloudShadow.amount.value = 0
          if (view.name === 'surface-cloud-shadow') {
            withShadows = true
            groundCloudShadow.sun.value.copy(sunDir).negate()
            groundCloudShadow.amount.value = 0.45
            groundCloudShadow.coverage.value = 1
            groundCloudShadow.day.value = 1
            groundCloudShadow.dayHours.value = 0.3
            // The GLSL patch only lands on Lambert/Toon programs; Standard stays clear in both.
            plane(new T.MeshLambertMaterial({ color: '#8a8f7a' }), 120000).position.x = -60000
            plane(
              new T.MeshStandardMaterial({ color: '#8a8f7a', roughness: 1 }),
              120000,
            ).position.x = 60000
            blocks(new T.MeshStandardMaterial({ color: '#d9cfc0', roughness: 0.9 }))
            // Cumulus cells are kilometres wide: look down from 3 km.
            camera.far = 80000
            camera.updateProjectionMatrix()
            camera.position.set(0, 6000, 0)
            camera.lookAt(0, 0, -12000)
          } else if (view.name === 'surface-asphalt') {
            const { withAsphaltContrast, setAsphaltContrast } = await import(
              `/@fs/${root}/src/render/planet/ground-material.ts`
            )
            sunLight()
            const material = withAsphaltContrast(
              new T.MeshStandardMaterial({ map: photo(), color: '#c2c2c2', roughness: 1 }),
            )
            setAsphaltContrast(2)
            plane(material, 40)
            camera.position.set(0, 14, 16)
            camera.lookAt(0, 0, -4)
          } else if (view.name === 'surface-river') {
            const { waterWaves } = await import(`/@fs/${root}/src/render/planet/water-material.ts`)
            sunLight()
            const material = new T.MeshStandardMaterial({
              color: '#3d6b80',
              roughness: 0.3,
              metalness: 0.03,
            })
            waterWaves(material, waterNormal(), { value: 7 })
            plane(material)
            camera.position.set(0, 6, 0)
            camera.lookAt(new T.Vector3(0, 0, -1).multiplyScalar(30).add(new T.Vector3(8, 0, 0)))
          } else if (view.name === 'surface-sea') {
            withShadows = true
            const { SeaWater } = await import(`/@fs/${root}/src/render/planet/water.ts`)
            const sea = new SeaWater({ latitude: 43.34, longitude: -1.79 })
            ;(sea as unknown as { time: { value: number } }).time.value = 7
            // Low sun ahead of the camera: the glint lies on the water in view.
            sunDir.set(0.1, -0.35, 1).normalize()
            sea.setSun(sunDir.clone().negate(), 1)
            plane(sea.surface(), 4000)
            blocks(new T.MeshStandardMaterial({ color: '#d9cfc0', roughness: 0.9 }))
            camera.position.set(0, 10, 30)
            camera.lookAt(0, 0, -80)
          } else if (view.name === 'surface-trees') {
            withShadows = true

            const { treeInstances } = await import(`/@fs/${root}/src/render/planet/vegetation.ts`)
            const c = document.createElement('canvas')
            c.width = c.height = 128
            const g = c.getContext('2d')!
            g.fillStyle = '#5a3d22'
            g.fillRect(58, 70, 12, 58)
            g.fillStyle = '#3f6b2e'
            g.beginPath()
            g.arc(64, 52, 44, 0, Math.PI * 2)
            g.fill()
            const map = new T.CanvasTexture(c)
            map.colorSpace = T.SRGBColorSpace
            const material = new T.MeshStandardMaterial({
              map,
              alphaTest: 0.5,
              side: T.DoubleSide,
              roughness: 1,
            })
            const vegetation = Array.from({ length: 24 }, (_, i) => ({
              position: [((i * 7) % 9) * 5 - 20, 0, -8 - Math.floor(i / 3) * 6] as [
                number,
                number,
                number,
              ],
              size: [4 + (i % 3), 4 + (i % 5) * 2] as [number, number],
            }))
            const trees = treeInstances(vegetation as never, material)
            scene.add(trees)
            blocks(new T.MeshStandardMaterial({ color: '#d9cfc0' }))
            materials.push(material)
            plane(new T.MeshStandardMaterial({ color: '#8a8f7a', roughness: 1 }))
            camera.position.set(0, 9, 8)
            camera.lookAt(0, 2, -25)
          }
          camera.updateMatrixWorld()
          const shadows = new ShadowManager()
          if (withShadows) {
            shadows.init({
              camera,
              scene,
              lightDirection: sunDir,
              lightIntensity: 3.2,
              tier: shadowTiers[2048],
              nodeKit: webgpuNodeKit(renderer),
            })
            for (const material of materials) shadows.setupMaterial(material)
          }
          const frame = () => {
            if (withShadows) shadows.update(camera, new T.Vector3())
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
      `surface parity ${view.name}: mean ${diff.meanDiff.toFixed(2)}, max ${diff.maxDiff}, ` +
        `>8: ${(diff.over8 * 100).toFixed(3)}%, >32: ${(diff.over32 * 100).toFixed(3)}%`,
    )
    expect(errors).toEqual([])
    expect(diff.over32).toBeLessThan(0.005)
    expect(diff.meanDiff).toBeLessThan(view.maxMean)
  })
}
