import { Listeners, type Transport, type TransportStatus } from './transport.js'
import { WebSocketTransport } from './websocket-transport.js'
import type { NetWorkerCommand, NetWorkerEvent } from './net-worker-host.js'

/** Minimal Worker shape, so tests can pass a MessagePort-backed stand-in. */
export interface NetWorkerLike {
  postMessage(message: NetWorkerCommand): void
  addEventListener(type: 'message', listener: (event: { data: NetWorkerEvent }) => void): void
  addEventListener(type: 'error', listener: (event: unknown) => void): void
  terminate?(): void
}

export interface NetWorkerOptions {
  /**
   * Hold received frames in the worker this long (ms) and deliver them in one message; 0 batches
   * only frames that arrive together. Default 0.
   */
  flushMs?: number
  /** Worker to use; defaults to a module worker running `net.worker.js`. */
  createWorker?: () => NetWorkerLike
  /** Used when no worker can be started (no Worker API, or it fails before connecting). */
  fallback?: (url: string) => Transport
}

const defaultWorker = (): NetWorkerLike =>
  new Worker(new URL('./net.worker.js', import.meta.url), { type: 'module', name: 'nabla-net' })

/**
 * Relay transport whose WebSocket and receive queue live in a Web Worker; the main thread only
 * exchanges postMessage with it. Falls back to `WebSocketTransport` on the main thread when
 * Workers are unavailable or the worker fails to start. Interpolation stays with `SnapshotSync`
 * on the main thread, which samples it on the render clock.
 */
export class NetWorker implements Transport {
  private state: TransportStatus = 'connecting'
  private worker: NetWorkerLike | null = null
  private direct: Transport | null = null
  private started = false
  private readonly opened = new Listeners<[]>()
  private readonly messages = new Listeners<[string]>()
  private readonly closed = new Listeners<[string]>()

  constructor(
    private readonly url: string,
    private readonly options: NetWorkerOptions = {},
  ) {
    const create = options.createWorker ?? (typeof Worker === 'function' ? defaultWorker : null)
    try {
      this.worker = create ? create() : null
    } catch {
      this.worker = null
    }
    if (!this.worker) {
      this.useFallback()
      return
    }
    this.worker.addEventListener('message', ({ data }) => this.receive(data))
    this.worker.addEventListener('error', () => {
      // A worker that never answered (blocked script, bad bundling) hands over to the main thread.
      if (!this.started && this.state === 'connecting') {
        this.worker?.terminate?.()
        this.worker = null
        this.useFallback()
      } else this.finish('worker error')
    })
    this.worker.postMessage({ type: 'connect', url, flushMs: options.flushMs ?? 0 })
  }

  /** True when the connection runs in a worker (false after falling back). */
  get inWorker(): boolean {
    return this.worker !== null
  }
  get status(): TransportStatus {
    return this.direct ? this.direct.status : this.state
  }
  send(data: string): void {
    if (this.direct) this.direct.send(data)
    else if (this.state === 'open') this.worker?.postMessage({ type: 'send', data })
  }
  onOpen(listener: () => void) {
    return this.opened.add(listener)
  }
  onMessage(listener: (data: string) => void) {
    return this.messages.add(listener)
  }
  onClose(listener: (reason: string) => void) {
    return this.closed.add(listener)
  }
  close(): void {
    if (this.direct) return this.direct.close()
    this.worker?.postMessage({ type: 'close' })
    this.finish('client closed')
  }

  private receive(event: NetWorkerEvent): void {
    this.started = true
    if (this.state === 'closed') return
    if (event.type === 'open') {
      this.state = 'open'
      this.opened.emit()
    } else if (event.type === 'frames') {
      for (const frame of event.data) this.messages.emit(frame)
    } else this.finish(event.reason)
  }
  private finish(reason: string): void {
    if (this.state === 'closed') return
    this.state = 'closed'
    this.worker?.terminate?.()
    this.worker = null
    this.closed.emit(reason)
  }
  private useFallback(): void {
    const direct = (this.options.fallback ?? ((url) => new WebSocketTransport(url)))(this.url)
    this.direct = direct
    direct.onOpen(() => this.opened.emit())
    direct.onMessage((data) => this.messages.emit(data))
    direct.onClose((reason) => this.closed.emit(reason))
  }
}
