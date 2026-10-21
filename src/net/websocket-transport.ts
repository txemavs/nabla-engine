import { Listeners, type Transport, type TransportStatus } from './transport.js'

/** Minimal WebSocket shape, so tests and non-browser hosts can inject an implementation. */
export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  addEventListener(type: 'open', listener: () => void): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  addEventListener(type: 'close', listener: (event: { reason?: string }) => void): void
  addEventListener(type: 'error', listener: () => void): void
}

const OPEN = 1

/** Text-frame transport over one WebSocket connection to the room relay. No auto-reconnect. */
export class WebSocketTransport implements Transport {
  private readonly socket: WebSocketLike
  private state: TransportStatus = 'connecting'
  private readonly opened = new Listeners<[]>()
  private readonly messages = new Listeners<[string]>()
  private readonly closed = new Listeners<[string]>()

  constructor(url: string, create: (url: string) => WebSocketLike = (u) => new WebSocket(u)) {
    this.socket = create(url)
    this.socket.addEventListener('open', () => {
      this.state = 'open'
      this.opened.emit()
    })
    this.socket.addEventListener('message', (event) => {
      if (typeof event.data === 'string') this.messages.emit(event.data)
    })
    this.socket.addEventListener('close', (event) => this.finish(event.reason || 'closed'))
    this.socket.addEventListener('error', () => this.finish('error'))
  }
  get status(): TransportStatus {
    return this.state
  }
  send(data: string): void {
    if (this.state === 'open' && this.socket.readyState === OPEN) this.socket.send(data)
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
    this.socket.close(1000, 'client closed')
    this.finish('client closed')
  }
  private finish(reason: string): void {
    if (this.state === 'closed') return
    this.state = 'closed'
    this.closed.emit(reason)
  }
}
