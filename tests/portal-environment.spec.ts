import { test, expect } from './studio-test.js'

test('a ground portal renders orbital atmosphere and restores the main camera environment', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(async (root) => {
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const { GeographicView } = await import(String('/geography.ts'))
    const { portalEnvironment } = await import(String('/portal-environment.ts'))
    const { createPortalSurface, renderPortals } = await import(String('/portals.ts'))
    const { createPortalPair } = await import(`/@fs${root}/src/portal.ts`)
    const { createSampleScene } = await import(`/@fs${root}/src/sample.ts`)
    const document = createSampleScene()
    const geography = new GeographicView(document, () => {})
    const clock = { mode: 'fixed', at: '2026-09-23T12:00:00Z' }
    const renderer = new T.WebGLRenderer()
    renderer.setSize(128, 128)
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(60, 1, 0.1, 1000)
    camera.position.set(0, 2, 6)
    camera.lookAt(0, 2, 0)
    const origin = new T.Vector3()
    const ambient = new T.AmbientLight(0xffffff, 0.22)
    const sun = new T.DirectionalLight(0xffffff, 3.2)
    scene.add(ambient, sun)
    const surfaces = new Map()
    for (const entity of createPortalPair('earth', 'orbit', [0, 2, 0], [0, 200002, 0])) {
      const surface = createPortalSurface(entity)
      surface.mesh.position.fromArray(entity.transform.position)
      surface.mesh.quaternion.fromArray(entity.transform.rotation)
      scene.add(surface.mesh)
      surfaces.set(entity.id, surface)
    }
    geography.update(camera.position.toArray(), origin, clock)
    const mainAir = geography.atmosphere.space
    const originalFog = new T.Fog('#a6bbd5', 80, 220)
    scene.fog = originalFog
    const samples: { space: number; fog: boolean; height: number }[] = []
    const prepare = (remote: InstanceType<typeof T.PerspectiveCamera>) => {
      const restore = portalEnvironment(
        geography,
        scene,
        remote.position,
        camera.position,
        origin,
        clock,
        ambient,
        [sun],
      )
      samples.push({
        space: geography.atmosphere.space,
        fog: scene.fog !== null,
        height: remote.position.y,
      })
      geography.render(renderer, remote, remote.position)
      renderer.autoClear = false
      return restore
    }
    renderPortals(surfaces, renderer, scene, camera, prepare)
    const remoteTarget = surfaces.get('earth').target
    const pixels = new Uint8Array(128 * 128 * 4)
    renderer.readRenderTargetPixels(remoteTarget, 0, 0, 128, 128, pixels)
    const centre = [...pixels.slice((64 * 128 + 64) * 4, (64 * 128 + 64) * 4 + 3)]
    const restored =
      geography.atmosphere.space === mainAir &&
      scene.fog === originalFog &&
      ambient.intensity === 0.22 &&
      sun.intensity === 3.2
    // Force a failure during the remote scene pass; cleanup still belongs to renderPortals.
    const originalRender = renderer.render.bind(renderer)
    renderer.render = (s: InstanceType<typeof T.Scene>, c: InstanceType<typeof T.Camera>) => {
      if (s === scene) throw Error('remote render failed')
      originalRender(s, c)
    }
    let caught = false
    try {
      renderPortals(surfaces, renderer, scene, camera, prepare)
    } catch {
      caught = true
    }
    const failureRestored =
      scene.fog === originalFog &&
      geography.atmosphere.space === mainAir &&
      renderer.getRenderTarget() === null
    renderer.render = originalRender
    camera.position.set(0, 200002, -6)
    camera.lookAt(0, 200002, 0)
    geography.update(camera.position.toArray(), origin, clock)
    scene.fog = null
    renderPortals(surfaces, renderer, scene, camera, prepare)
    const fromOrbit = samples.at(-1)!
    const orbitRestored = geography.atmosphere.space === 1 && scene.fog === null
    const orbitalDocument = createSampleScene()
    orbitalDocument.geography.altitude = 400000
    const orbitalGeography = new GeographicView(orbitalDocument, () => {})
    orbitalGeography.update([0, 0, 0], origin, clock)
    const orbitalOriginSpace = orbitalGeography.atmosphere.space
    orbitalGeography.dispose()
    for (const surface of surfaces.values()) {
      surface.target.dispose()
      surface.mesh.geometry.dispose()
      surface.mesh.material.dispose()
    }
    geography.dispose()
    renderer.dispose()
    return {
      samples,
      mainAir,
      restored,
      centre,
      caught,
      failureRestored,
      fromOrbit,
      orbitRestored,
      orbitalOriginSpace,
    }
  }, process.cwd())
  expect(result.mainAir).toBe(0)
  expect(result.samples[0].space).toBe(1)
  expect(result.samples[0].fog).toBe(false)
  expect(result.samples[0].height).toBeGreaterThan(100000)
  expect(Math.max(...result.centre)).toBeLessThan(60)
  expect(result.restored).toBe(true)
  expect(result.caught).toBe(true)
  expect(result.failureRestored).toBe(true)
  expect(result.fromOrbit.space).toBe(0)
  expect(result.fromOrbit.fog).toBe(true)
  expect(result.orbitRestored).toBe(true)
  expect(result.orbitalOriginSpace).toBe(1)
})
