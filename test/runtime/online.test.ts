import { describe, expect, it } from 'vitest'
import { OnlineClient, type OnlineSocket } from '../../src/runtime/online.js'

function fixture() {
  const sent: Record<string, unknown>[] = []
  const socket = {
    readyState: 1, bufferedAmount: 0,
    send: (data: string) => sent.push(JSON.parse(data)),
    close: () => { socket.readyState = 3 },
    onopen: null, onmessage: null, onclose: null, onerror: null,
  } as unknown as OnlineSocket
  const client = new OnlineClient('ws://localhost/online/ws', () => socket)
  const receive = (data: unknown) =>
    socket.onmessage?.call(socket as WebSocket, { data: JSON.stringify(data) } as MessageEvent)
  client.connect()
  const place = { kind: 'room' as const, label: 'Habitación', origin: [0, 0, 0] as [number, number, number], geography: null }
  const game = { id: 'a', host: 'me', name: 'Partida', count: 1, place }
  return { client, socket, sent, receive, place, game }
}

describe('online presence protocol', () => {
  it('lists every game and waits for server membership before sending poses', () => {
    const f = fixture()
    f.receive({ type: 'lobby', games: [f.game, { ...f.game, id: 'b' }] })
    expect(f.client.games.map((g) => g.id)).toEqual(['a', 'b'])
    const pose = { tracking: false, head: null, left: null, right: null }
    f.client.track(pose)
    expect(f.sent).toHaveLength(0)
    f.client.create('Nueva', 'Yo', f.place)
    expect(f.sent[0].type).toBe('create')
    expect(f.client.game).toBeNull()
    f.receive({ type: 'joined', game: f.game, playerId: 'me', spawn: [0, 0, 0] })
    f.client.track(pose)
    expect(f.sent[1]).toMatchObject({ type: 'pose', v: 1, seq: 1 })
  })

  it('ignores malformed, stale and cross-session snapshots', () => {
    const f = fixture()
    f.receive({ type: 'joined', game: f.game, playerId: 'me', spawn: [0, 0, 0] })
    const member = { id: 'other', name: 'Other', tracking: false, head: null, left: null, right: null }
    f.receive({ type: 'snapshot', gameId: 'a', tick: 2, members: [member] })
    f.receive({ type: 'snapshot', gameId: 'a', tick: 1, members: [] })
    f.receive({ type: 'snapshot', gameId: 'b', tick: 10, members: [] })
    f.receive({ type: 'snapshot', gameId: 'a', tick: 3, members: [{ ...member, head: { position: [0], rotation: [] } }] })
    expect(f.client.members).toEqual([member])
    f.client.join('b', 'Yo')
    f.receive({ type: 'joined', game: { ...f.game, id: 'b' }, playerId: 'me', spawn: [2, 0, 2] })
    f.receive({ type: 'snapshot', gameId: 'a', tick: 99, members: [member] })
    expect(f.client.members).toEqual([])
  })

  it('drops replaceable poses under pressure and cleans up disconnected sessions', () => {
    const f = fixture()
    f.receive({ type: 'joined', game: f.game, playerId: 'me', spawn: [0, 0, 0] })
    Object.assign(f.socket, { bufferedAmount: 20000 })
    f.client.track({ tracking: false, head: null, left: null, right: null })
    expect(f.sent).toHaveLength(0)
    f.socket.onclose?.call(f.socket as WebSocket, {} as CloseEvent)
    expect(f.client.game).toBeNull()
    expect(f.client.members).toEqual([])
    expect(f.client.games).toEqual([])
    f.client.dispose()
    f.client.connect()
    expect(f.socket.onmessage).not.toBeNull()
  })

  it('does not issue duplicate membership commands while one is pending', () => {
    const f = fixture()
    f.client.join('a', 'Yo')
    f.client.join('b', 'Yo')
    expect(f.sent).toHaveLength(1)
    f.receive({ type: 'error', message: 'No disponible' })
    f.client.join('b', 'Yo')
    expect(f.sent).toHaveLength(2)
  })
})
