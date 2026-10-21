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
  const colours = new Map<
    string,
    { slot: number; color: string; meta: Record<string, string | number | boolean> }
  >()
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
        const slot = members.size
        const color = ['#c0392b', '#2471a3', '#f1c40f'][slot]
        const peers = [...members.values()].map((p) => ({ peer: p, meta: {}, ...colours.get(p) }))
        for (const other of members.keys())
          other.send(encodeMessage({ type: 'joined', peer, meta: message.meta ?? {}, slot, color }))
        members.set(server, peer)
        colours.set(peer, { slot, color, meta: message.meta ?? {} })
        server.send(
          encodeMessage({ type: 'welcome', peer, room: message.room, peers, slot, color }),
        )
      } else if (message.type === 'event') {
        const peer = members.get(server)!
        for (const other of members.keys())
          if (other !== server)
            other.send(
              encodeMessage({ type: 'event', peer, kind: message.kind, data: message.data }),
            )
      } else if (message.type === 'profile') {
        const peer = members.get(server)!
        for (const other of members.keys())
          if (other !== server)
            other.send(encodeMessage({ type: 'profile', peer, meta: message.meta ?? {} }))
      } else if (message.type === 'leave') {
        const peer = members.get(server)!
        members.delete(server)
        for (const other of members.keys()) other.send(encodeMessage({ type: 'left', peer }))
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

describe('SnapshotSync async placement', () => {
  it('uses the id the game assigns on placement and buffers snapshots until then', async () => {
    let now = 0
    const clock = () => now
    const net = relay()
    const a = fakeHost(() => ({
      position: [now / 100, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [10, 0, 0],
      angularVelocity: [0, 0, 0],
    }))
    const b = fakeHost(() => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    }))
    let release!: () => void
    const ready = new Promise<void>((r) => (release = r))
    const despawned: string[] = []
    const syncA = new SnapshotSync({
      transport: net.connect(),
      room: 't',
      host: a.host,
      clock,
      localEntity: () => 'player-vehicle',
      spawnRemote: () => null,
      despawnRemote: () => {},
    })
    const syncB = new SnapshotSync({
      transport: net.connect(),
      room: 't',
      host: b.host,
      clock,
      localEntity: () => 'player-vehicle',
      // Like GameRuntime.placeVehicle: the requested id is replaced by `spawned-N`.
      spawnRemote: async () => (await ready, 'spawned-7'),
      despawnRemote: (_peer, id) => despawned.push(id),
    })
    for (let frame = 0; frame < 30; frame++) {
      now = frame * 20
      syncA.update()
      syncB.update()
    }
    expect(b.moved).toEqual([])
    release()
    await ready
    await Promise.resolve()
    for (let frame = 30; frame < 60; frame++) {
      now = frame * 20
      syncA.update()
      syncB.update()
    }
    expect(b.kinematic.has('spawned-7')).toBe(true)
    expect(new Set(b.moved.map((m) => m.id))).toEqual(new Set(['spawned-7']))
    expect(b.moved.at(-1)!.x).toBeGreaterThan(9)
    syncA.dispose()
    expect(despawned).toEqual(['spawned-7'])
    syncB.dispose()
  })
})

describe('SnapshotSync extra values and relay colours', () => {
  it('sends game values with snapshots, applies them on change and reports the slot colour', () => {
    let now = 0
    const clock = () => now
    const net = relay()
    const still = fakeHost(() => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    }))
    let lights = 1
    const welcomes: (string | undefined)[] = []
    const applied: [string, unknown, string][] = []
    const syncA = new SnapshotSync({
      transport: net.connect(),
      room: 'x',
      host: still.host,
      clock,
      localEntity: () => 'mine',
      spawnRemote: () => null,
      despawnRemote: () => {},
      readExtra: () => ({ lights }),
      onWelcome: (self) => welcomes.push(self.color),
    })
    const joinedColours: (string | undefined)[] = []
    const syncB = new SnapshotSync({
      transport: net.connect(),
      room: 'x',
      host: still.host,
      clock,
      localEntity: () => 'mine',
      spawnRemote: (peer) => (joinedColours.push(peer.color), 'remote'),
      despawnRemote: () => {},
      applyExtra: (id, extra, peer) => {
        applied.push([id, extra.lights, peer])
      },
      onWelcome: (self) => welcomes.push(self.color),
    })
    expect(welcomes).toEqual(['#c0392b', '#2471a3'])
    expect(syncB.color).toBe('#2471a3')
    expect(joinedColours).toEqual(['#c0392b'])
    for (let frame = 0; frame < 20; frame++) {
      now = frame * 50
      if (frame === 10) lights = 3
      syncA.update()
      syncB.update()
    }
    // Applied once per distinct value, not every frame.
    expect(applied).toEqual([
      ['remote', 1, 'p1'],
      ['remote', 3, 'p1'],
    ])
    syncA.dispose()
    syncB.dispose()
  })
})

describe('SnapshotSync profile changes', () => {
  it('respawns the remote copy with the new vehicle and keeps its relay colour', () => {
    const net = relay()
    const host = fakeHost(() => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    }))
    const syncA = new SnapshotSync({
      transport: net.connect(),
      room: 'p',
      host: host.host,
      localEntity: () => 'mine',
      spawnRemote: () => null,
      despawnRemote: () => {},
      meta: { vehicle: 'car' },
    })
    const spawned: [string, unknown, string | undefined][] = []
    const despawned: string[] = []
    let n = 0
    const syncB = new SnapshotSync({
      transport: net.connect(),
      room: 'p',
      host: host.host,
      localEntity: () => 'mine',
      spawnRemote: (peer) => (spawned.push([peer.peer, peer.meta.vehicle, peer.color]), `r${++n}`),
      despawnRemote: (_peer, id) => despawned.push(id),
    })
    syncA.setMeta({ vehicle: 'vfr800' })
    syncA.setMeta({ vehicle: '' })
    expect(spawned).toEqual([
      ['p1', 'car', '#c0392b'],
      ['p1', 'vfr800', '#c0392b'],
      ['p1', '', '#c0392b'],
    ])
    expect(despawned).toEqual(['r1', 'r2'])
    syncA.dispose()
    syncB.dispose()
  })
})

