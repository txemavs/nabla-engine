import { expect, test } from '@playwright/test'
test('S3 low loads all lightweight parts and keeps cockpit equipment and steering', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/xr.html?example=flat&solo=1&vehicle=car&quality=minimal&diagnostics=1')
  await expect(page.locator('#loading-screen')).toHaveClass(/hidden/, { timeout: 60000 })
  const result = await page.evaluate(() => {
    const r = (window as any).nablaRuntime,
      urls: string[] = []
    r.scene.traverse((o: any) => {
      if (o.userData.assetUrl?.includes('/cars/a3/')) urls.push(o.userData.assetUrl)
    })
    const car = r.view.objects.get('player-vehicle')
    const center = car.getWorldPosition(r.camera.position.clone())
    r.loop.stop()
    r.stopAttract()
    r.renderer.setPixelRatio(1)
    r.renderer.setSize(1440, 960, false)
    r.camera.position.copy(center).add({ x: 5, y: 2.7, z: -5 })
    r.camera.zoom = 1.5
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
  expect(result.urls.filter((u) => u.endsWith('s3.wheel-low.glb'))).toHaveLength(4)
  expect(result.urls).toContain('/library/cars/a3/s3.body-low.glb')
  expect(result.urls).toContain('/library/cars/a3/s3.steering-low.glb')
  expect(result.steering).toBe(true)
  expect(result.instruments).toBeGreaterThan(0)
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/s3-low.png' })
  await page.evaluate(() => {
    const r = (window as any).nablaRuntime
    const car = r.view.objects.get('player-vehicle')
    const center = car.getWorldPosition(r.camera.position.clone())
    r.camera.position.copy(center).add({ x: 5, y: 1.8, z: 5 })
    r.camera.zoom = 3
    r.camera.updateProjectionMatrix()
    r.camera.lookAt(center.x, center.y + 0.6, center.z)
    document.getElementById('xr-main-menu')!.style.display = 'none'
    r.renderer.render(r.scene, r.camera)
  })
  await page.screenshot({ path: 'test-results/s3-low-rear.png' })
})
