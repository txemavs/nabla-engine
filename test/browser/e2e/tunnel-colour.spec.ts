import { test, expect } from '@playwright/test'

test('aim blur preserves sky and central transparent glass colour', async ({ page }) => {
  await page.route('**/tunnel-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/tunnel-check')
  const samples = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { GameRenderPipeline } = await import(`/@fs/${root}/src/runtime/render-pipeline.ts`)
    const renderer = new T.WebGLRenderer({
      logarithmicDepthBuffer: true,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(128, 128)
    renderer.toneMapping = T.ACESFilmicToneMapping
    const scene = new T.Scene()
    scene.background = new T.Color('#8ea7c9')
    const glass = new T.Mesh(
      new T.PlaneGeometry(2, 2),
      new T.MeshBasicMaterial({
        color: '#214636',
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      }),
    )
    glass.position.z = -3
    scene.add(glass)
    const camera = new T.PerspectiveCamera(60, 1, 0.1, 1000)
    const pipeline = new GameRenderPipeline()
    const frame = {
      renderer,
      scene,
      camera,
      origin: new T.Vector3(),
      eye: new T.Vector3(),
      view: { portals: new Map(), renderMirrors() {} },
      sky: { enabled: false, setViewAspect() {} },
      shadows: { update() {} },
      monitors: { prepare() {}, finish() {} },
      lights: [],
      time: 0,
      mirrorVehicle: null,
      shadowsEnabled: true,
      cull() {},
      tunnelFocus: 0,
    }
    const gl = renderer.getContext()
    const values = []
    for (const progress of [0, 0.0001, 0.25, 0.75, 1, 0]) {
      frame.tunnelFocus = progress
      pipeline.render(frame)
      const glassPixel = new Uint8Array(4),
        skyPixel = new Uint8Array(4)
      gl.readPixels(64, 64, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, glassPixel)
      gl.readPixels(10, 120, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, skyPixel)
      values.push({ glass: [...glassPixel], sky: [...skyPixel] })
    }
    pipeline.dispose()
    glass.geometry.dispose()
    glass.material.dispose()
    renderer.dispose()
    return values
  }, process.cwd())
  expect(samples[0].sky[2]).toBeGreaterThan(50)
  expect(samples[0].glass).not.toEqual(samples[0].sky)
  for (const sample of samples) expect(sample).toEqual(samples[0])
})
