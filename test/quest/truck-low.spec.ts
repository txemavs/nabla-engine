import { expect, test } from '@playwright/test'
test('Truck low loads all lightweight parts and keeps cockpit equipment and steering', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/xr.html?example=flat&solo=1&vehicle=white-truck&quality=minimal&diagnostics=1')
  await expect(page.locator('#loading-screen')).toHaveClass(/hidden/, { timeout: 60000 })
  const result = await page.evaluate(() => {
    const r = (window as any).nablaRuntime,
      urls: string[] = []
    r.scene.traverse((o: any) => {
      if (o.userData.assetUrl?.includes('/trucks/white-truck/assets/'))
        urls.push(o.userData.assetUrl)
    })
    const car = r.view.objects.get('player-vehicle')
    const center = car.getWorldPosition(r.camera.position.clone())
    r.loop.stop()
    r.stopAttract()
    r.renderer.setPixelRatio(1)
    r.renderer.setSize(1440, 960, false)
    r.camera.position.copy(center).add({ x: 10, y: 5, z: -10 })
    r.camera.zoom = 3
    r.camera.updateProjectionMatrix()
    r.camera.lookAt(center.x, center.y + 0.5, center.z)
    document.getElementById('loading-screen')!.style.display = 'none'
    r.renderer.render(r.scene, r.camera)
    return {
      urls,
      steering: !!r.view.steeringGrab('player-vehicle'),
      instruments: r.view.instruments.size,
    }
  })
  expect(result.urls.filter((u) => /wheel\.(front|rear)-low.glb$/.test(u))).toHaveLength(4)
  expect(result.urls).toContain('/library/trucks/white-truck/assets/tractor.low.glb')
  expect(result.urls).toContain('/library/trucks/white-truck/assets/steering.low.glb')
  expect(result.steering).toBe(true)
  expect(result.instruments).toBeGreaterThan(0)
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/truck-low.png' })
  await page.evaluate(() => {
    const r = (window as any).nablaRuntime
    const car = r.view.objects.get('player-vehicle')
    const center = car.getWorldPosition(r.camera.position.clone())
    r.camera.position.copy(center).add({ x: 3, y: 0.6, z: 9 })
    r.camera.zoom = 3
    r.camera.updateProjectionMatrix()
    r.camera.lookAt(center.x, center.y - 0.3, center.z + 2)
    document.getElementById('xr-main-menu')!.style.display = 'none'
    r.renderer.render(r.scene, r.camera)
  })
  await page.screenshot({ path: 'test-results/truck-low-rear.png' })
})
