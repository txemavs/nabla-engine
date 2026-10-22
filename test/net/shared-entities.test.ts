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
    const id = shared.publish('vehicle', { color: '#00ff00' }, { position: [0, 0, 0], rotation: [0, 0, 0, 1] }, 'car', { drive: true })
    expect(id).toBe('me.1')
    expect(sent[0][0]).toBe(ENTITY_SPAWN)
    expect(sent[0][1]).toMatchObject({ i: 'me.1', d: 1, _color: '#00ff00' })
    shared.receive(ENTITY_EVENT, { ...sent[0][1], o: 'me', d: 'me' })
    expect(spawned.length).toBe(0)
    expect(shared.localIdOf('me.1')).toBe('car')
    expect(shared.drives('me.1')).toBe(true)
  })
})
