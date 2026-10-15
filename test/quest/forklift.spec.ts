import { expect, test } from '@playwright/test'
test('forklift loads articulated mast, three hydraulic levers and six physical pallets', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/xr.html?example=flat&solo=1&vehicle=forklift-rc&quality=minimal&diagnostics=1')
  await expect(page.locator('#loading-screen')).toHaveClass(/hidden/, { timeout: 60000 })
  const result = await page.evaluate(() => {
    const r = (window as any).nablaRuntime
    const car = r.view.objects.get('player-vehicle')
    const wheel = r.view.steeringGrab('player-vehicle').spin
    const leverObjects = [0, 1, 2].map((i) => car.getObjectByName('forklift-lever-' + i))
    const before = leverObjects.map((o) => o.getWorldPosition(r.camera.position.clone()))
    wheel.rotation.x += 0.5
    {
      if (
        leverObjects.some(
          (o, i) => o.getWorldPosition(r.camera.position.clone()).distanceTo(before[i]) > 1e-6,
        )
      )
        throw new Error('Levers moved with steering')
    }
    wheel.rotation.x -= 0.5
    const levers = [0, 1, 2].map((i) => !!car.getObjectByName('forklift-lever-' + i))
    const palletCount = r.document.entities.filter((e: any) => e.id.startsWith('pallet-')).length
    const center = car.getWorldPosition(r.camera.position.clone())
    r.loop.stop()
    r.stopAttract()
    r.renderer.setPixelRatio(1)
    r.renderer.setSize(1440, 960, false)
    r.camera.position.copy(center).add({ x: 5, y: 3, z: -6 })
    r.camera.zoom = 1.8
    r.camera.updateProjectionMatrix()
    r.camera.lookAt(center.x, center.y + 0.8, center.z - 1)
    document.getElementById('xr-main-menu')!.style.display = 'none'
    r.renderer.render(r.scene, r.camera)
    return {
      levers,
      palletCount,
      steering: !!r.view.steeringGrab('player-vehicle'),
      mast: !!car.getObjectByName('forklift-mast'),
    }
  })
  expect(errors).toEqual([])
  expect(result).toEqual({ levers: [true, true, true], palletCount: 6, steering: true, mast: true })
  await page.screenshot({ path: 'test-results/forklift.png' })
})
