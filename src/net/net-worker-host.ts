/**
 * Worker side of `NetWorker`: owns the relay WebSocket off the main thread and batches incoming
 * frames, so a burst of snapshots costs the main thread one message instead of one per frame.
 * Messages are plain structured-clone objects (no SharedArrayBuffer, no COOP/COEP needed).
 */
import type { WebSocketLike } from './websocket-transport.js'

/** Main thread → worker. */
export type NetWorkerCommand =
  | { type: 'connect'; url: string; flushMs?: number; retry?: RetryOptions }
  | { type: 'send'; data: string }
  | { type: 'close' }

/**
 * Reconnect with exponential backoff after a connection drops or never opens: `minMs`, doubled
 * per failure up to `maxMs`, with ±20 % jitter. `minMs: 0` disables retrying.
 */
export interface RetryOptions {
  minMs: number
  maxMs: number
}
export const defaultRetry: RetryOptions = { minMs: 1000, maxMs: 30_000 }

/**
 * Worker → main thread. `frames` is every text frame received since the last flush, in order.
 * `down` reports a lost (or failed) connection that will be retried in `retryMs`; `open` follows
 * again on success. `close` is final.
 */
export type NetWorkerEvent =
  | { type: 'open' }
  | { type: 'frames'; data: string[] }
  | { type: 'down'; reason: string; retryMs: number }
  | { type: 'close'; reason: string }

/** Backoff delay before attempt `failures` (1-based), with ±20 % jitter. */
export function retryDelay(failures: number, retry: RetryOptions, random = Math.random): number {
  const base = Math.min(retry.maxMs, retry.minMs * 2 ** Math.max(0, failures - 1))
  return Math.round(base * (0.8 + 0.4 * random()))
}

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
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let retry: RetryOptions = { minMs: 0, maxMs: 0 }
  let failures = 0
  let url = ''
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
    if (retryTimer) clearTimeout(retryTimer)
    flush()
    port.postMessage({ type: 'close', reason })
  }
  /** Connection lost or refused: retry with backoff, or finish when retrying is off. */
  const scheduleRetry = (reason: string) => {
    socket = null
    if (timer) clearTimeout(timer)
    flush()
    if (retry.minMs <= 0) return finish(reason)
    const retryMs = retryDelay(++failures, retry)
    port.postMessage({ type: 'down', reason, retryMs })
    retryTimer = setTimeout(() => {
      retryTimer = null
      open()
    }, retryMs)
  }
  /** Close and error both arrive for one socket; only the current one counts, once. */
  const lost = (reason: string, from: WebSocketLike) => {
    if (!closed && from === socket) scheduleRetry(reason)
  }
  const open = () => {
    if (closed) return
    let current: WebSocketLike
    try {
      current = createSocket(url)
    } catch (error) {
      return scheduleRetry(error instanceof Error ? error.message : 'connect failed')
    }
    socket = current
    current.addEventListener('open', () => {
      if (current !== socket || closed) return
      failures = 0
      port.postMessage({ type: 'open' })
    })
    current.addEventListener('message', (event) => {
      if (typeof event.data !== 'string' || closed || current !== socket) return
      queue.push(event.data)
      timer ??= setTimeout(flush, flushMs)
    })
    current.addEventListener('close', (event) => lost(event.reason || 'closed', current))
    current.addEventListener('error', () => lost('error', current))
  }
  port.addEventListener('message', ({ data: command }) => {
    if (command.type === 'connect') {
      if (url) return
      url = command.url
      flushMs = Math.max(0, command.flushMs ?? 0)
      retry = command.retry ?? { minMs: 0, maxMs: 0 }
      open()
    } else if (command.type === 'send') {
      if (socket?.readyState === OPEN && !closed) socket.send(command.data)
    } else if (command.type === 'close') {
      const current = socket
      socket = null
      current?.close(1000, 'client closed')
      finish('client closed')
    }
  })
}
