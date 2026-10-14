import { expect, test } from '@playwright/test'

test('shared test host exposes VR and recovers from a denied session', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'xr', {
      value: {
        isSessionSupported: async () => true,
        requestSession: async () => {
          throw new DOMException('Permission denied', 'NotAllowedError')
        },
      },
    }),
  )
  await page.goto('/xr.html?diagnostics=1')
  const enter = page.locator('#enter-vr')
  await expect(enter).toBeEnabled({ timeout: 60000 })
  await enter.click()
  await expect(page.locator('#game-message')).toContainText('Permission denied')
  await expect(enter).toBeEnabled()
  expect(errors).toEqual([])
})

test('XR frame uses real game physics and returns to desktop after an emulated session', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/xr.html?diagnostics=1')
  await page.locator('#enter-vr').waitFor({ timeout: 60000 })
  const result = await page.evaluate(async () => {
    // Only the headset/session boundary is emulated; SceneView, Rapier and gameplay are real.
    const r = (window as any).nablaRuntime
    const manager = r.renderer.xr
    const saved = {
      loop: r.renderer.setAnimationLoop.bind(r.renderer),
      set: manager.setSession.bind(manager),
      get: manager.getSession.bind(manager),
      enabled: manager.enabled,
    }
    let scheduled: unknown = null
    r.renderer.setAnimationLoop = (callback: unknown) => {
      scheduled = callback
    }
    const session = Object.assign(new EventTarget(), {
      visibilityState: 'visible',
      inputSources: [],
      requestReferenceSpace: async () => new EventTarget(),
      end: async () => {
        session.dispatchEvent(new Event('end'))
      },
    })
    manager.setSession = async () => {}
    manager.getSession = () => session
    manager.enabled = false // no native stereo framebuffer on a desktop test runner
    try {
      await r.xr.enter({ requestSession: async () => session })
      const entered = r.xr.active && !!scheduled
      const before = [...r.game.simulation.player.position]
      const left = {
        handedness: 'left',
        targetRayMode: 'tracked-pointer',
        gamepad: {
          axes: [0, 0, 0, -1],
          buttons: Array.from({ length: 6 }, () => ({ pressed: false, value: 0 })),
        },
      }
      r.xr.tracked = [left]
      const now = performance.now()
      for (let i = 0; i < 45; i++) r.frameXR(now + (i * 1000) / 72)
      const after = [...r.game.simulation.player.position]
      const calls = r.renderer.info.render.calls
      session.visibilityState = 'visible-blurred'
      r.frameXR(now + 650)
      const pausedAt = [...r.game.simulation.player.position]
      r.frameXR(now + 850)
      const pauseDrift = Math.hypot(
        ...r.game.simulation.player.position.map((n: number, i: number) => n - pausedAt[i]),
      )
      session.visibilityState = 'visible'
      r.game.simulation.startInVehicle('player-vehicle')
      const right = {
        handedness: 'right',
        targetRayMode: 'tracked-pointer',
        gamepad: {
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 6 }, (_, i) => ({
            pressed: i === 4,
            value: Number(i === 4),
          })),
        },
      }
      r.xr.tracked = [right]
      r.frameXR(now + 900)
      const exitedVehicle = !r.game.simulation.player.vehicleId
      const aim = manager.getController(0)
      aim.dispatchEvent({ type: 'connected', data: right })
      // The same firearm/effects path must run from a tracked hand, including dry fire and reload.
      right.gamepad.buttons.forEach((button) => {
        button.pressed = false
        button.value = 0
      })
      r.equipTestSidearm()
      r.sidearm.setTrainingLoad(2, 1)
      r.frameXR(now + 910)
      const grip = manager.getControllerGrip(0)
      const pickup = r.sidearm.model
        .getObjectByName('GripSocket')
        .getWorldPosition(grip.position.clone())
      grip.position.copy(r.xr.rig.worldToLocal(pickup))
      grip.updateMatrix()
      right.gamepad.buttons[1].pressed = true
      r.frameXR(now + 920)
      const grabbed = r.xrLoadout.pistols[0].holder?.source === right
      const sounds: string[] = []
      const originalSound = r.effects.audio.weaponSound.bind(r.effects.audio)
      r.effects.audio.weaponSound = (sound: string, position: number[]) => {
        sounds.push(sound)
        originalSound(sound, position)
      }
      let shots = 0
      const originalShot = r.effects.audio.gunshot.bind(r.effects.audio)
      r.effects.audio.gunshot = (...args: unknown[]) => {
        shots++
        originalShot(...args)
      }
      const press = (down: boolean, at: number) => {
        right.gamepad.buttons[0].pressed = down
        r.frameXR(now + at)
      }
      press(true, 1000)
      press(true, 1100)
      const heldShots = shots
      press(false, 1200)
      press(true, 1300)
      const shotCasings = r.casingMotion?.count ?? 0
      const gunPose = r.sidearm.worldMuzzle()?.toArray()
      const headPitch = r.cameraState.pitch
      press(false, 1400)
      r.sidearm.setTrainingLoad(0, 0)
      press(true, 1500)
      press(false, 1600)
      await Promise.all(r.xrLoadout.pistols.map((p: any) => p.weapon.ready))
      left.gamepad.axes.fill(0)
      manager.getController(1).dispatchEvent({ type: 'connected', data: left })
      r.xr.tracked = [right, left]
      const otherGrip = manager.getControllerGrip(1)
      const place = (point: any) => {
        otherGrip.position.copy(r.xr.rig.worldToLocal(point.clone()))
        otherGrip.updateMatrix()
      }
      let at = 1700
      const tick = () => {
        r.frameXR(now + at)
        at += 30
      }
      const squeeze = (down: boolean) => {
        left.gamepad.buttons[1].pressed = down
        tick()
      }
      tick()
      // Both pistols can be carried, fired independently, and returned to their own holsters.
      place(
        r.xrLoadout.pistols[1].weapon.model
          .getObjectByName('GripSocket')
          .getWorldPosition(otherGrip.position.clone()),
      )
      squeeze(true)
      const dualHeld = r.xrLoadout.pistols.every((p: any) => !!p.holder)
      left.gamepad.buttons[0].pressed = true
      tick()
      left.gamepad.buttons[0].pressed = false
      tick()
      const dualShots = shots
      squeeze(false)
      const secondHolstered = !r.xrLoadout.pistols[1].holder
      // Extract the real empty magazine, inspect away from the well, then drop it.
      const originalMagazine = r.sidearm.state.magazineEntity
      place(r.sidearm.trackedMagazine.getWorldPosition(otherGrip.position.clone()))
      squeeze(true)
      const extracted =
        !r.sidearm.state.magazineSeated &&
        r.xrLoadout.magazines.some((m: any) => m.entity === originalMagazine && m.holder)
      otherGrip.position.x -= 0.3
      otherGrip.updateMatrix()
      tick()
      squeeze(false)
      const dropped = r.xrLoadout.magazines.find((m: any) => m.entity === originalMagazine)
      const droppedRetained = !!dropped && !dropped.holder && !dropped.pocket
      // The left chest supplies one existing magazine, never a replacement on a timer.
      const spare = r.xrLoadout.magazines.find((m: any) => m.pocket === r.xrLoadout.pockets[0])
      place(spare.root.getWorldPosition(otherGrip.position.clone()))
      squeeze(true)
      const heldSpare = spare.holder !== null
      const moveMagazineTo = (point: any) => {
        const offset = spare.root
          .getWorldPosition(otherGrip.position.clone())
          .sub(otherGrip.getWorldPosition(otherGrip.position.clone()))
        place(point.clone().sub(offset))
      }
      moveMagazineTo(r.sidearm.trackedMagazine.getWorldPosition(otherGrip.position.clone()))
      tick()
      squeeze(false)
      const sameMagazine = r.sidearm.state.magazineEntity === spare.entity
      // Rack with the same grip control, then release to feed a round.
      const slide = r.sidearm.trackedSlide
      let slidePoint: any = null
      slide.object.traverse((node: any) => {
        if (slidePoint || !node.isMesh) return
        node.geometry.computeBoundingBox()
        slidePoint = node.geometry.boundingBox
          .getCenter(otherGrip.position.clone())
          .applyMatrix4(node.matrixWorld)
      })
      place(slidePoint)
      squeeze(true)
      const slideHeld = r.xrLoadout.slideHeld(r.xrLoadout.pistols[0])
      const travel = slide.axis.clone().multiplyScalar(slide.travel * 1.2)
      const start = slide.object.parent.worldToLocal(
        otherGrip.getWorldPosition(otherGrip.position.clone()),
      )
      place(slide.object.parent.localToWorld(start.add(travel)))
      tick()
      squeeze(false)
      const loadout = {
        dualHeld,
        dualShots,
        secondHolstered,
        extracted,
        droppedRetained,
        heldSpare,
        sameMagazine,
        slideHeld,
        chamber: r.sidearm.ammo.chamber,
      }
      const pistol = {
        grabbed,
        loadout,
        heldShots,
        shots,
        shotCasings,
        sounds,
        gunPose,
        reloaded: r.sidearm.ammo.magazine > 0,
        headStable: r.cameraState.pitch === headPitch,
      }

      // The real HTML monitor accepts a muzzle touch without firing, and a free-hand ray click.
      const screen = r.xr.calibrationScreen
      screen.development = true
      await screen.monitor.ready
      screen.show()
      tick()
      const point = screen.face.localToWorld(
        grip.position.clone().set((910 / 1024 - 0.5) * 2, (0.5 - 195 / 640) * 1.25, 0.01),
      )
      const offset = r.sidearm.worldMuzzle().sub(grip.getWorldPosition(grip.position.clone()))
      grip.position.copy(r.xr.rig.worldToLocal(point.sub(offset)))
      grip.updateMatrix()
      right.gamepad.buttons[0].pressed = true
      const shotsBeforeTouch = shots
      tick()
      tick()
      const muzzleTouch = r.xr.calibration.get('hand-left').x === 0.5
      const touchDidNotFire = shots === shotsBeforeTouch
      screen.hide()
      tick()
      const closeDidNotFire = shots === shotsBeforeTouch
      right.gamepad.buttons[0].pressed = false
      tick()
      screen.show()
      tick()
      const leftAim = manager.getController(1)
      const rayTarget = screen.face.localToWorld(
        leftAim.position.clone().set((910 / 1024 - 0.5) * 2, (0.5 - 255 / 640) * 1.25, 0),
      )
      const rayStart = screen.face.localToWorld(leftAim.position.clone().set(0, 0, 0.5))
      leftAim.position.copy(r.xr.rig.worldToLocal(rayStart))
      leftAim.quaternion.setFromUnitVectors(
        leftAim.position.clone().set(0, 0, -1),
        r.xr.rig.worldToLocal(rayTarget).sub(leftAim.position).normalize(),
      )
      leftAim.updateMatrix()
      // Keep the actual finger away from the touch surface so this tests ray input only.
      otherGrip.position.set(0, 0, 0)
      otherGrip.updateMatrix()
      left.gamepad.buttons[0].pressed = true
      tick()
      left.gamepad.buttons[0].pressed = false
      tick()
      const rayTouch = r.xr.calibration.get('hand-left').y === 0.5
      for (let i = 0; i < 8 && screen.monitor.diagnostics.renders === 0; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        tick()
      }
      const monitorRendered = screen.monitor.diagnostics.renders > 0
      screen.hide()
      const touchscreen = {
        muzzleTouch,
        touchDidNotFire,
        closeDidNotFire,
        rayTouch,
        monitorRendered,
      }

      aim.position.set(0, 1.65, 0)
      const target = r.xr.exitButton.getWorldPosition(aim.position.clone())
      r.xr.rig.worldToLocal(target)
      const forward = aim.position.clone().set(0, 0, -1)
      aim.quaternion.setFromUnitVectors(forward, target.sub(aim.position).normalize())
      aim.updateMatrix()
      const exitTargetHit = r.xr.aimsAtExit(aim)
      aim.dispatchEvent({ type: 'selectstart' })
      await Promise.resolve()
      return {
        entered,
        pistol,
        touchscreen,
        exitTargetHit,
        distance: Math.hypot(after[0] - before[0], after[2] - before[2]),
        calls,
        pauseDrift,
        exitedVehicle,
        active: r.xr.active,
        loopReleased: scheduled === null,
      }
    } finally {
      r.renderer.setAnimationLoop = saved.loop
      manager.setSession = saved.set
      manager.getSession = saved.get
      manager.enabled = saved.enabled
    }
  })
  await page.evaluate(() => {
    const canvas = (window as any).nablaRuntime.xr.calibrationScreen.monitor.canvas
    canvas.id = 'calibration-monitor-preview'
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:1024px;height:640px;z-index:999999'
    document.body.append(canvas)
  })
  await page
    .locator('#calibration-monitor-preview')
    .screenshot({ path: 'test-results/xr-calibration-monitor.png' })
  expect(result.touchscreen).toEqual({
    muzzleTouch: true,
    touchDidNotFire: true,
    closeDidNotFire: true,
    rayTouch: true,
    monitorRendered: true,
  })
  expect(result.pistol.grabbed).toBe(true)
  expect(result.pistol.heldShots).toBe(1)
  expect(result.pistol.shots).toBe(3)
  expect(result.pistol.loadout).toEqual({
    dualHeld: true,
    dualShots: 3,
    secondHolstered: true,
    extracted: true,
    droppedRetained: true,
    heldSpare: true,
    sameMagazine: true,
    slideHeld: true,
    chamber: 1,
  })
  expect(result.pistol.shotCasings).toBe(2)
  expect(result.pistol.sounds).toContain('hammer')
  expect(result.pistol.sounds).toContain('dry')
  expect(result.pistol.sounds).toContain('magazine-out')
  expect(result.pistol.sounds).toContain('magazine-in')
  expect(result.pistol.sounds).toContain('slide-forward')
  expect(result.pistol.gunPose).toHaveLength(3)
  expect(result.pistol.reloaded).toBe(true)
  expect(result.pistol.headStable).toBe(true)
  expect(result.entered).toBe(true)
  expect(result.exitTargetHit).toBe(true)
  expect(result.distance).toBeGreaterThan(0.2)
  expect(result.calls).toBeGreaterThan(0)
  expect(result.pauseDrift).toBeLessThan(1e-5)
  expect(result.exitedVehicle).toBe(true)
  expect(result.active).toBe(false)
  expect(result.loopReleased).toBe(true)
  expect(errors).toEqual([])
})

