import { test, expect } from '@playwright/test'

test('FSR modes compile, preserve display colour, resize and restore render state', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.route('**/fsr-check', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<body></body>' }),
  )
  await page.goto('/fsr-check')
  const result = await page.evaluate(async (root) => {
    const T = await import(String('/e2e/render-fixture.ts'))
    const { Fsr1 } = await import(`/@fs/${root}/src/render/effects/fsr1.ts`)
    const { DepthOfField } = await import(`/@fs/${root}/src/render/effects/depth-of-field.ts`)
    const renderer = new T.WebGLRenderer({ preserveDrawingBuffer: true })
    renderer.setSize(64, 48)
    renderer.toneMapping = T.ACESFilmicToneMapping
    renderer.toneMappingExposure = 0.85
    const fsr = new Fsr1(),
      dof = new DepthOfField()
    const scene = new T.Scene(),
      camera = new T.PerspectiveCamera(50, 64 / 48, 0.1, 100)
    camera.position.z = 3
    scene.add(
      new T.Mesh(new T.PlaneGeometry(20, 20), new T.MeshBasicMaterial({ color: '#808060' })),
    )
    const gl = renderer.getContext(),
      pixel = new Uint8Array(4)
    renderer.render(scene, camera)
    gl.readPixels(32, 24, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    const reference = [...pixel],
      samples = []
    for (const mode of ['ultra-quality', 'quality', 'balanced', 'performance']) {
      for (const focus of [false, true]) {
        fsr.setSettings({ mode, sharpness: 0.7 })
        fsr.begin(renderer)
        const dims = [fsr.input.width, fsr.input.height]
        if (focus) {
          dof.setFocus(0, false)
          dof.begin(renderer, fsr.inputSize)
        }
        renderer.render(scene, camera)
        if (focus) dof.present(renderer, camera, fsr.input)
        fsr.present(renderer)
        gl.readPixels(32, 24, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
        samples.push({
          mode,
          focus,
          dims,
          pixel: [...pixel],
          error: gl.getError(),
          restored: renderer.getRenderTarget() === null,
        })
      }
    }
    renderer.setSize(80, 60)
    fsr.begin(renderer)
    const resized = [fsr.input.width, fsr.input.height]
    fsr.restore(renderer)
    renderer.setSize(64, 48)
    renderer.setClearColor(0, 0)
    scene.children[0].material.transparent = true
    scene.children[0].material.opacity = 0.4
    renderer.render(scene, camera)
    gl.readPixels(32, 24, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    const alphaBefore = pixel[3]
    fsr.begin(renderer)
    renderer.render(scene, camera)
    fsr.present(renderer)
    gl.readPixels(32, 24, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    const alphaAfter = pixel[3]
    renderer.setViewport(2, 3, 40, 30)
    renderer.setScissor(4, 5, 16, 12)
    renderer.setScissorTest(true)
    renderer.autoClear = false
    fsr.begin(renderer)
    fsr.restore(renderer)
    const viewport = renderer.getViewport(new T.Vector4()).toArray(),
      scissor = renderer.getScissor(new T.Vector4()).toArray()
    const stateRestored = renderer.getScissorTest() && !renderer.autoClear
    fsr.setSettings({ mode: 'off' })
    const released = fsr.input === null
    renderer.render(scene, camera)
    fsr.dispose()
    dof.dispose()
    renderer.dispose()
    return {
      reference,
      samples,
      resized,
      released,
      alphaBefore,
      alphaAfter,
      viewport,
      scissor,
      stateRestored,
    }
  }, process.cwd())
  expect(errors).toEqual([])
  expect(result.reference[0]).toBeGreaterThan(30)
  for (const sample of result.samples) {
    expect(sample.error).toBe(0)
    expect(sample.restored).toBe(true)
    sample.pixel
      .slice(0, 3)
      .forEach((v, i) => expect(Math.abs(v - result.reference[i])).toBeLessThanOrEqual(3))
  }
  expect(Math.abs(result.alphaBefore - result.alphaAfter)).toBeLessThanOrEqual(1)
  expect(result.viewport).toEqual([2, 3, 40, 30])
  expect(result.scissor).toEqual([4, 5, 16, 12])
  expect(result.stateRestored).toBe(true)
  expect(result.resized).toEqual([40, 30])
  expect(result.released).toBe(true)
})