describe('SnapshotSync events', () => {
  it('relays game events to other peers and maps remote entities back to peers', () => {
    const net = relay()
    const host = fakeHost(() => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    }))
    const gotA: unknown[] = []
    const gotB: unknown[] = []
    const syncA = new SnapshotSync({
      transport: net.connect(),
      room: 'e',
      host: host.host,
      localEntity: () => 'mine',
      spawnRemote: (peer) => `copy-${peer.peer}`,
      despawnRemote: () => {},
      onEvent: (e) => gotA.push(e),
    })
    const syncB = new SnapshotSync({
      transport: net.connect(),
      room: 'e',
      host: host.host,
      localEntity: () => 'mine',
      spawnRemote: (peer) => `copy-${peer.peer}`,
      despawnRemote: () => {},
      onEvent: (e) => gotB.push(e),
    })
    expect(syncA.peerOfEntity('copy-p2')).toBe('p2')
    expect(syncA.peerOfEntity('nope')).toBeNull()
    expect(syncA.sendEvent('shot', { end: [1, 2, 3], target: 'p2', damage: 10 })).toBe(true)
    expect(gotB).toEqual([
      { peer: 'p1', kind: 'shot', data: { end: [1, 2, 3], target: 'p2', damage: 10 } },
    ])
    expect(gotA).toEqual([])
    syncA.dispose()
    syncB.dispose()
  })
})

describe('SnapshotSync interest management', () => {
  it('shows peers inside the show radius and despawns them past the hide radius', () => {
    let now = 0
    const clock = () => now
    const net = relay()
    let bx = 150
    const a = fakeHost(() => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    }))
    const b = fakeHost(() => ({
      position: [bx, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    }))
    const shown = new Set<string>()
    const make = (host: typeof a.host, own: string, track: boolean) =>
      new SnapshotSync({
        transport: net.connect(),
        room: 'test',
        host,
        clock,
        localEntity: () => own,
        interest: { show: 200, hide: 220 },
        spawnRemote: (peer) => (track && shown.add(peer.peer), `remote-${peer.peer}`),
        despawnRemote: (peer) => void (track && shown.delete(peer)),
      })
    const syncA = make(a.host, 'car-a', true)
    const syncB = make(b.host, 'car-b', false)
    const run = () => {
      for (let i = 0; i < 6; i++) {
        now += 50
        syncB.update()
        syncA.update()
      }
    }
    run()
    expect(shown.has('p2')).toBe(true)
    bx = 210 // between show and hide: stays (hysteresis)
    run()
    expect(shown.has('p2')).toBe(true)
    bx = 300
    run()
    expect(shown.has('p2')).toBe(false)
    bx = 210 // back inside hide but outside show: stays hidden
    run()
    expect(shown.has('p2')).toBe(false)
    bx = 100
    run()
    expect(shown.has('p2')).toBe(true)
    syncA.dispose()
    syncB.dispose()
  })
})

describe('SnapshotSync on-foot avatars', () => {
  it('sends the local body without a vehicle and shows the remote one interpolated', () => {
    let now = 0
    const clock = () => now
    const net = relay()
    const still = fakeHost(() => ({
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      velocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    }))
    let ax = 0
    let anim = 1
    const shown: { x: number; yaw: number; anim: number }[] = []
    const visibility: boolean[] = []
    let disposed = 0
    const spawned: string[] = []
    const make = (walker: boolean) =>
      new SnapshotSync({
        transport: net.connect(),
        room: 'feet',
        host: still.host,
        clock,
        localEntity: () => null,
        spawnRemote: (peer) => (spawned.push(peer.peer), null),
        despawnRemote: () => {},
        localAvatar: walker
          ? () => ({ position: [ax, 0, 0], yaw: Math.PI - 0.01 + ax * 0.01, speed: 1.4, anim })
          : () => null,
        remoteAvatar: () => ({
          update: (s) => shown.push({ x: s.position[0], yaw: s.yaw, anim: s.anim }),
          setVisible: (v) => visibility.push(v),
          dispose: () => disposed++,
        }),
      })
    const a = make(true)
    const b = make(false)
    const joins = spawned.length
    for (let frame = 0; frame < 60; frame++) {
      now = frame * (1000 / 60)
      ax = now / 1000 // 1 m/s
      if (frame === 40) anim = 3
      a.update()
      b.update()
    }
    // On-foot snapshots never ask for a vehicle copy (only the joins did).
    expect(spawned.length).toBe(joins)
    expect(b.avatars.size).toBe(1)
    const last = shown.at(-1)!
    expect(last.x).toBeGreaterThan(0.8)
    expect(last.x).toBeLessThan(0.95)
    expect(last.anim).toBe(3)
    // Yaw crosses ±π on the short arc: never near 0.
    for (const s of shown) expect(Math.abs(s.yaw)).toBeGreaterThan(3)
    expect(visibility).toEqual([true])
    // A peer that stops sending its body (e.g. drives) is hidden, and disposed when it leaves.
    for (let frame = 60; frame < 200; frame++) {
      now = frame * (1000 / 60)
      b.update()
    }
    expect(visibility).toEqual([true, false])
    a.dispose()
    expect(disposed).toBe(1)
    expect(b.avatars.size).toBe(0)
    b.dispose()
  })
})