for (const [vehicle, name] of [
  ['car', 'S3'],
  ['vfr800', 'Honda'],
  ['vfr800-quest', 'Honda'],
  ['white-truck', 'Camión'],
  ['carrier', 'Container'],
]) {
  test(`isolated ${vehicle} trial loads one vehicle and shows live counters`, async ({ page }) => {
    await page.goto(`/xr.html?example=flat&solo=1&vehicle=${vehicle}&diagnostics=1`)
    await page.locator('#enter-vr').waitFor({ timeout: 60000 })
    await expect(page.locator('#xr-stats')).toContainText('FPS', { timeout: 15000 })
    const vehicles = await page.evaluate(() =>
      (window as any).nablaRuntime.game.simulation.vehicleList().map((v: any) => v.entity.name),
    )
    expect(await page.evaluate(() => (window as any).nablaRuntime.weaponOwned)).toBe(true)
    expect(vehicles).toHaveLength(1)
    expect(vehicles[0]).toContain(name)
    await expect(page.locator('#game-canvas')).toHaveAttribute('data-vehicle', 'player-vehicle')
    await expect(page.locator('#xr-vehicle-tests a')).toHaveCount(10)
  })
}

test('VR calibration persists independent transforms and shares their exact values', async ({
  page,
}) => {
  await page.goto('/xr.html?example=flat&solo=1&vehicle=car&diagnostics=1')
  await page.locator('#xr-main-menu').waitFor({ timeout: 60000 })
  await page.locator('#xr-development').evaluate((el: HTMLDetailsElement) => {
    el.open = true
  })
  await page.locator('#xr-calibration summary').click()
  await page.locator('#xr-adjust-rx').fill('23')
  await page.locator('#xr-adjust-x').fill('2.5')
  await page.locator('#xr-calibration-object').selectOption('hand-right')
  await expect(page.locator('#xr-adjust-rx')).toHaveValue('0')
  await page.locator('#xr-adjust-rz').fill('-14')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (data: unknown) => {
        ;(window as any).sharedCalibration = data
      },
    })
  })
  await page.getByRole('button', { name: 'Compartir ajustes', exact: true }).click()
  const shared = await page.evaluate(() => (window as any).sharedCalibration.text)
  expect(shared).toContain('Mano derecha')
  const poses = JSON.parse(shared.slice(shared.indexOf('{'))).poses
  expect(poses['hand-left'].rx).toBe(23)
  expect(poses['hand-left'].x).toBe(2.5)
  expect(poses['hand-right'].rz).toBe(-14)
  await page.evaluate(() => {
    window.open = ((url: string) => {
      ;(window as any).whatsappUrl = url
      return null
    }) as typeof window.open
  })
  await page.getByRole('button', { name: 'WhatsApp', exact: true }).click()
  const whatsapp = await page.evaluate(() => (window as any).whatsappUrl)
  expect(new URL(whatsapp).hostname).toBe('wa.me')
  expect(new URL(whatsapp).searchParams.get('text')).toBe(shared)

  await page.reload()
  await page.locator('#xr-main-menu').waitFor({ timeout: 60000 })
  await page.locator('#xr-development').evaluate((el: HTMLDetailsElement) => {
    el.open = true
  })
  await page.locator('#xr-calibration summary').click()
  await expect(page.locator('#xr-adjust-rx')).toHaveValue('23')
  await page.getByRole('button', { name: 'Restablecer objeto', exact: true }).click()
  await expect(page.locator('#xr-adjust-rx')).toHaveValue('0')
  await page.locator('#xr-calibration-object').selectOption('hand-right')
  await expect(page.locator('#xr-adjust-rz')).toHaveValue('-14')
})
