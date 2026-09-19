import { describe, expect, it } from 'vitest'
import {
  WORMHOLE_OPEN_W_M,
  WORMHOLE_OPEN_H_M,
  WORMHOLE_EXIT_M,
  isWormholeId,
  isWormholeHost,
  wormholeShortName,
  wormholeFaceCaption,
  wormholeBackCaption,
  wrapHeading,
  wormholeCrossing,
  wormholeTransit,
  wormholeArrive,
  listWormholes,
  WORMHOLE_KIND_NS,
} from './wormhole.js'

describe('wormhole', () => {
  it('WORMHOLE dimensions are reasonable', () => {
    expect(WORMHOLE_OPEN_W_M).toBeGreaterThan(2)
    expect(WORMHOLE_OPEN_H_M).toBeGreaterThan(2)
    expect(WORMHOLE_EXIT_M).toBeGreaterThan(1)
  })

  it('isWormholeId detects wormhole IDs', () => {
    expect(isWormholeId('world.wormhole.a')).toBe(true)
    expect(isWormholeId('world.wormhole.b')).toBe(true)
    expect(isWormholeId('world.home')).toBe(false)
  })

  it('isWormholeHost detects wormhole hosts', () => {
    expect(isWormholeHost({ id: 'world.wormhole.a', pose: { x: 0, y: 0, z: 0, yaw: 0 } })).toBe(true)
    expect(
      isWormholeHost({
        id: 'custom.gate',
        pose: { x: 0, y: 0, z: 0, yaw: 0 },
        kind_namespace: WORMHOLE_KIND_NS,
      }),
    ).toBe(true)
    expect(
      isWormholeHost({
        id: 'custom.gate',
        pose: { x: 0, y: 0, z: 0, yaw: 0 },
        mesh: { builtin: 'wormhole' },
      }),
    ).toBe(true)
    expect(isWormholeHost({ id: 'world.home', pose: { x: 0, y: 0, z: 0, yaw: 0 } })).toBe(false)
  })

  it('wormholeShortName extracts tail', () => {
    expect(wormholeShortName('world.wormhole.a')).toBe('a')
    expect(wormholeShortName('world.wormhole.alpha')).toBe('alpha')
  })

  it('wormholeFaceCaption formats pair', () => {
    expect(wormholeFaceCaption('world.wormhole.b')).toBe('→ b')
    expect(wormholeFaceCaption()).toBe('→ —')
  })

  it('wormholeBackCaption shows own name', () => {
    expect(wormholeBackCaption('world.wormhole.a')).toBe('a')
  })

  it('wrapHeading normalizes to -180..180', () => {
    expect(wrapHeading(0)).toBe(0)
    expect(wrapHeading(180)).toBe(180)
    expect(wrapHeading(181)).toBeCloseTo(-179)
    expect(wrapHeading(-181)).toBeCloseTo(179)
    expect(wrapHeading(360)).toBe(0)
    expect(wrapHeading(450)).toBeCloseTo(90)
  })

  it('wormholeCrossing detects +Z to -Z crossing', () => {
    const pose = { x: 0, y: 0, z: 0, yaw: 0 }
    expect(wormholeCrossing({ x: 0, z: 2000 }, { x: 0, z: -500 }, pose)).toBe(true)
    expect(wormholeCrossing({ x: 0, z: -500 }, { x: 0, z: 2000 }, pose)).toBe(false)
    expect(wormholeCrossing({ x: 0, z: 500 }, { x: 0, z: -500 }, pose)).toBe(true)
  })

  it('wormholeCrossing respects width', () => {
    const pose = { x: 0, y: 0, z: 0, yaw: 0 }
    expect(wormholeCrossing({ x: 5000, z: 2000 }, { x: 5000, z: -500 }, pose)).toBe(false)
  })

  it('wormholeTransit computes exit position', () => {
    const from = { id: 'a', pose: { x: 0, y: 0, z: 0, yaw: 0 }, pairId: 'b' }
    const dest = { id: 'b', pose: { x: 20, y: 0, z: 30, yaw: 0 }, pairId: 'a' }
    const t = wormholeTransit(from, dest, { x: 0, z: 1000 }, { x: 0, z: -500 }, 0)
    expect(t).not.toBeNull()
    expect(t!.x).toBeCloseTo(20)
    expect(t!.z).toBeCloseTo(30 - WORMHOLE_EXIT_M)
  })

  it('wormholeTransit returns null if no crossing', () => {
    const from = { id: 'a', pose: { x: 0, y: 0, z: 0, yaw: 0 }, pairId: 'b' }
    const dest = { id: 'b', pose: { x: 20, y: 0, z: 30, yaw: 0 }, pairId: 'a' }
    const t = wormholeTransit(from, dest, { x: 0, z: -500 }, { x: 0, z: 1000 }, 0)
    expect(t).toBeNull()
  })

  it('wormholeArrive returns camera after transit', () => {
    const mouths = [
      { id: 'world.wormhole.a', pose: { x: 0, y: 0, z: 0, yaw: 0 }, pairId: 'world.wormhole.b' },
      { id: 'world.wormhole.b', pose: { x: 20, y: 0, z: 30, yaw: 0 }, pairId: 'world.wormhole.a' },
    ]
    const cam = wormholeArrive(
      'world.wormhole.a',
      -1440,
      mouths,
      { x: 0, z: 1000 },
      { x: 0, z: -500 },
      0,
    )
    expect(cam).not.toBeNull()
    expect(cam!.x).toBeCloseTo(20000)
  })

  it('wormholeArrive returns null if no pair', () => {
    const mouths = [{ id: 'world.wormhole.a', pose: { x: 0, y: 0, z: 0, yaw: 0 } }]
    const cam = wormholeArrive(
      'world.wormhole.a',
      -1440,
      mouths,
      { x: 0, z: 1000 },
      { x: 0, z: -500 },
      0,
    )
    expect(cam).toBeNull()
  })

  it('listWormholes filters wormhole hosts', () => {
    const hosts = [
      { id: 'world.wormhole.a', pose: { x: 0, y: 0, z: 0, yaw: 0 } },
      { id: 'world.wormhole.b', pose: { x: 10, y: 0, z: 10, yaw: 0 } },
      { id: 'world.home', pose: { x: 0, y: 0, z: 0, yaw: 0 } },
    ]
    const mouths = listWormholes(hosts)
    expect(mouths).toHaveLength(2)
    expect(mouths.map((m) => m.id)).toEqual(['world.wormhole.a', 'world.wormhole.b'])
  })

  it('listWormholes uses destOf for pairing', () => {
    const hosts = [
      { id: 'world.wormhole.a', pose: { x: 0, y: 0, z: 0, yaw: 0 } },
      { id: 'world.wormhole.b', pose: { x: 10, y: 0, z: 10, yaw: 0 } },
    ]
    const mouths = listWormholes(hosts, (id) => (id === 'world.wormhole.a' ? 'world.wormhole.b' : 'world.wormhole.a'))
    expect(mouths[0].pairId).toBe('world.wormhole.b')
    expect(mouths[1].pairId).toBe('world.wormhole.a')
  })
})
