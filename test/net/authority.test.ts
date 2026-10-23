import { describe, expect, it } from 'vitest'
import {
  LocalAuthority,
  SwitchAuthority,
  type HealthChange,
  type ItemChange,
} from '../../src/net/authority.js'
import { parseAuthorityRequest } from '../../src/net/authority-schema.js'

describe('authority schema', () => {
  it('rejects unbounded requests', () => {
    expect(parseAuthorityRequest({ type: 'hit', target: 'p1', damage: 1000 })).toBeNull()
    expect(parseAuthorityRequest({ type: 'pickup', item: 'bad id!' })).toBeNull()
    expect(
      parseAuthorityRequest({ type: 'drop', item: 'pistol', count: 0, position: [0, 0, 0] }),
    ).toBeNull()
    expect(parseAuthorityRequest({ type: 'claim', entity: 'p1.1' })).toEqual({
      type: 'claim',
      entity: 'p1.1',
    })
  })
})

describe('LocalAuthority', () => {
  it('grants items once, tracks claims and runs health to respawn', () => {
    const a = new LocalAuthority({
      items: [{ id: 'w.pistol', item: 'pistol', count: 1, position: [0, 0, 0] }],
    })
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

describe('LocalAuthority items', () => {
  it('drops get fresh ids, a placed id is placed once, removeItem clears for nobody', () => {
    const a = new LocalAuthority()
    const items: ItemChange[] = []
    a.onItems((c) => items.push(c))
    const drop = (id?: string) =>
      a.request({
        type: 'drop',
        item: 'pistol',
        count: 1,
        position: [0, 0, 0],
        ...(id ? { id } : {}),
      })
    expect(drop('w.pistol.0.0')).toBe(true)
    expect(drop('w.pistol.0.0')).toBe(false)
    expect(drop()).toBe(true)
    expect(drop()).toBe(true)
    const ids = items.map((c) => (c.type === 'added' ? c.item.id : ''))
    expect(new Set(ids).size).toBe(3)
    expect(a.removeItem('w.pistol.0.0')).toBe(true)
    expect(items.at(-1)).toEqual({ type: 'removed', id: 'w.pistol.0.0', by: null })
  })
})

describe('SwitchAuthority', () => {
  it('forwards to the current authority and swaps items on use()', () => {
    const local = new LocalAuthority({
      items: [{ id: 'l.1', item: 'pistol', count: 1, position: [0, 0, 0] }],
    })
    const room = new LocalAuthority({
      items: [{ id: 'r.1', item: 'magazine', count: 3, position: [1, 0, 0] }],
    })
    const s = new SwitchAuthority(local)
    const items: ItemChange[] = []
    s.onItems((c) => items.push(c))
    expect(items).toMatchObject([{ type: 'added', item: { id: 'l.1' } }])
    s.use(room)
    expect(items.slice(1)).toMatchObject([
      { type: 'removed', id: 'l.1', by: null },
      { type: 'added', item: { id: 'r.1' } },
    ])
    // The old authority is no longer followed.
    local.request({ type: 'drop', item: 'pistol', count: 1, position: [0, 0, 0] })
    expect(items).toHaveLength(3)
    expect(s.request({ type: 'pickup', item: 'r.1' })).toBe(true)
    expect(items.at(-1)).toEqual({ type: 'removed', id: 'r.1', by: 'local' })
  })
})
