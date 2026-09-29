import { test, expect } from '@playwright/test'
test('S3 front strips blink with rear signals and reverse uses its opaque insert', async ({
  page,
}) => {
  await page.route('**/lights-preview', (r) =>
    r.fulfill({ contentType: 'text/html', body: '<!doctype html><body style="margin:0"></body>' }),
  )
  await page.goto('/lights-preview')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { assets } = await import(`/@fs${root}/src/render/entity/assets.ts`)
    const { createA3Lights } = await import(`/@fs${root}/src/catalog/presentation/a3-lamps.ts`)
    const model = await assets.instantiate('/world/car.audi.a3.cabrio.glb')
    const lights = createA3Lights(model)
    const materials = (group: string, name: string) => {
      const found: import('three').MeshStandardMaterial[] = []
      model.getObjectByName(group)?.traverse((o: import('three').Object3D) => {
        if (
          o instanceof T.Mesh &&
          ((o as import('three').Mesh).material as import('three').Material).name === name
        )
          found.push((o as import('three').Mesh).material as import('three').MeshStandardMaterial)
      })
      return found
    }
    const left = materials('Foco_Izquierdo', 'FocoC')[0],
      right = materials('Foco_Derecho', 'FocoC')[0]
    const reverse = materials('Luces_Maletero', 'PilotoFino')[0]
    const state = { powered: true, braking: false, reversing: true }
    lights.toggle(-1)
    lights.update(state, 0)
    const on = {
      left: left.emissiveIntensity,
      right: right.emissiveIntensity,
      color: left.emissive.getHexString(),
      reverse: reverse.emissiveIntensity,
    }
    const renderer = new T.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
    renderer.setSize(950, 600)
    document.body.append(renderer.domElement)
    const scene = new T.Scene()
    scene.background = new T.Color('#46515b')
    scene.add(model, new T.HemisphereLight(0xffffff, 0x777777, 2))
    const camera = new T.PerspectiveCamera(40, 950 / 600, 0.1, 100)
    camera.position.set(3, 1.5, 5)
    camera.lookAt(0, 0.65, 1.5)
    renderer.render(scene, camera)
    ;(window as unknown as { rear: () => void }).rear = () => {
      camera.position.set(-2, 1.4, -5)
      camera.lookAt(0, 0.8, -1.9)
      renderer.render(scene, camera)
    }
    lights.update(state, 500)
    const off = left.emissiveIntensity
    lights.update(state, 0)
    return { on, off, reverseOpaque: !reverse.transparent }
  }, process.cwd())
  expect(result.on.left).toBe(2)
  expect(result.on.right).toBe(0.65)
  expect(result.on.color).toBe('ff7300')
  expect(result.off).toBe(0)
  expect(result.on.reverse).toBe(2)
  expect(result.reverseOpaque).toBe(true)
  await page.screenshot({ path: 'test-results/s3-front-signal.png' })
  await page.evaluate(() => (window as unknown as { rear: () => void }).rear())
  await page.screenshot({ path: 'test-results/s3-reverse.png' })
})
