import { afterEach, expect, it, vi } from 'vitest'
import { PlaySession } from '../../src/runtime/session.js'
import { ThreadedSimulation } from '../../src/simulation/threaded-simulation.js'
import type { Simulation } from '../../src/simulation/simulation.js'
import { createEntity } from '../../src/entity/schema.js'

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function worker() {
  // Preserve the real instanceof boundary while controlling worker reply timing.
  const refresh = vi.fn<() => Promise<void>>(),
    dispose = vi.fn()
  const setCollisionDistance = vi.fn(),
    startInVehicle = vi.fn()
  const simulation = Object.assign(Object.create(ThreadedSimulation.prototype), {
    refresh,
    dispose,
    setCollisionDistance,
    startInVehicle,
  }) as Simulation
  return { simulation, refresh, dispose, setCollisionDistance, startInVehicle }
}
const scene = () => ({
  version: 1 as const,
  name: 'Startup cancellation',
  entities: [createEntity('spawn', 'spawn', [0, 2, 0])],
})
afterEach(() => vi.restoreAllMocks())

for (const phase of ['start', 'refresh'] as const) {
  for (const action of ['stop', 'dispose', 'replace-loading', 'replace-playing'] as const) {
    it.each(['resolve', 'reject'] as const)(
      `${phase} reply after ${action}: %s cannot revive or replace a session`,
      async (reply) => {
        const session = new PlaySession(),
          old = worker(),
          current = worker()
        const starting = deferred<Simulation>(),
          refreshing = deferred<void>(),
          currentRefresh = deferred<void>()
        old.refresh.mockReturnValue(refreshing.promise)
        current.refresh.mockReturnValue(currentRefresh.promise)
        const start = vi
          .spyOn(ThreadedSimulation, 'start')
          .mockImplementationOnce(() =>
            phase === 'start' ? starting.promise : Promise.resolve(old.simulation),
          )
          .mockResolvedValueOnce(current.simulation)
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const oldResult = session.play(scene(), { physicsWorker: true }).then(
          () => null,
          (error) => error,
        )
        let latest: Promise<Simulation> | undefined
        try {
          await vi.waitFor(() =>
            expect(phase === 'start' ? start : old.refresh).toHaveBeenCalledOnce(),
          )
          if (action === 'stop') session.stop()
          else if (action === 'dispose') session.dispose()
          else {
            latest = session.play(scene(), { physicsWorker: true })
            await vi.waitFor(() => expect(current.refresh).toHaveBeenCalledOnce())
            if (action === 'replace-playing') {
              currentRefresh.resolve()
              await latest
            }
          }
          const lateError = new Error('late worker error')
          if (reply === 'reject') (phase === 'start' ? starting : refreshing).reject(lateError)
          else if (phase === 'start') starting.resolve(old.simulation)
          else refreshing.resolve()
          const error = await oldResult
          if (reply === 'reject') expect(error).toBe(lateError)
          else {
            expect(error).toBeInstanceOf(Error)
            expect(error.message).toBe('Play session cancelled')
          }
          expect(old.dispose).toHaveBeenCalledTimes(phase === 'start' && reply === 'reject' ? 0 : 1)
          expect(current.dispose).not.toHaveBeenCalled()
          expect(warn).not.toHaveBeenCalled() // Stale worker failures must not create an inline fallback.
          expect(session.state).toBe(
            action === 'replace-loading'
              ? 'loading'
              : action === 'replace-playing'
                ? 'playing'
                : action === 'dispose'
                  ? 'disposed'
                  : 'stopped',
          )
          expect(session.simulation).toBe(action === 'replace-playing' ? current.simulation : null)
          if (latest) {
            currentRefresh.resolve()
            expect(await latest).toBe(current.simulation)
          }
        } finally {
          session.dispose()
        }
        expect(old.dispose).toHaveBeenCalledTimes(phase === 'start' && reply === 'reject' ? 0 : 1)
        if (latest) expect(current.dispose).toHaveBeenCalledOnce()
      },
    )
  }
}

it('releases a failed active synchronization and allows retry with unchanged startup options', async () => {
  const session = new PlaySession(),
    failed = worker(),
    retry = worker(),
    error = new Error('snapshot failed')
  failed.refresh.mockRejectedValue(error)
  retry.refresh.mockResolvedValue()
  vi.spyOn(ThreadedSimulation, 'start')
    .mockResolvedValueOnce(failed.simulation)
    .mockResolvedValueOnce(retry.simulation)
  try {
    await expect(session.play(scene(), { physicsWorker: true })).rejects.toBe(error)
    expect(failed.dispose).toHaveBeenCalledOnce()
    expect(session.state).toBe('stopped')
    expect(session.simulation).toBeNull()
    expect(
      await session.play(scene(), {
        physicsWorker: true,
        vehicleId: 'car',
        collisionDistance: 120,
      }),
    ).toBe(retry.simulation)
    expect(retry.setCollisionDistance).toHaveBeenCalledWith(120)
    expect(retry.startInVehicle).toHaveBeenCalledWith('car')
    expect(retry.refresh).toHaveBeenCalledOnce()
    expect(retry.dispose).not.toHaveBeenCalled()
  } finally {
    session.dispose()
  }
  expect(retry.dispose).toHaveBeenCalledOnce()
})
