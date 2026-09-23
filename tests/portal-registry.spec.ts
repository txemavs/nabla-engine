import { test, expect } from '@playwright/test'
import { createSampleScene } from '../src/sample.js'
import { createPortal } from '../src/portal.js'
import { createProject, visitLocation } from '../playground/studio/project.js'

test('registry locates individual portals and saves a named remote window', async ({ page }) => {
  const madrid = createSampleScene()
  madrid.name = 'Madrid'
  const a = createPortal('sol', [0, 2, 0])
  a.name = 'Puerta del Sol'
  madrid.entities.push(a)
  const zamora = createSampleScene()
  zamora.name = 'Zamora'
  zamora.geography = { ...zamora.geography!, latitude: 41.50354, longitude: -5.74665 }
  const b = createPortal('plaza', [10, 2, 0])
  b.name = 'Plaza Mayor'
  zamora.entities.push(b)
  const project = visitLocation(createProject(madrid), zamora)
  await page.goto('/?scene=circuit&studio=desktop')
  await page.locator('#file').setInputFiles({
    name: 'Cities.nabla.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(project)),
  })
  await page.locator('#portal-registry-button').click()
  await expect(page.locator('#portal-registry-list')).toContainText('Puerta del Sol · Madrid')
  await page
    .locator('#portal-registry-list')
    .getByRole('button', { name: 'Plaza Mayor · Zamora' })
    .click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(page.locator('#name')).toHaveValue('Plaza Mayor')
  const remote = await page
    .locator('#portal-destination option')
    .evaluateAll(
      (options) =>
        (options as HTMLOptionElement[]).find((o) => o.text === 'Puerta del Sol · Madrid')!.value,
    )
  await page.locator('#portal-destination').selectOption(remote)
  await page.locator('#portal-mode').selectOption('window')
  await expect(page.locator('#portal-mode option[value="open"]')).toBeDisabled()
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('nabla.project.v1')!))
  expect(saved.connections).toHaveLength(1)
  expect(saved.connections[0].mode).toBe('window')
  await page.screenshot({ path: 'test-results/portal-registry-window.png' })
})

test('remote view renders another scene in its own frame and restores renderer state', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const pixel = await page.evaluate(async (root) => {
    const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
    const { createPortalSurface, renderPortals } = await import(String('/portals.ts'))
    const { createPortal } = await import(`/@fs${root}/src/portal.ts`)
    const scene = new T.Scene(),
      other = new T.Scene()
    scene.background = new T.Color('red')
    other.background = new T.Color('blue')
    const a = createPortalSurface(createPortal('a')),
      b = createPortalSurface(createPortal('b'))
    scene.add(a.mesh)
    other.add(b.mesh)
    b.mesh.position.set(2000, 0, 4000)
    other.updateMatrixWorld(true)
    const renderer = new T.WebGLRenderer()
    renderer.setSize(64, 64)
    const camera = new T.PerspectiveCamera(60, 1, 0.1, 100)
    camera.position.z = 5
    let position: number[] = []
    renderPortals(
      new Map([['a', a]]),
      renderer,
      scene,
      camera,
      () => {
        throw Error('Wrong background')
      },
      new Map([
        [
          'a',
          {
            destination: b,
            scene: other,
            background: (_r: unknown, c: { position: { toArray(): number[] } }) => {
              position = c.position.toArray()
            },
          },
        ],
      ]),
    )
    const pixels = new Uint8Array(4)
    renderer.readRenderTargetPixels(a.target, 32, 32, 1, 1, pixels)
    const restored = renderer.getRenderTarget() === null && renderer.autoClear && b.mesh.visible
    for (const s of [a, b]) {
      s.mesh.geometry.dispose()
      s.mesh.material.dispose()
      s.target.dispose()
    }
    renderer.dispose()
    return { pixels: [...pixels], position, restored }
  }, process.cwd())
  expect(pixel.pixels[2]).toBeGreaterThan(240)
  expect(pixel.pixels[0]).toBeLessThan(5)
  expect(pixel.position[0]).toBeCloseTo(2000)
  expect(pixel.position[2]).toBeCloseTo(3995)
  expect(pixel.restored).toBe(true)
})
