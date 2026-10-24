import { expect, test } from '@playwright/test'

test('GPU rain draws once, animates, survives origin rebasing and disappears at zero', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/rain-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/rain-check')
  const result = await page.evaluate(
    async (root) => {
      const THREE = await import(`/@fs/${root}/node_modules/three/build/three.module.js`)
      const { GpuRain } = await import(`/@fs/${root}/src/render/effects/rain.ts`)
      const rain = new GpuRain()
      const renderer = new THREE.WebGLRenderer({ logarithmicDepthBuffer: true })
      renderer.setSize(512, 512)
      const target = new THREE.WebGLRenderTarget(512, 512)
      renderer.setRenderTarget(target)
      const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 1000)
      const eye = new THREE.Vector3(100, 10, 100)
      const origin = new THREE.Vector3()
      const pixels = () => {
        const bytes = new Uint8Array(512 * 512 * 4)
        renderer.readRenderTargetPixels(target, 0, 0, 512, 512, bytes)
        return bytes
      }
      const draw = (time: number, amount: number) => {
        camera.position.copy(eye).sub(origin)
        rain.update(time, eye, origin, amount, 1)
        renderer.render(rain.scene, camera)
        return pixels()
      }
      try {
        const first = draw(12, 1)
        const calls = renderer.info.render.calls
        const second = draw(12.1, 1)
        origin.copy(eye)
        const rebased = draw(12, 1)
        const wrapped = draw(492, 1)
        const off = draw(12, 0)
        // A wall closer than the near fade must occlude every drop behind it.
        const wallScene = new THREE.Scene()
        const wallGeometry = new THREE.PlaneGeometry(100, 100)
        const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x000000 })
        const wall = new THREE.Mesh(wallGeometry, wallMaterial)
        wall.position.z = -0.5
        wallScene.add(wall)
        renderer.render(wallScene, camera)
        renderer.autoClear = false
        rain.update(12, eye, origin, 1, 1)
        renderer.render(rain.scene, camera)
        const occluded = pixels()
        wallGeometry.dispose()
        wallMaterial.dispose()
        const lit = (data: Uint8Array) =>
          data.filter((value, index) => index % 4 !== 3 && value > 0).length
        return {
          calls,
          lit: lit(first),
          off: lit(off),
          occluded: lit(occluded),
          animated: first.some((v, i) => v !== second[i]),
          rebaseDifference: first.reduce((sum, v, i) => sum + Math.abs(v - rebased[i]), 0),
          wrapMatches: rebased.every((v, i) => v === wrapped[i]),
        }
      } finally {
        rain.dispose()
        target.dispose()
        renderer.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(errors).toEqual([])
  expect(result.calls).toBe(1)
  expect(result.lit).toBeGreaterThan(100)
  expect(result.off).toBe(0)
  expect(result.occluded).toBe(0)
  expect(result.animated).toBe(true)
  expect(result.rebaseDifference).toBeLessThan(1000)
  expect(result.wrapMatches).toBe(true)
})

test('linked weather suppresses dry rain, draws distant curtains and keeps Off absolute', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.route('**/storm-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/storm-check')
  const result = await page.evaluate(
    async (root) => {
      const THREE = await import(`/@fs/${root}/node_modules/three/build/three.module.js`)
      const { GpuRain } = await import(`/@fs/${root}/src/render/effects/rain.ts`)
      const rain = new GpuRain()
      const renderer = new THREE.WebGLRenderer({ logarithmicDepthBuffer: true })
      const target = new THREE.WebGLRenderTarget(512, 512)
      renderer.setRenderTarget(target)
      const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 12000)
      const eye = new THREE.Vector3(0, 3, 0),
        origin = new THREE.Vector3()
      camera.position.copy(eye)
      const pixels = () => {
        renderer.render(rain.scene, camera)
        const data = new Uint8Array(512 * 512 * 4)
        renderer.readRenderTargetPixels(target, 0, 0, 512, 512, data)
        return data.filter((v, i) => i % 4 !== 3 && v > 0).length
      }
      try {
        rain.update(10, eye, origin, 1, 1, { linked: true, clouds: true, amount: 0, storm: 1 })
        const clear = pixels()
        rain.update(10, eye, origin, 1, 1, { linked: true, clouds: true, amount: 1, storm: 0 })
        const calm = pixels()
        rain.update(10, eye, origin, 1, 1, { linked: true, clouds: true, amount: 1, storm: 1 })
        const wet = pixels(),
          calls = renderer.info.render.calls
        rain.mesh.visible = false
        const curtains = pixels()
        const curtainCalls = renderer.info.render.calls
        rain.mesh.visible = true
        rain.update(10, eye, origin, 0, 1, { linked: true, clouds: true, amount: 1, storm: 1 })
        const off = pixels()
        rain.update(10, eye, origin, 1, 1, { linked: false, clouds: false, amount: 0, storm: 0 })
        const manual = pixels()
        return { clear, calm, wet, curtains, calls, curtainCalls, off, manual }
      } finally {
        rain.dispose()
        target.dispose()
        renderer.dispose()
      }
    },
    process.cwd().replaceAll('\\', '/'),
  )
  expect(errors).toEqual([])
  expect(result.clear).toBe(0)
  expect(result.calm).toBe(0)
  expect(result.off).toBe(0)
  expect(result.wet).toBeGreaterThan(100)
  expect(result.manual).toBeGreaterThan(100)
  expect(result.curtains).toBeGreaterThan(100)
  expect(result.calls).toBe(2)
  expect(result.curtainCalls).toBe(1)
})
