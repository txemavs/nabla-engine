import { expect, test } from '@playwright/test'

test('Quest motorcycle preserves its articulated rig and renders the simplified model', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/xr.html?example=flat&solo=1&vehicle=vfr800-quest&quality=minimal&diagnostics=1')
  await page.locator('#enter-vr').waitFor({ timeout: 60000 })
  await page.waitForFunction(() => (window as any).nablaRuntime?.view.motorcycleRigs.size === 1)
  await expect(page.locator('#loading-screen')).toHaveClass(/hidden/, { timeout: 30000 })
  const result = await page.evaluate(() => {
    const r = (window as any).nablaRuntime
    const model = r.scene.getObjectByName('Body')
    const center = model.getWorldPosition(r.camera.position.clone())
    r.loop.stop()
    r.stopAttract()
    r.renderer.setAnimationLoop(null)
    r.renderer.setPixelRatio(1)
    r.renderer.setSize(1440, 960, false)
    r.camera.zoom = 2
    r.camera.updateProjectionMatrix()
    document.getElementById('loading-screen')!.style.display = 'none'
    r.camera.position.copy(center).add({ x: 2.8, y: 1.5, z: -2.8 })
    r.camera.lookAt(center.x, center.y + 0.6, center.z)
    r.camera.updateMatrixWorld(true)
    r.renderer.render(r.scene, r.camera)
    return {
      name: r.game.simulation.vehicleList()[0].entity.name,
      front: !!r.scene.getObjectByName('Wheel_Front'),
      rear: !!r.scene.getObjectByName('Wheel_Rear'),
      fork: !!r.scene.getObjectByName('Steering_Pivot'),
      triangles: r.renderer.info.render.triangles,
    }
  })
  expect(result.name).toContain('Quest')
  expect(result.front && result.rear && result.fork).toBe(true)
  expect(result.triangles).toBeGreaterThan(1000)
  expect(errors).toEqual([])
  await page.screenshot({ path: 'test-results/motorcycle-quest.png' })
})

for (const [quality, suffix] of [
  ['minimal', '-quest.glb'],
  ['balanced', '1999.glb'],
]) {
  test('standard motorcycle selects geometry for ' + quality, async ({ page }) => {
    await page.goto(
      '/xr.html?example=flat&solo=1&vehicle=vfr800&quality=' + quality + '&diagnostics=1',
    )
    await page.locator('#enter-vr').waitFor({ timeout: 60000 })
    await page.waitForFunction(() => (window as any).nablaRuntime?.view.motorcycleRigs.size === 1)
    const urls = await page.evaluate(() => {
      const urls: string[] = []
      ;(window as any).nablaRuntime.scene.traverse((node: any) => {
        if (node.userData.assetUrl) urls.push(node.userData.assetUrl)
      })
      return urls.filter((url) => url.includes('/motorcycles/'))
    })
    expect(urls).toHaveLength(1)
    expect(urls[0]).toContain(suffix)
  })
}

test('XR handlebar owns throttle and analog brakes only while gripped', async ({ page }) => {
  await page.goto('/xr.html?example=flat&solo=1&vehicle=vfr800&quality=minimal&diagnostics=1')
  await expect(page.locator('#loading-screen')).toHaveClass(/hidden/, { timeout: 60000 })
  const result = await page.evaluate(async () => {
    const r = (window as any).nablaRuntime,
      manager = r.renderer.xr
    r.loop.stop()
    const session = Object.assign(new EventTarget(), {
      visibilityState: 'visible',
      inputSources: [],
      requestReferenceSpace: async () => new EventTarget(),
      end: async () => session.dispatchEvent(new Event('end')),
    })
    manager.setSession = async () => {}
    manager.getSession = () => session
    manager.enabled = false
    r.renderer.setAnimationLoop = () => {}
    await r.xr.enter({ requestSession: async () => session })
    r.xr.calibrationScreen.hide()
    const hand = (side: string, index: number) => {
      const source = {
        handedness: side,
        targetRayMode: 'tracked-pointer',
        gamepad: {
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 6 }, () => ({ pressed: false, value: 0 })),
        },
      }
      manager.getController(index).dispatchEvent({ type: 'connected', data: source })
      return { source, grip: manager.getControllerGrip(index) }
    }
    const right = hand('right', 0),
      left = hand('left', 1)
    r.xr.tracked = [right.source, left.source]
    let now = performance.now()
    const tick = () => r.frameXR((now += 14))
    tick()
    const place = (h: any, side: string) => {
      const rig = r.view.motorcycleGrab('player-vehicle')
      const point = rig.bar.localToWorld(rig[side].clone())
      h.grip.position.copy(r.xr.rig.worldToLocal(point))
      h.grip.updateMatrix()
    }
    place(right, 'right')
    place(left, 'left')
    right.source.gamepad.buttons[0] = { pressed: true, value: 0.7 }
    left.source.gamepad.buttons[0] = { pressed: true, value: 0.4 }
    tick()
    const free = { ...r.game.simulation.input }
    right.source.gamepad.buttons[1] = { pressed: true, value: 1 }
    left.source.gamepad.buttons[1] = { pressed: true, value: 1 }
    tick()
    const held = { ...r.game.simulation.input }
    right.grip.rotateX(Math.PI / 4)
    right.grip.updateMatrix()
    tick()
    const gas = { ...r.game.simulation.input }
    right.source.gamepad.buttons[1] = { pressed: false, value: 0 }
    tick()
    const released = { ...r.game.simulation.input }
    const rearPedal = r.game.simulation.vehicles.get('player-vehicle').twoWheeled.pedal
    await r.xr.exit()
    return { free, held, gas, released, rearPedal }
  })
  expect(result.free.forward).toBe(0)
  expect(result.free.frontBrake).toBe(0)
  expect(result.free.rearBrake).toBe(0)
  expect(result.held.forward).toBe(0)
  expect(result.held.frontBrake).toBeCloseTo(0.7)
  expect(result.held.rearBrake).toBeCloseTo(0.4)
  expect(result.gas.forward).toBeGreaterThan(0.8)
  expect(result.released.forward).toBe(0)
  expect(result.released.frontBrake).toBe(0)
  expect(result.rearPedal).toBeCloseTo(0.4)
})
