import { expect, it, vi } from 'vitest'
import { Group } from 'three'
import {
  RuntimeVehiclePresentation,
  type VehiclePresentationHost,
} from '../../src/runtime/vehicle-presentation.js'
import { createEntity, type Entity, type Vec3Tuple } from '../../src/entity/schema.js'
import { ThreadedSimulation } from '../../src/simulation/threaded-simulation.js'
import type { Simulation } from '../../src/simulation/simulation.js'
import { createRuntimeText } from '../../src/runtime/messages.js'

function deferred() {
  let resolve!: () => void, reject!: (error: Error) => void
  const promise = new Promise<void>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const template = () =>
  Object.assign(createEntity('car', 'vehicle', [1, 2, 3]), { groundOffset: 0.5 })
function fixture() {
  const log: string[] = []
  const sim = {
    player: { position: [0, 1, 0] as Vec3Tuple, vehicleId: null as string | null, yaw: 0 },
    addVehicles: vi.fn((_entities: Entity[]) => {
      log.push('physics')
    }),
    removeVehicle: vi.fn((_id: string) => {
      log.push('remove physics')
    }),
    whenEntities: vi.fn(async (_ids: string[]) => {
      log.push('worker')
    }),
    vehicleInfo: vi.fn(() => ({ ignition: 'off', braking: true, reversing: false })),
    consumeExplosions: vi.fn((): object[] => []),
    vehicleDamage: () => ({ health: 0.4 }),
    shoot: vi.fn(() => null),
  }
  const document = { entities: [] as Entity[] }
  const warmup = {
    warm: vi.fn(
      async (_entities: readonly Entity[], progress?: (phase: string) => Promise<void>) => {
        await progress?.('Loading model')
      },
    ),
    dispose: vi.fn(),
  }
  const host = {
    canvas: { dataset: {} as DOMStringMap, parentElement: null },
    session: { simulation: sim as typeof sim | null, state: 'playing' },
    document,
    game: {
      addVehicles: vi.fn((entities: Entity[]) => {
        log.push('game')
        document.entities.push(...entities)
      }),
      removeVehicle: vi.fn((_id: string) => {
        log.push('remove game')
      }),
    },
    view: {
      addVehicles: vi.fn(async (_entities: Entity[]) => {
        log.push('view')
      }),
      removeVehicle: vi.fn((_id: string) => {
        log.push('remove view')
      }),
      setVehiclePaint: vi.fn(),
      vehicleLightState: vi.fn(() => ({ mode: 'low', high: true })),
      setVehicleLightState: vi.fn(() => true),
      objects: new Map<string, Group>(),
      root: new Group(),
      wreckParts: vi.fn((): Group[] => []),
      destruction: { explode: vi.fn(), setDamage: vi.fn(), update: vi.fn() },
    },
    disposed: false,
    smokeEnabled: true,
    cameraYaw: 0,
    replacementVehicles: undefined,
    text: createRuntimeText('en'),
    assertAlive: () => {
      if (host.disposed) throw new Error('disposed')
    },
    hasWorld: () => true,
    waitForGround: vi.fn(async () => 10),
    sceneGroundHeight: () => 2,
    rebuildMonitors: vi.fn(() => {
      log.push('monitors')
    }),
    createWarmup: vi.fn(() => warmup),
    pause: vi.fn(() => {
      host.session.state = 'paused'
    }),
    resume: vi.fn(() => {
      host.session.state = 'playing'
    }),
    destructionSound: vi.fn(),
  }
  const owner = new RuntimeVehiclePresentation(host as unknown as VehiclePresentationHost)
  return { owner, host, sim, warmup, log }
}

it('waits for worker registration before visuals and waits for models before returning', async () => {
  const f = fixture(),
    worker = deferred(),
    models = deferred()
  Object.setPrototypeOf(f.sim, ThreadedSimulation.prototype)
  f.sim.whenEntities.mockImplementation(() => worker.promise)
  f.host.view.addVehicles.mockImplementation(async () => {
    f.log.push('view')
    await models.promise
  })
  const child = createEntity('car-screen', 'box', [0, 2, 0])
  child.parentId = 'car'
  child.portal = {} as NonNullable<Entity['portal']>
  const original = [template(), child],
    copy = structuredClone(original)
  let finished = false
  const placing = f.owner.placeVehicle(original, [4, 99, 6], Math.PI).then((id) => {
    finished = true
    return id
  })
  await vi.waitFor(() =>
    expect(f.sim.whenEntities).toHaveBeenCalledWith(['spawned-1', 'spawned-1-screen']),
  )
  expect(f.host.view.addVehicles).not.toHaveBeenCalled()
  worker.resolve()
  await vi.waitFor(() => expect(f.host.view.addVehicles).toHaveBeenCalledOnce())
  expect(f.log).toEqual(['physics', 'view', 'game', 'monitors'])
  expect(finished).toBe(false)
  models.resolve()
  expect(await placing).toBe('spawned-1')
  const added = f.sim.addVehicles.mock.calls[0][0]
  expect(added[0].transform.position).toEqual([4, 10.5, 6])
  expect(added[1].parentId).toBe('spawned-1')
  expect(added[1].transform.position).toEqual(child.transform.position)
  expect(original).toEqual(copy)
  expect(f.host.createWarmup).not.toHaveBeenCalled()
})

it.each(['disposed', 'session'] as const)(
  'does not install after %s changes during worker acknowledgement',
  async (change) => {
    const f = fixture(),
      worker = deferred()
    Object.setPrototypeOf(f.sim, ThreadedSimulation.prototype)
    f.sim.whenEntities.mockReturnValue(worker.promise)
    const placing = f.owner.placeVehicle(template(), [0, 0, 0])
    await vi.waitFor(() => expect(f.sim.whenEntities).toHaveBeenCalledOnce())
    if (change === 'disposed') f.host.disposed = true
    else f.host.session.simulation = null
    worker.resolve()
    await expect(placing).rejects.toThrow(change === 'disposed' ? 'disposed' : 'session ended')
    expect(f.host.view.addVehicles).not.toHaveBeenCalled()
    expect(f.host.game.addVehicles).not.toHaveBeenCalled()
  },
)

it('keeps failed ground waits out of physics and permits retry and ordered removal', async () => {
  const f = fixture()
  f.host.waitForGround.mockRejectedValueOnce(new Error('missing terrain'))
  await expect(f.owner.placeVehicle(template(), [0, 0, 0])).rejects.toThrow('missing terrain')
  expect(f.sim.addVehicles).not.toHaveBeenCalled()
  const id = await f.owner.placeVehicle(template(), [0, 0, 0])
  expect(id).toBe('spawned-1')
  expect(f.owner.spawnedVehicles).toHaveLength(1)
  f.log.length = 0
  f.owner.removeSpawnedVehicle(id)
  expect(f.log).toEqual(['remove physics', 'remove view', 'remove game', 'monitors'])
  expect(f.owner.spawnedVehicles).toEqual([])
  expect(() => f.owner.removeSpawnedVehicle(id)).toThrow('Not a spawned vehicle')
})

it('keeps two warmups paused until both complete and forwards progress', async () => {
  const f = fixture(),
    first = deferred(),
    second = deferred(),
    progress = vi.fn(async () => {})
  let calls = 0
  f.warmup.warm.mockImplementation(async (_, report) => {
    await report?.('Loading model')
    await (++calls === 1 ? first.promise : second.promise)
  })
  const a = f.owner.prewarmVehicle(template(), progress),
    b = f.owner.prewarmVehicle(template())
  await vi.waitFor(() => expect(f.host.pause).toHaveBeenCalledOnce())
  expect(progress).toHaveBeenCalledWith('Loading model')
  first.resolve()
  await a
  expect(f.host.resume).not.toHaveBeenCalled()
  second.resolve()
  await b
  expect(f.host.resume).toHaveBeenCalledOnce()
  expect(f.host.createWarmup).toHaveBeenCalledOnce()
})

it.each(['disposed', 'session', 'stopped'] as const)(
  'does not resume after %s changes during preparation',
  async (change) => {
    const f = fixture(),
      ready = deferred()
    f.warmup.warm.mockImplementation(async (_, report) => {
      await report?.('Loading model')
      await ready.promise
    })
    const loading = f.owner.prewarmVehicle(template())
    expect(f.host.pause).toHaveBeenCalledOnce()
    if (change === 'disposed') {
      f.host.disposed = true
      f.owner.dispose()
    }
    if (change === 'session') f.host.session.simulation = null
    if (change === 'stopped') f.host.session.state = 'stopped'
    ready.resolve()
    await loading
    expect(f.host.resume).not.toHaveBeenCalled()
  },
)

it('leaves intro preparation and already paused sessions alone, and balances failures', async () => {
  const f = fixture()
  f.host.canvas.dataset.reveal = 'preparing'
  await f.owner.prewarmVehicle(template())
  expect(f.host.pause).not.toHaveBeenCalled()
  delete f.host.canvas.dataset.reveal
  f.host.session.state = 'paused'
  await f.owner.prewarmVehicle(template())
  expect(f.host.resume).not.toHaveBeenCalled()
  f.host.session.state = 'playing'
  f.warmup.warm.mockImplementationOnce(async (_, report) => {
    await report?.('Loading model')
    throw new Error('GPU failed')
  })
  await expect(f.owner.prewarmVehicle(template())).rejects.toThrow('GPU failed')
  expect(f.host.resume).toHaveBeenCalledOnce()
  await f.owner.prewarmVehicle(template())
  expect(f.host.resume).toHaveBeenCalledTimes(2)
})

it('preserves light ownership, paint forwarding and independent preparation state', () => {
  const a = fixture(),
    b = fixture()
  a.sim.player.vehicleId = 'car'
  const state = a.owner.vehicleLightState('car')!
  expect(state).toMatchObject({ powered: true, braking: true, reversing: false })
  a.owner.setVehicleLightState('car', state)
  expect(a.host.view.setVehicleLightState).toHaveBeenLastCalledWith(
    'car',
    { mode: 'low', high: true },
    { powered: true, braking: true, reversing: false },
  )
  a.owner.setVehicleLightState('car', null)
  expect(a.host.view.setVehicleLightState).toHaveBeenLastCalledWith('car', null, null)
  a.owner.setVehiclePaint('car', '#ffffff', 'chrome')
  expect(a.host.view.setVehiclePaint).toHaveBeenCalledWith('car', '#ffffff', 'chrome')
  a.owner.drivingPrepared.add('car')
  b.owner.drivingPrepared.add('other')
  a.owner.reset()
  expect(a.owner.drivingPrepared.size).toBe(0)
  expect([...b.owner.drivingPrepared]).toEqual(['other'])
})

it('coordinates explosions, detached wreck parts, audio and smoke without changing physics', () => {
  const f = fixture(),
    object = new Group(),
    loose = new Group(),
    attached = new Group()
  f.host.document.entities.push(template())
  f.host.view.objects.set('car', object)
  f.host.view.root.add(loose)
  object.add(attached)
  f.host.view.wreckParts.mockReturnValue([loose, attached])
  f.sim.consumeExplosions.mockReturnValue([
    { entityId: 'car', position: [1, 2, 3], occupied: false, cause: 'damage' },
  ])
  f.owner.updateDamage(f.sim as unknown as Simulation, 0.02, true)
  expect(f.host.view.destruction.explode).toHaveBeenCalledWith('car', object, [loose])
  expect(f.host.destructionSound).toHaveBeenCalledWith([1, 2, 3])
  expect(f.host.view.destruction.setDamage).toHaveBeenCalledWith('car', object, 0.4)
  expect(f.host.view.destruction.update).toHaveBeenCalledWith(0.02, true, expect.any(Function))
  expect(f.sim.addVehicles).not.toHaveBeenCalled()
})
