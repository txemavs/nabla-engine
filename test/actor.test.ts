import { describe, expect, it } from 'vitest'
import { actorBodyAssets, actorProfile, loadActor, parseActor, saveActor } from '../src/runtime/actor.js'

describe('actor', () => {
  it('recolours the default prota through its primary slot', () => {
    expect(actorBodyAssets({ kind: 'default', color: 'red' }).colors).toEqual({ primary: '#c62828' })
    expect(actorBodyAssets({ kind: 'default', color: 'white' }).colors).toBeUndefined()
    expect(actorBodyAssets({ kind: 'default', color: 'white' }).model).toBe('/avatar/prota/prota.v3.low.glb')
  })
  it('wears polibot with the shared clips', () => {
    const body = actorBodyAssets({ kind: 'polibot', color: 'blue' })
    expect(body.model).toBe('/avatar/polibot/polibot.glb')
    expect(body.animations).toBe('/avatar/avatar.anims.glb')
  })
  it("draws each peer with its own actor's body, never polibot for the default", () => {
    // Remote players used to wear the local rig: a polibot viewer saw default:red as polibot.
    const red = actorBodyAssets(parseActor('default:red'))
    expect(red.model).toBe('/avatar/prota/prota.v3.low.glb')
    expect(red.model).not.toContain('polibot')
    expect(red.colors).toEqual({ primary: '#c62828' })
    expect(actorBodyAssets(parseActor('polibot:red')).model).toBe('/avatar/polibot/polibot.glb')
    expect(actorBodyAssets(parseActor(undefined)).model).toBe('/avatar/prota/prota.v3.low.glb')
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
