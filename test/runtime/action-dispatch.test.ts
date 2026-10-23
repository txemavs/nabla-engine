import { describe, expect, it, vi } from 'vitest'
import { Vector3 } from 'three'
import { RuntimeActionDispatch, type RuntimeActionHost } from '../../src/runtime/action-dispatch.js'
import { createRuntimeText } from '../../src/runtime/messages.js'

function fixture() {
  const sim = {
    player: { vehicleId: null as string | null },
    renderPlayerPosition: [0, 0, 0],
    nearestVehicle: vi.fn((): string | null => 'car'),
    setStance: vi.fn(),
    setEngineMode: vi.fn(() => 'engine changed'),
  }
  const host = {
    inspector: false,
    disposed: false,
    session: { simulation: sim as typeof sim | null, state: 'playing' },
    game: { dispatch: vi.fn((_action: string): string | undefined => 'confirmation') },
    keys: { values: new Set<string>() },
    controlContext: { mode: 'walk', weapon: false, menu: false },
    document: { entities: [{ id: 'car' }, { id: 'part', parentId: 'car' }] },
    view: {
      laser: { enabled: false },
      signal: vi.fn(),
      cycleVehicleLights: vi.fn(() => 'low'),
      toggleVehicleGps: vi.fn(() => true),
      toggleVehicleHighBeam: vi.fn(() => false),
      toggleVehicleMenu: vi.fn(() => true),
      vehicleMenu: vi.fn(),
    },
    camera: { position: new Vector3() },
    audio: { horn: vi.fn(), weaponSound: vi.fn() },
    nearbyPickup: vi.fn((): object | null => null),
    inventory: { take: vi.fn() },
    pickupModels: new Map(),
    pickupVisible: () => true,
    loadout: null as { collect: ReturnType<typeof vi.fn> } | null,
    loadoutWeaponFor: vi.fn(() => 'pistol'),
    bodySlotHost: null,
    wheelDebug: { toggle: vi.fn() },
    gallery: { reset: vi.fn() },
    drivingPrepared: new Set<string>(),
    xrActive: false,
    weaponOwned: true,
    headlampEnabled: false,
    weaponLight: null,
    sidearm: {
      isAiming: false,
      state: { reload: 'none', magazineSeated: true },
      inspect: vi.fn(),
      toggleLaser: vi.fn(() => true),
      setLightEnabled: vi.fn(),
    },
    weaponDrawn: false,
    heldDrawn: false,
    ownedWeaponId: null as string | null,
    fireRequested: false,
    triggerDown: false,
    weaponLightOn: false,
    magazineAction: null,
    text: createRuntimeText('en'),
    report: vi.fn(),
    setHeadlamp: vi.fn(),
    prewarmVehicle: vi.fn(async () => {}),
    skipStartCamera: vi.fn(),
    adjustFov: vi.fn(() => 'FOV changed'),
  }
  const actions = new RuntimeActionDispatch(host as unknown as RuntimeActionHost)
  return { host, sim, actions }
}

it('preserves weapon overrides, aiming and menu priority over world actions', () => {
  const { host, actions } = fixture()
  host.weaponDrawn = host.controlContext.weapon = true
  actions.dispatch('gps')
  expect(host.view.laser.enabled).toBe(true)
  expect(host.report).toHaveBeenLastCalledWith('Laser on')
  actions.dispatch('hitch')
  expect(host.magazineAction).toBe('release')
  host.sidearm.isAiming = true
  actions.dispatch('interact')
  expect(host.nearbyPickup).not.toHaveBeenCalled()
  host.controlContext.menu = true
  actions.dispatch('lights')
  expect(host.sidearm.setLightEnabled).not.toHaveBeenCalled()
  expect(host.game.dispatch).not.toHaveBeenCalled()
})

it('gives a kept pickup priority over entering a vehicle', () => {
  const { host, actions } = fixture()
  const item = { id: 'pickup', itemId: 'pistol', name: 'Pistol' }
  host.nearbyPickup.mockReturnValue(item)
  host.inventory.take.mockReturnValue(item)
  host.loadout = { collect: vi.fn(() => ({ ok: true })) }
  actions.dispatch('interact')
  expect(host.loadout.collect).toHaveBeenCalledWith({ type: 'pistol', count: 1 })
  expect(host.ownedWeaponId).toBe('pistol')
  expect(host.report.mock.calls[0][0]).toContain('Picked up Pistol')
  expect(host.prewarmVehicle).not.toHaveBeenCalled()
  expect(host.game.dispatch).not.toHaveBeenCalled()
})

