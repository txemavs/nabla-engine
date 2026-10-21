/**
 * Worker side of `NetWorker`: owns the relay WebSocket off the main thread and batches incoming
 * frames, so a burst of snapshots costs the main thread one message instead of one per frame.
 * Messages are plain structured-clone objects (no SharedArrayBuffer, no COOP/COEP needed).
 */
import type { WebSocketLike } from './websocket-transport.js'

/** Main thread → worker. */
export type NetWorkerCommand =
  | { type: 'connect'; url: string; flushMs?: number }
  | { type: 'send'; data: string }
  | { type: 'close' }

/** Worker → main thread. `frames` is every text frame received since the last flush, in order. */
export type NetWorkerEvent =
  { type: 'open' } | { type: 'frames'; data: string[] } | { type: 'close'; reason: string }

/** The part of a worker scope or MessagePort the host needs. */
export interface NetWorkerPort {
  postMessage(message: NetWorkerEvent): void
  addEventListener(type: 'message', listener: (event: { data: NetWorkerCommand }) => void): void
}

const OPEN = 1

/** Serve one relay connection on `port` (the worker's global scope, or a MessagePort in tests). */
export function serveNetWorker(
  port: NetWorkerPort,
  createSocket: (url: string) => WebSocketLike = (url) => new WebSocket(url),
): void {
  let socket: WebSocketLike | null = null
  let closed = false
  let queue: string[] = []
  let flushMs = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = () => {
    timer = null
    if (!queue.length) return
    const data = queue
    queue = []
    port.postMessage({ type: 'frames', data })
  }
  const finish = (reason: string) => {
    if (closed) return
    closed = true
    if (timer) clearTimeout(timer)
    flush()
    port.postMessage({ type: 'close', reason })
  }
  port.addEventListener('message', ({ data: command }) => {
    if (command.type === 'connect') {
      if (socket) return
      flushMs = Math.max(0, command.flushMs ?? 0)
      try {
        socket = createSocket(command.url)
      } catch (error) {
        finish(error instanceof Error ? error.message : 'connect failed')
        return
      }
      socket.addEventListener('open', () => port.postMessage({ type: 'open' }))
      socket.addEventListener('message', (event) => {
        if (typeof event.data !== 'string' || closed) return
        queue.push(event.data)
        timer ??= setTimeout(flush, flushMs)
      })
      socket.addEventListener('close', (event) => finish(event.reason || 'closed'))
      socket.addEventListener('error', () => finish('error'))
    } else if (command.type === 'send') {
      if (socket?.readyState === OPEN && !closed) socket.send(command.data)
    } else if (command.type === 'close') {
      socket?.close(1000, 'client closed')
      finish('client closed')
    }
  })
}
