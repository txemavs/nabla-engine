/** Transport-agnostic message channel: WebSocket today, WebRTC data channels later. */
export type TransportStatus = 'connecting' | 'open' | 'closed'

export interface Transport {
  readonly status: TransportStatus
  /** Queue or send one text frame. Frames sent while not open are dropped. */
  send(data: string): void
  onOpen(listener: () => void): () => void
  onMessage(listener: (data: string) => void): () => void
  onClose(listener: (reason: string) => void): () => void
  close(): void
}

/** Small listener registry shared by transport implementations. */
export class Listeners<T extends unknown[]> {
  private readonly set = new Set<(...args: T) => void>()
  add(listener: (...args: T) => void): () => void {
    this.set.add(listener)
    return () => this.set.delete(listener)
  }
  emit(...args: T): void {
    for (const listener of [...this.set]) listener(...args)
  }
}

/** In-memory transport for tests and same-page demos. Pair two ends with `loopbackPair`. */
export class LoopbackTransport implements Transport {
  status: TransportStatus = 'open'
  peer: LoopbackTransport | null = null
  private readonly opened = new Listeners<[]>()
  private readonly messages = new Listeners<[string]>()
  private readonly closed = new Listeners<[string]>()
  send(data: string): void {
    if (this.status === 'open') this.peer?.messages.emit(data)
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
  /** Deliver a frame to this end as if the remote side had sent it. */
  receive(data: string): void {
    this.messages.emit(data)
  }
  close(): void {
    if (this.status === 'closed') return
    this.status = 'closed'
    this.closed.emit('closed')
    this.peer?.close()
  }
}

export function loopbackPair(): [LoopbackTransport, LoopbackTransport] {
  const a = new LoopbackTransport()
  const b = new LoopbackTransport()
  a.peer = b
  b.peer = a
  return [a, b]
}
