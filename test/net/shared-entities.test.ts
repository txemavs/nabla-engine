import { describe, expect, it } from 'vitest'
import {
  ENTITY_CLAIM,
  ENTITY_EVENT,
  ENTITY_GONE_EVENT,
  ENTITY_RELEASE,
  ENTITY_SPAWN,
  SharedEntities,
  decodeEntity,
  encodeEntity,
  type KinematicHost,
  type NetEventData,
  type SharedEntityRecord,
} from '../../src/net/index.js'

function setup() {
  const kinematic = new Map<string, boolean>()
  const moved: [string, number[]][] = []
  const host: KinematicHost = {
    setEntityKinematic: (id, k) => (kinematic.set(id, k), true),
    moveKinematicEntity: (id, pose) => (moved.push([id, [...pose.position]]), true),
  }
  const sent: [string, NetEventData][] = []
  const spawned: SharedEntityRecord[] = []
  const despawned: string[] = []
  const removed: (string | null)[] = []
  let n = 0
  const shared = new SharedEntities(
    {
      spawn: (r) => (spawned.push(r), `local-${++n}`),
      despawn: (_r, localId) => void despawned.push(localId),
      removed: (_r, by) => void removed.push(by),
    },
    host,
    (kind, data) => (sent.push([kind, data]), true),
  )
  shared.self = 'me'
  return { shared, host, kinematic, moved, sent, spawned, despawned, removed }
}

const truck = (driver: string | null): NetEventData =>
  encodeEntity({
    id: 'other.1',
    type: 'vehicle',
    params: { preset: 'truck', color: '#ff0000' },
    position: [1, 0, 2],
    rotation: [0, 0, 0, 1],
    owner: 'other',
    driver,
  })

