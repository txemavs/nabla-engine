import { describe, expect, it } from 'vitest'
import * as rules from '../../src/simulation/combat/damage.js'
// @ts-expect-error plain JS module of the relay
import * as relay from '../../services/relay/combat.mjs'

describe('relay combat rules', () => {
  it('match the engine rules (run scripts/relay-combat.mjs after changing them)', () => {
    expect(relay.MAX_HEALTH).toBe(rules.MAX_HEALTH)
    expect(relay.RESPAWN_DELAY_S).toBe(rules.RESPAWN_DELAY_S)
    expect(relay.HIT_ZONES).toEqual(rules.HIT_ZONES)
    for (const zone of ['head', 'neck', 'torso', 'arm', 'leg'] as const)
      expect(relay.zoneDamage(25, zone)).toBe(rules.zoneDamage(25, zone))
    const a = new rules.HealthLedger()
    const b = new relay.HealthLedger()
    for (const [points, now] of [[25, 0], [100, 1], [10, 2]])
      expect(b.damage('x', points, now)).toEqual(a.damage('x', points, now))
    expect(b.due(6)).toEqual(a.due(6))
    expect(b.snapshot()).toEqual(a.snapshot())
  })
})

describe('hit events', () => {
  it('encode bounded, decode tolerant (optional fields)', async () => {
    const { encodeHit, decodeHit, decodeHealthEvent } = await import('../../src/net/protocol.js')
    const data = encodeHit({ targetId: 'p1', damage: 999.4, zone: 'head', direction: [0, 0, -1], point: [1.234, 2, 3] })
    expect(data).toEqual({ t: 'p1', d: 400, z: 'head', r: [0, 0, -1], p: [1.23, 2, 3] })
    expect(decodeHit(data)).toMatchObject({ targetId: 'p1', damage: 400, zone: 'head', origin: undefined })
    expect(decodeHit({ d: 5 })).toBeNull()
    expect(decodeHealthEvent({ t: 'p1', h: 75, s: 'p2' })).toMatchObject({ targetId: 'p1', health: 75, shooterId: 'p2' })
    expect(decodeHealthEvent({ h: 1 })).toBeNull()
  })
})
