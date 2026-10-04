import { describe, expect, test } from 'vitest'
import { PlaySession } from '../../src/runtime/session.js'
import { createEntity } from '../../src/entity/schema.js'
import type { SceneDocument } from '../../src/scene/document.js'

const scene = (): SceneDocument => ({
  version: 1,
  name: 'Session test',
  entities: [createEntity('spawn', 'spawn', [0, 2, 0])],
})

describe('PlaySession', () => {
  test('copies authored state before asynchronous startup and restores a fresh run', async () => {
    const session = new PlaySession()
    const document = scene()
    const starting = session.play(document, { playerMode: 'hover' })
    document.entities[0].transform.position[0] = 100
    const first = await starting
    expect(first.player.position[0]).toBe(0)
    session.step(1 / 60, { forward: 1, right: 0, yaw: 0, sprint: false, jump: false, brake: false })
    expect(document.entities[0].transform.position).toEqual([100, 2, 0])
    session.stop()
    expect(session.simulation).toBeNull()
    const second = await session.play(document, { playerMode: 'hover' })
    expect(second).not.toBe(first)
    expect(second.player.position[0]).toBe(100)
    session.dispose()
  })

  test('pause ignores elapsed time and resume does not catch up the hidden interval', async () => {
    const session = new PlaySession()
    const sim = await session.play(scene())
    const before = [...sim.player.position]
    session.pause()
    session.step(60)
    expect(sim.player.position).toEqual(before)
    session.resume()
    session.step(1 / 60)
    expect(sim.player.position[1]).toBeGreaterThan(before[1] - 0.1)
    expect(session.state).toBe('playing')
    session.dispose()
  })

  test('stop/dispose during initialization cannot resurrect a simulation', async () => {
    const session = new PlaySession()
    const starting = session.play(scene())
    session.stop()
    await expect(starting).rejects.toThrow('cancelled')
    expect(session.state).toBe('stopped')
    expect(session.simulation).toBeNull()
    const next = session.play(scene())
    session.dispose()
    await expect(next).rejects.toThrow('cancelled')
    expect(session.state).toBe('disposed')
    await expect(session.play(scene())).rejects.toThrow('disposed')
    session.dispose()
  })

  test('the most recent play owns the session and separate sessions do not share a world', async () => {
    const a = new PlaySession(),
      b = new PlaySession()
    const old = a.play(scene())
    const current = a.play(scene())
    await expect(old).rejects.toThrow('cancelled')
    const simA = await current,
      simB = await b.play(scene())
    a.step(0.1)
    expect(simA.player.position).not.toEqual(simB.player.position)
    a.dispose()
    expect(b.state).toBe('playing')
    b.step(1 / 60)
    b.dispose()
  })

  test('a failed startup leaves a stopped session that can be used again', async () => {
    const session = new PlaySession()
    await expect(
      session.play({ ...scene(), version: 99 } as unknown as SceneDocument),
    ).rejects.toThrow()
    expect(session.state).toBe('stopped')
    await session.play(scene())
    expect(() => session.step(Number.NaN)).toThrow('duration')
    session.dispose()
  })
})
