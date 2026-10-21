import { describe, expect, it } from 'vitest'
import { MessageChannel, type MessagePort } from 'node:worker_threads'
import {
  LoopbackTransport,
  NetWorker,
  serveNetWorker,
  type NetWorkerCommand,
  type NetWorkerEvent,
  type NetWorkerLike,
  type NetWorkerPort,
  type WebSocketLike,
} from '../../src/net/index.js'

/** Scriptable WebSocket stand-in living on the "worker" side. */
class FakeSocket implements WebSocketLike {
  readyState = 0
  sent: string[] = []
  closedWith: string | null = null
  private listeners = new Map<string, ((event: never) => void)[]>()
  addEventListener(type: string, listener: (event: never) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }
  emit(type: string, event: unknown = {}): void {
    for (const l of this.listeners.get(type) ?? []) l(event as never)
  }
  open(): void {
    this.readyState = 1
    this.emit('open')
  }
  send(data: string): void {
    this.sent.push(data)
  }
  close(_code?: number, reason?: string): void {
    this.closedWith = reason ?? ''
  }
}

const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms))

/** A MessageChannel pair standing in for a Worker: port1 = main thread, port2 = worker scope. */
function channel() {
  const { port1, port2 } = new MessageChannel()
  const wrap = (port: MessagePort) => ({
    postMessage: (message: unknown) => port.postMessage(message),
    addEventListener: (type: string, listener: (event: { data: never }) => void) => {
      if (type === 'message') port.on('message', (data) => listener({ data: data as never }))
    },
  })
  let terminated = false
  const worker = {
    ...wrap(port1),
    terminate: () => {
      terminated = true
      port1.close()
    },
  } as NetWorkerLike
  return {
    worker,
    workerScope: wrap(port2) as NetWorkerPort,
    terminated: () => terminated,
    port1,
    port2,
  }
}

describe('serveNetWorker', () => {
  it('opens the socket, forwards sends and batches received frames in order', async () => {
    const { port1, port2 } = new MessageChannel()
    const socket = new FakeSocket()
    const events: NetWorkerEvent[] = []
    port1.on('message', (e) => events.push(e))
    serveNetWorker(
      {
        postMessage: (m) => port2.postMessage(m),
        addEventListener: (_t, l) => port2.on('message', (data) => l({ data })),
      },
      () => socket,
    )
    const send = (c: NetWorkerCommand) => port1.postMessage(c)
    send({ type: 'connect', url: 'ws://relay', flushMs: 10 })
    await tick()
    socket.open()
    send({ type: 'send', data: 'hello' })
    await tick()
    expect(socket.sent).toEqual(['hello'])
    for (const n of [1, 2, 3]) socket.emit('message', { data: `f${n}` })
    socket.emit('message', { data: new ArrayBuffer(2) }) // binary frames are not part of the protocol
    await tick(30)
    expect(events).toEqual([{ type: 'open' }, { type: 'frames', data: ['f1', 'f2', 'f3'] }])
    socket.emit('message', { data: 'late' })
    socket.emit('close', { reason: 'bye' })
    await tick(20)
    expect(events.slice(2)).toEqual([
      { type: 'frames', data: ['late'] },
      { type: 'close', reason: 'bye' },
    ])
    port1.close()
  })
})

describe('NetWorker', () => {
  it('is a Transport whose socket lives behind postMessage', async () => {
    const c = channel()
    const socket = new FakeSocket()
    serveNetWorker(c.workerScope, () => socket)
    const net = new NetWorker('ws://relay', { createWorker: () => c.worker })
    expect(net.inWorker).toBe(true)
    expect(net.status).toBe('connecting')
    const got: string[] = []
    let opened = 0
    net.onOpen(() => opened++)
    net.onMessage((d) => got.push(d))
    await tick()
    socket.open()
    await tick()
    expect(opened).toBe(1)
    expect(net.status).toBe('open')
    net.send('{"type":"join"}')
    await tick()
    expect(socket.sent).toEqual(['{"type":"join"}'])
    socket.emit('message', { data: 'a' })
    socket.emit('message', { data: 'b' })
    await tick()
    expect(got).toEqual(['a', 'b'])
    const reasons: string[] = []
    net.onClose((r) => reasons.push(r))
    net.close()
    expect(net.status).toBe('closed')
    expect(reasons).toEqual(['client closed'])
    expect(c.terminated()).toBe(true)
    c.port2.close()
  })
  it('falls back to a main-thread transport without Workers or when the worker fails to start', () => {
    const fallbacks: string[] = []
    const fallback = (url: string) => (fallbacks.push(url), new LoopbackTransport())
    const none = new NetWorker('ws://a', {
      createWorker: () => {
        throw new Error('no workers')
      },
      fallback,
    })
    expect(none.inWorker).toBe(false)
    expect(none.status).toBe('open')
    let fail: ((event: unknown) => void) | null = null
    const broken: NetWorkerLike = {
      postMessage: () => {},
      addEventListener: (type: string, listener: (event: never) => void) => {
        if (type === 'error') fail = listener as (event: unknown) => void
      },
      terminate: () => {},
    }
    const late = new NetWorker('ws://b', { createWorker: () => broken, fallback })
    expect(late.inWorker).toBe(true)
    fail!({})
    expect(late.inWorker).toBe(false)
    expect(fallbacks).toEqual(['ws://a', 'ws://b'])
  })
})
