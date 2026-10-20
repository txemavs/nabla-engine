import { describe, expect, it } from 'vitest'
import {
  LoopbackTransport,
  SnapshotSync,
  decodeServerMessage,
  encodeMessage,
  clientMessageSchema,
  isValidRoom,
  type EntityState,
  type KinematicHost,
  type StateSource,
} from '../../src/net/index.js'

/** In-memory relay with the same routing rules as services/relay/server.mjs. */
function relay() {
  const members = new Map<LoopbackTransport, string>()
  let next = 1
  const connect = () => {
    const server = new LoopbackTransport()
    const client = new LoopbackTransport()
    client.peer = server
    server.peer = client
    server.onMessage((data) => {
      const message = clientMessageSchema.parse(JSON.parse(data))
      if (message.type === 'join') {
        const peer = `p${next++}`
        const peers = [...members.values()].map((p) => ({ peer: p, meta: {} }))
        for (const other of members.keys())
          other.send(encodeMessage({ type: 'joined', peer, meta: message.meta ?? {} }))
        members.set(server, peer)
        server.send(encodeMessage({ type: 'welcome', peer, room: message.room, peers }))
      } else if (message.type === 'snapshot') {
        const peer = members.get(server)!
        for (const other of members.keys())
          if (other !== server) other.send(encodeMessage({ ...message, peer }))
      }
    })
    return client
  }
  return { connect }
}

function fakeHost(state: () => EntityState) {
  const moved: { id: string; x: number }[] = []
  const kinematic = new Set<string>()
  const host: StateSource & KinematicHost = {
    entityTransform: () => ({ position: state().position, rotation: state().rotation }),
    entityVelocity: () => state().velocity,
    setEntityKinematic: (id, on) => (on ? kinematic.add(id) : kinematic.delete(id), true),
    moveKinematicEntity: (id, t) => (moved.push({ id, x: t.position[0] }), true),
  }
  return { host, moved, kinematic }
}

describe('SnapshotSync', () => {
  it('mirrors two peers through a relay at 20 Hz with a 100 ms buffer', () => {
    let now = 0
    const clock = () => now
    const net = relay()
    let ax = 0
    const a = fakeHost(() => ({
      position: [ax, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [10, 0, 0],
      angularVelocity: [0, 0, 0],
    }))
    const b = fakeHost(() => ({
      position: [0, 0, 5],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    }))
    const spawned: string[] = []
    const make = (host: typeof a.host, own: string) =>
      new SnapshotSync({
        transport: net.connect(),
        room: 'test',
        host,
        clock,
        localEntity: () => own,
        spawnRemote: (peer) => (spawned.push(peer.peer), `remote-${peer.peer}`),
        despawnRemote: () => {},
      })
    const syncA = make(a.host, 'car-a')
    const syncB = make(b.host, 'car-b')
    expect(syncA.peerId).toBe('p1')
    expect(syncB.peerId).toBe('p2')
    expect(spawned.sort()).toEqual(['p1', 'p2'])
    let sent = 0
    for (let frame = 0; frame < 60; frame++) {
      now = frame * (1000 / 60)
      ax = now / 100 // 10 m/s
      const before = b.moved.length
      syncA.update()
      syncB.update()
      sent += b.moved.length > before ? 1 : 0
    }
    expect(b.kinematic.has('remote-p1')).toBe(true)
    const last = b.moved.filter((m) => m.id === 'remote-p1').at(-1)!
    // ~1 s of driving, rendered ~100 ms (≈1 m) behind.
    expect(last.x).toBeGreaterThan(8)
    expect(last.x).toBeLessThan(9.5)
    expect(sent).toBeGreaterThan(30)
    syncA.dispose()
    syncB.dispose()
  })
})

describe('protocol', () => {
  it('rejects malformed frames and room ids', () => {
    expect(decodeServerMessage('{')).toBeNull()
    expect(decodeServerMessage(JSON.stringify({ type: 'snapshot', t: 0 }))).toBeNull()
    expect(isValidRoom('euskadi-1')).toBe(true)
    expect(isValidRoom('../x')).toBe(false)
  })
})
