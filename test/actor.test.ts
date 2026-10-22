import { describe, expect, it } from 'vitest'
import { actorBodyAssets, actorProfile, loadActor, parseActor, saveActor } from '../src/runtime/actor.js'

describe('actor', () => {
  it('recolours the default prota through its primary slot', () => {
    expect(actorBodyAssets({ kind: 'default', color: 'red' }).colors).toEqual({ primary: '#c62828' })
    expect(actorBodyAssets({ kind: 'default', color: 'white' }).colors).toBeUndefined()
    expect(actorBodyAssets({ kind: 'default', color: 'white' }).model).toBe('/avatar/prota/prota.glb')
  })
  it('wears polibot with the shared clips', () => {
    const body = actorBodyAssets({ kind: 'polibot', color: 'blue' })
    expect(body.model).toBe('/avatar/polibot/polibot.glb')
    expect(body.animations).toBe('/avatar/avatar.anims.glb')
  })
  it('parses and stores kind:color, falling back on unknown parts', () => {
    expect(parseActor('polibot:green')).toEqual({ kind: 'polibot', color: 'green' })
    expect(parseActor('ghost:pink')).toEqual({ kind: 'default', color: 'white' })
    const store = new Map<string, string>()
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    saveActor({ kind: 'default', color: 'orange' }, storage)
    expect(loadActor(storage)).toEqual({ kind: 'default', color: 'orange' })
    expect(actorProfile(loadActor(storage))).toBe('default:orange')
  })
})
