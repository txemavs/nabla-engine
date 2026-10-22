import { describe, expect, it } from 'vitest'
import { LocalAuthority, type HealthChange, type ItemChange } from '../../src/net/authority.js'
import { parseAuthorityRequest } from '../../src/net/authority-schema.js'

describe('authority schema', () => {
  it('rejects unbounded requests', () => {
    expect(parseAuthorityRequest({ type: 'hit', target: 'p1', damage: 1000 })).toBeNull()
    expect(parseAuthorityRequest({ type: 'pickup', item: 'bad id!' })).toBeNull()
    expect(parseAuthorityRequest({ type: 'drop', item: 'pistol', count: 0, position: [0, 0, 0] })).toBeNull()
    expect(parseAuthorityRequest({ type: 'claim', entity: 'p1.1' })).toEqual({ type: 'claim', entity: 'p1.1' })
  })
})

describe('LocalAuthority', () => {
  it('grants items once, tracks claims and runs health to respawn', () => {
    const a = new LocalAuthority({ items: [{ id: 'w.pistol', item: 'pistol', count: 1, position: [0, 0, 0] }] })
    const items: ItemChange[] = []
    a.onItems((c) => items.push(c))
    expect(a.request({ type: 'pickup', item: 'w.pistol' })).toBe(true)
    expect(a.request({ type: 'pickup', item: 'w.pistol' })).toBe(false)
    expect(items.map((c) => c.type)).toEqual(['added', 'removed'])
    expect(a.request({ type: 'claim', entity: 'car' })).toBe(true)
    expect(a.request({ type: 'release', entity: 'car' })).toBe(true)
    expect(a.request({ type: 'release', entity: 'car' })).toBe(false)
    const health: HealthChange[] = []
    a.onHealth((c) => health.push(c))
    a.update(0)
    a.request({ type: 'hit', target: 'npc', damage: 400 })
    expect(health.map((c) => c.type)).toEqual(['health', 'death'])
    a.update(a.ledger.respawnDelay)
    expect(health.at(-1)).toEqual({ type: 'respawn', target: 'npc', health: a.ledger.maxHealth })
  })
})
