import { test, expect, localCircuit } from './studio-test.js'

test('sea uses animated river waves, renders after rebasing and stays one bounded mesh', async ({
  page,
}) => {
  await localCircuit(page)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error' && /shader|GLSL|VALIDATE_STATUS/i.test(m.text())) errors.push(m.text())
  })
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { OceanSheet } = await import(`/@fs${root}/src/render/planet/ocean-sheet.ts`)
    let ready: () => void = () => {}
    const loaded = new Promise<void>((resolve) => {
      ready = resolve
    })
    const sea = new OceanSheet(ready)
    await loaded
    const scene = new T.Scene()
    scene.add(sea.mesh, new T.HemisphereLight('#ffffff', '#5f7790', 2))
    const sun = new T.DirectionalLight('#ffffff', 3)
    sun.position.set(0, 8, -12)
    scene.add(sun)
    const camera = new T.PerspectiveCamera(50, 1, 0.1, 10000)
    camera.position.set(0, 5, 12)
    camera.lookAt(0, 0, 0)
    const renderer = new T.WebGLRenderer({ logarithmicDepthBuffer: true })
    renderer.setSize(256, 256)
    const target = new T.WebGLRenderTarget(256, 256)
    renderer.setRenderTarget(target)
    const origin = { latitude: 43.37, longitude: -1.8, altitude: 125 }
    const eye = new T.Vector3(0, -120, 12),
      offset = new T.Vector3()
    camera.position.copy(eye)
    camera.lookAt(0, -125, 0)
    const capture = (time: number) => {
      sea.update(origin, eye, offset, 4000, time)
      renderer.render(scene, camera)
      const data = new Uint8Array(256 * 256 * 4)
      renderer.readRenderTargetPixels(target, 0, 0, 256, 256, data)
      return data
    }
    const first = capture(0),
      geometry = sea.mesh.geometry,
      second = capture(12000)
    let changed = 0
    for (let i = 0; i < first.length; i += 4)
      if (
        Math.abs(first[i] - second[i]) +
          Math.abs(first[i + 1] - second[i + 1]) +
          Math.abs(first[i + 2] - second[i + 2]) >
        3
      )
        changed++
    offset.set(10000, 0, -10000)
    camera.position.sub(offset)
    const shifted = capture(12000)
    let drift = 0
    for (let i = 0; i < second.length; i++)
      drift = Math.max(drift, Math.abs(second[i] - shifted[i]))
    const levels: number[] = []
    for (const level of [-5, 0, 20, 50]) {
      sea.setLevel(level)
      capture(12000)
      const p = sea.mesh.position.clone().add(offset)
      levels.push(Math.hypot(p.x, p.y + 6371000 + origin.altitude, p.z) - 6371000)
    }
    const result = {
      levels,
      changed,
      drift,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      reused: geometry === sea.mesh.geometry,
    }
    renderer.setRenderTarget(null)
    renderer.render(scene, camera)
    document.querySelector('#viewport')!.append(renderer.domElement)
    renderer.domElement.dataset.waterTest = 'true'
    sea.dispose()
    target.dispose()
    return result
  }, process.cwd())
  result.levels.forEach((level: number, i: number) =>
    expect(level).toBeCloseTo([-5, 0, 20, 50][i], 5),
  )
  expect(result.changed).toBeGreaterThan(100)
  expect(result.drift).toBeLessThan(8)
  expect(result.calls).toBe(1)
  expect(result.triangles).toBeLessThan(13000)
  expect(result.reused).toBe(true)
  expect(errors).toEqual([])
})

test('cached coastal water does not leave a fixed sheet above lowered sea', async ({ page }) => {
  await localCircuit(page)
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { seaCoverageIndex } = await import(`/@fs${root}/src/planet/sea-coverage.ts`)
    const scene = new T.Scene()
    scene.add(new T.HemisphereLight('#ffffff', '#ffffff', 3))
    const waterGeometry = new T.PlaneGeometry(20, 20).rotateX(-Math.PI / 2).translate(0, 0.027, 0)
    const filtered = seaCoverageIndex(
      new Float32Array(waterGeometry.attributes.position.array),
      new Uint32Array(waterGeometry.index!.array),
      { category: 'Surfaces', groundLayer: 11 },
    )!
    waterGeometry.setIndex(Array.from(filtered))
    const water = new T.MeshStandardMaterial({ color: '#003399' })
    scene.add(new T.Mesh(waterGeometry, water))
    // A single movable sea remains after the cached coastal polygons are removed.
    const seaGeometry = new T.PlaneGeometry(20, 20).rotateX(-Math.PI / 2)
    const sea = new T.Mesh(seaGeometry, water)
    scene.add(sea)
    const landGeometry = new T.PlaneGeometry(8, 8).rotateX(-Math.PI / 2).translate(0, -2, 0)
    const landMaterial = new T.MeshBasicMaterial({ color: '#ff0000' })
    scene.add(new T.Mesh(landGeometry, landMaterial))
    const camera = new T.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 10, 0)
    camera.up.set(0, 0, -1)
    camera.lookAt(0, 0, 0)
    const renderer = new T.WebGLRenderer()
    renderer.setSize(64, 64)
    const target = new T.WebGLRenderTarget(64, 64)
    renderer.setRenderTarget(target)
    const pixel = () => {
      renderer.render(scene, camera)
      const p = new Uint8Array(4)
      renderer.readRenderTargetPixels(target, 32, 32, 1, 1, p)
      return [...p]
    }
    const high = pixel()
    sea.position.y = -5
    const low = pixel()
    sea.position.y = 1
    const rising = pixel()
    seaGeometry.dispose()
    waterGeometry.dispose()
    landGeometry.dispose()
    water.dispose()
    landMaterial.dispose()
    target.dispose()
    renderer.dispose()
    return { high, low, rising, coastalIndices: filtered.length }
  }, process.cwd())
  expect(result.coastalIndices).toBe(0)
  expect(result.high[2]).toBeGreaterThan(result.high[0])
  expect(result.low[0]).toBeGreaterThan(200)
  expect(result.low[2]).toBeLessThan(10)
  expect(result.rising[2]).toBeGreaterThan(result.rising[0])
})