it('keeps vehicle effects and messages after the shared dispatch', () => {
  const { host, sim, actions } = fixture()
  sim.player.vehicleId = 'car'
  host.controlContext.mode = 'road'
  for (const action of ['lights', 'gps', 'highBeam', 'signal.left']) actions.dispatch(action)
  expect(host.game.dispatch.mock.calls.map(([action]) => action)).toEqual([
    'lights',
    'gps',
    'highBeam',
    'signal.left',
  ])
  expect(host.report.mock.calls.slice(0, 3).map(([message]) => message)).toEqual([
    'Dipped beams',
    'GPS on',
    'Low beams selected',
  ])
  expect(host.view.signal).toHaveBeenCalledWith('car', -1)
  expect(host.game.dispatch.mock.invocationCallOrder[0]).toBeLessThan(
    host.view.cycleVehicleLights.mock.invocationCallOrder[0],
  )
})

it('retains the shared interaction confirmation without entering the simulation directly', async () => {
  const { host, actions } = fixture()
  let finish!: () => void
  host.prewarmVehicle.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve
      }),
  )
  actions.dispatch('KeyE')
  actions.dispatch('interact')
  expect(host.prewarmVehicle).toHaveBeenCalledOnce()
  expect(host.prewarmVehicle).toHaveBeenCalledWith(host.document.entities)
  expect(host.game.dispatch).not.toHaveBeenCalled()
  finish()
  await vi.waitFor(() => expect(host.game.dispatch).toHaveBeenCalledExactlyOnceWith('interact'))
  expect(host.report).toHaveBeenLastCalledWith('confirmation')
  expect(host.drivingPrepared.has('car')).toBe(true)
})

describe('pending vehicle preparation', () => {
  it.each(['disposed', 'replaced', 'paused', 'moved', 'seated'] as const)(
    'does not enter after the runtime is %s',
    async (change) => {
      const { host, sim, actions } = fixture()
      let finish!: () => void
      host.prewarmVehicle.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      )
      actions.dispatch('interact')
      if (change === 'disposed') host.disposed = true
      if (change === 'replaced') host.session.simulation = { ...sim }
      if (change === 'paused') host.session.state = 'paused'
      if (change === 'moved') sim.nearestVehicle.mockReturnValue('other')
      if (change === 'seated') sim.player.vehicleId = 'car'
      finish()
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(host.game.dispatch).not.toHaveBeenCalled()
      expect(host.drivingPrepared.has('car')).toBe(!['disposed', 'replaced'].includes(change))
    },
  )

  it('releases the guard after failure and keeps two instances independent', async () => {
    const a = fixture(),
      b = fixture()
    let fail!: (error: Error) => void
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      a.host.prewarmVehicle.mockImplementationOnce(
        () =>
          new Promise<void>((_, reject) => {
            fail = reject
          }),
      )
      a.actions.dispatch('interact')
      b.actions.dispatch('interact')
      await vi.waitFor(() => expect(b.host.game.dispatch).toHaveBeenCalledOnce())
      expect(a.host.game.dispatch).not.toHaveBeenCalled()
      fail(new Error('warmup failed'))
      await vi.waitFor(() => expect(errorLog).toHaveBeenCalledOnce())
      expect(a.host.report).toHaveBeenCalledOnce()
      a.actions.dispatch('interact')
      await vi.waitFor(() => expect(a.host.game.dispatch).toHaveBeenCalledOnce())
      expect(a.host.prewarmVehicle).toHaveBeenCalledTimes(2)
    } finally {
      errorLog.mockRestore()
    }
  })
})

it('leaves camera ownership with XR and otherwise skips the start sequence before dispatch', () => {
  const { host, sim, actions } = fixture()
  host.xrActive = true
  actions.cycleCamera()
  expect(host.game.dispatch).not.toHaveBeenCalled()
  host.xrActive = false
  actions.cycleCamera()
  expect(host.skipStartCamera).toHaveBeenCalledWith(sim)
  expect(host.skipStartCamera.mock.invocationCallOrder[0]).toBeLessThan(
    host.game.dispatch.mock.invocationCallOrder[0],
  )
  expect(host.game.dispatch).toHaveBeenCalledWith('camera')
})

it('keeps menu action callbacks and repeated menu opening behavior', () => {
  const { host, actions } = fixture()
  expect(actions.menuKey('car', 'KeyJ', true)).toEqual({ handled: true })
  expect(host.view.toggleVehicleMenu).not.toHaveBeenCalled()
  host.view.vehicleMenu.mockReturnValue({
    open: true,
    dispatch: () => ({ handled: true, action: { type: 'vehicle.fov', value: '+5' } }),
  })
  expect(actions.menuKey('car', 'Enter', false)).toEqual({ handled: true })
  expect(host.adjustFov).toHaveBeenCalledWith('+5')
  expect(host.report).toHaveBeenLastCalledWith('FOV changed')
})
