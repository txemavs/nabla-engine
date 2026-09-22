import { test, expect } from '@playwright/test'
import { createEntity } from '../src/scene.js'

const buildings = Array.from({ length: 100 }, (_, i) => ({
  ...createEntity(`building-${i}`, 'solid', [10 + (i % 10) * 5, 2, 10 + Math.floor(i / 10) * 5]),
  color: i % 2 ? '#c75d4d' : '#009900',
  source: {
    provider: 'openstreetmap' as const,
    id: `way/${i}`,
    retrievedAt: '2026-09-23',
    tags: { building: 'yes' },
  },
}))
buildings[0].geometry!.roofFaces = [3]
buildings[0].roofColor = '#ffcc00'
const doc = {
  version: 1 as const,
  name: 'Batch test',
  entities: [...buildings, createEntity('spawn', 'spawn')],
}

test('100 unmodified buildings use fewer draw calls with the same visible image', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  const result = await page.evaluate(
    async ({ root, doc }) => {
      const T = await import(`/@fs${root}/node_modules/three/build/three.module.js`)
      const module = '/view.ts'
      const { SceneView } = await import(module)
      const view = new SceneView(doc)
      await view.ready
      const scene = new T.Scene()
      scene.add(view.root, new T.HemisphereLight('#ffffff', '#888888', 2))
      const camera = new T.PerspectiveCamera(48, 1, 0.1, 1000)
      camera.position.set(80, 65, 90)
      camera.lookAt(32, 0, 32)
      const renderer = new T.WebGLRenderer()
      renderer.setSize(256, 256)
      const target = new T.WebGLRenderTarget(256, 256)
      const render = () => {
        renderer.setRenderTarget(target)
        renderer.render(scene, camera)
        const pixels = new Uint8Array(256 * 256 * 4)
        renderer.readRenderTargetPixels(target, 0, 0, 256, 256, pixels)
        return { calls: renderer.info.render.calls, pixels }
      }
      view.batchBuildings = false
      view.limitDrawDistance(camera.position, 1000, false)
      const before = render()
      view.batchBuildings = true
      view.limitDrawDistance(camera.position, 1000, false)
      const after = render()
      let difference = 0
      for (let i = 0; i < before.pixels.length; i++)
        difference += Math.abs(before.pixels[i] - after.pixels[i])
      const owner = view.objects.get('building-0')!
      view.impacts.add(owner, doc.entities[0].transform, [10, 2, 11], [0, 0, 1])
      view.limitDrawDistance(camera.position, 1000, false)
      const marksVisible =
        owner.visible &&
        owner.children.some(
          (child: import('three').Object3D) => child.name === 'shot-impact' && child.visible,
        )
      view.dispose()
      renderer.dispose()
      target.dispose()
      return {
        marksVisible,
        before: before.calls,
        after: after.calls,
        difference: difference / before.pixels.length,
      }
    },
    { root: process.cwd(), doc },
  )
  console.log('Building batch measurement:', result)
  expect(result.marksVisible).toBe(true)
  expect(result.before).toBeGreaterThanOrEqual(100)
  expect(result.after).toBeLessThan(10)
  expect(result.difference).toBeLessThan(0.5)
})

test('selection stays read-only until explicitly made editable, and the exception survives reload', async ({
  page,
}) => {
  await page.goto('/?scene=circuit')
  await page.locator('#file').setInputFiles({
    name: 'buildings.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(doc)),
  })
  await page.locator('[data-entity-id="building-0"]').click()
  await expect(page.locator('#color')).toBeDisabled()
  await expect(page.locator('#edit-solid')).toHaveCount(0)
  await page.locator('#make-building-editable').click()
  await expect(page.locator('#color')).toBeEnabled()
  await expect(page.locator('#edit-solid')).toBeVisible()
  await page.locator('#color').fill('#335577')
  await page.locator('#color').dispatchEvent('change')
  await page.locator('#file-menu-button').click()
  await page.locator('#save').click()
  await page.reload()
  await page.locator('[data-entity-id="building-0"]').click()
  await expect(page.locator('#color')).toHaveValue('#335577')
  await expect(page.locator('#make-building-editable')).toHaveCount(0)
  await expect(page.locator('[data-entity-id="building-0"]')).toHaveCount(1)
  await page.locator('[data-entity-id="building-1"]').click()
  await expect(page.locator('#color')).toBeDisabled()
  await expect(page.locator('#make-building-editable')).toBeEnabled()
})