describe('shared entities', () => {
  it('binds an authored copy during remote loading and removes the redundant late view', async () => {
    const { host } = setup()
    let finish!: (id: string) => void
    const removed: string[] = []
    const shared = new SharedEntities(
      {
        spawn: () =>
          new Promise((resolve) => {
            finish = resolve
          }),
        despawn: (_record, local) => removed.push(local),
        unavailable: (_id, local) => removed.push(local),
      },
      host,
      () => true,
    )
    shared.self = 'me'
    shared.receive(ENTITY_EVENT, truck(null))
    const pose = {
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
    }
    shared.publish('vehicle', {}, pose, 'authored', { id: 'other.1' })
    finish('late-copy')
    await Promise.resolve()
    shared.publish('vehicle', {}, pose, 'duplicate', { id: 'other.1' })
    expect(shared.localIdOf('other.1')).toBe('authored')
    expect(removed).toEqual(['late-copy', 'duplicate'])
  })
  it('requires the matching acknowledgement as well as the authoritative driver record', async () => {
    const { shared, sent } = setup()
    shared.receive(ENTITY_EVENT, truck(null))
    let settled = false
    const result = shared.claimConfirmed('other.1').then((ok) => {
      settled = true
      return ok
    })
    const request = sent.at(-1)![1]
    shared.receive(ENTITY_EVENT, truck('me'))
    await Promise.resolve()
    expect(settled).toBe(false)
    shared.receive('entity.claim.result', { ...request, r: 'wrong', ok: true })
    await Promise.resolve()
    expect(settled).toBe(false)
    shared.receive('entity.claim.result', { ...request, ok: true })
    expect(await result).toBe(true)
  })

  it('cancels disconnected entries and ignores late acknowledgements', async () => {
    const { shared, sent } = setup()
    shared.receive(ENTITY_EVENT, truck(null))
    const result = shared.claimConfirmed('other.1')
    const request = sent.at(-1)![1]
    shared.cancelClaims()
    expect(await result).toBe(false)
    shared.receive(ENTITY_EVENT, truck('other'))
    shared.receive('entity.claim.result', { ...request, ok: true })
    expect(shared.drives('other.1')).toBe(false)
    const disputed = shared.claimConfirmed('other.1')
    shared.receive('entity.claim.result', { ...sent.at(-1)![1], ok: false, reason: 'occupied' })
    expect(await disputed).toBe(false)
  })

  it('times out and releases a possible delayed grant instead of seating the player', async () => {
    const { shared, sent } = setup()
    shared.receive(ENTITY_EVENT, truck(null))
    expect(await shared.claimConfirmed('other.1', 5)).toBe(false)
    expect(sent.at(-1)).toEqual([ENTITY_RELEASE, { i: 'other.1' }])
  })

  it('does not treat an unacknowledged driver record as permission on a repeated request', async () => {
    const { shared, sent } = setup()
    shared.receive(ENTITY_EVENT, truck(null))
    const first = shared.claimConfirmed('other.1', 5)
    shared.receive(ENTITY_EVENT, truck('me'))
    expect(await shared.claimConfirmed('other.1')).toBe(false)
    expect(await first).toBe(false)
    const next = shared.claimConfirmed('other.1')
    expect(sent.at(-1)![0]).toBe(ENTITY_CLAIM)
    shared.receive('entity.claim.result', { ...sent.at(-1)![1], ok: false })
    expect(await next).toBe(false)
  })

  it('removes a provisional authored copy when the existing entity is outside interest', () => {
    const { host } = setup()
    const unavailable: string[] = []
    const shared = new SharedEntities(
      {
        spawn: () => null,
        despawn: () => {},
        unavailable: (_id, local) => unavailable.push(local),
      },
      host,
      () => true,
    )
    shared.self = 'me'
    shared.publish('vehicle', {}, { position: [0, 0, 0], rotation: [0, 0, 0, 1] }, 'authored', {
      id: 'map.car',
    })
    shared.receive('entity.unavailable', { i: 'map.car', reason: 'outside-interest' })
    expect(unavailable).toEqual(['authored'])
    expect(shared.idOfLocal('authored')).toBeNull()
  })
  it('AOI hides despawn the view without firing a removal and can reappear', () => {
    const { shared, removed, despawned, spawned } = setup()
    shared.receive(ENTITY_EVENT, truck('other'))
    shared.receive('entity.hidden', { i: 'other.1' })
    expect(removed).toEqual([])
    expect(despawned).toEqual(['local-1'])
    shared.receive(ENTITY_EVENT, truck('other'))
    expect(spawned).toHaveLength(2)
    expect(shared.list()[0].driver).toBe('other')
  })

  it('continuous claims wait for authority and publication suffixes survive recreated identities', () => {
    const { host } = setup()
    let suffix = 0
    const sent: [string, NetEventData][] = []
    const make = () => {
      const shared = new SharedEntities(
        { spawn: () => 'local', despawn: () => {} },
        host,
        (kind, data) => (sent.push([kind, data]), true),
        undefined,
        () => String(++suffix),
        false,
      )
      shared.self = 'stable-peer'
      return shared
    }
    const a = make()
    a.receive(ENTITY_EVENT, truck(null))
    expect(a.claim('other.1')).toBe(true)
    expect(a.drives('other.1')).toBe(false)
    a.receive(ENTITY_EVENT, { ...truck(null), d: 'stable-peer' })
    expect(a.drives('other.1')).toBe(true)
    a.release('other.1')
    expect(a.drives('other.1')).toBe(true)
    a.receive(ENTITY_EVENT, truck(null))
    expect(a.drives('other.1')).toBe(false)
    const pose = {
      position: [0, 0, 0] as [number, number, number],
      rotation: [0, 0, 0, 1] as [number, number, number, number],
    }
    const first = a.publish('car', {}, pose, null)
    expect(make().publish('car', {}, pose, null)).not.toBe(first)
  })

  it('encodes and decodes records with params', () => {
    const record = decodeEntity(truck('other'))
    expect(record).toEqual({
      id: 'other.1',
      type: 'vehicle',
      params: { preset: 'truck', color: '#ff0000' },
      position: [1, 0, 2],
      rotation: [0, 0, 0, 1],
      owner: 'other',
      driver: 'other',
    })
    expect(decodeEntity({ i: 'x', y: 'v', p: [1, 2] })).toBeNull()
  })

  it('spawns one local object per entity, claims it instead of copying, and despawns on gone', () => {
    const { shared, sent, spawned, despawned, kinematic, moved, removed } = setup()
    shared.reset([decodeEntity(truck('other'))!])
    shared.receive(ENTITY_EVENT, truck('other'))
    expect(spawned.length).toBe(1)
    expect(spawned[0].params.color).toBe('#ff0000')
    expect(shared.idOfLocal('local-1')).toBe('other.1')
    // Driven by someone else: claim refused locally.
    expect(shared.claim('other.1')).toBe(false)
    // Released: held kinematic at the rest pose; now claimable.
    shared.receive(ENTITY_EVENT, truck(null))
    shared.update(0)
    expect(kinematic.get('local-1')).toBe(true)
    expect(moved.at(-1)).toEqual(['local-1', [1, 0, 2]])
    expect(shared.claim('other.1')).toBe(true)
    expect(sent.at(-1)).toEqual([ENTITY_CLAIM, { i: 'other.1' }])
    expect(shared.drives('other.1')).toBe(true)
    shared.receive(ENTITY_EVENT, truck('me'))
    expect(spawned.length).toBe(1)
    expect(shared.release('other.1', { position: [5, 0, 5], rotation: [0, 0, 0, 1] })).toBe(true)
    expect(sent.at(-1)?.[0]).toBe(ENTITY_RELEASE)
    shared.receive(ENTITY_GONE_EVENT, { i: 'other.1', b: 'x' })
    expect(removed).toEqual(['x'])
    expect(despawned).toEqual(['local-1'])
    expect(shared.list()).toEqual([])
  })

  it('gives a re-claimed vehicle back to physics after holding it at rest', () => {
    const { shared, kinematic } = setup()
    shared.reset([decodeEntity(truck(null))!])
    shared.update(0)
    expect(kinematic.get('local-1')).toBe(true)
    // Enter, leave, rest, enter again: our own physics body must be dynamic every time.
    for (let i = 0; i < 2; i++) {
      expect(shared.claim('other.1')).toBe(true)
      expect(kinematic.get('local-1')).toBe(false)
      shared.update(1)
      expect(kinematic.get('local-1')).toBe(false)
      expect(shared.release('other.1', { position: [5, 0, 5], rotation: [0, 0, 0, 1] })).toBe(true)
      shared.update(2)
      expect(kinematic.get('local-1')).toBe(true)
    }
  })

  it('publishes with its own id and adopts the existing local object', () => {
    const { shared, sent, spawned } = setup()
    const id = shared.publish(
      'vehicle',
      { color: '#00ff00' },
      { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
      'car',
      { drive: true },
    )
    expect(id).toBe('me.1')
    expect(sent[0][0]).toBe(ENTITY_SPAWN)
    expect(sent[0][1]).toMatchObject({ i: 'me.1', d: 1, _color: '#00ff00' })
    shared.receive(ENTITY_EVENT, { ...sent[0][1], o: 'me', d: 'me' })
    expect(spawned.length).toBe(0)
    expect(shared.localIdOf('me.1')).toBe('car')
    expect(shared.drives('me.1')).toBe(true)
  })
})
