/** Bounded outbound delivery and WebSocket liveness, independent of game state. */
export class RelayConnection {
  constructor(socket, { softLimit, hardLimit, slowTimeout, now, onDisconnect }) {
    this.socket = socket
    this.softLimit = softLimit
    this.hardLimit = hardLimit
    this.slowTimeout = slowTimeout
    this.now = now
    this.onDisconnect = onDisconnect
    this.slowSince = null
    this.awaitingPong = false
    this.closed = false
    socket.on('pong', () => {
      this.awaitingPong = false
    })
  }

  disconnect(reason) {
    if (this.closed) return
    this.closed = true
    this.onDisconnect(reason)
    // A close frame would sit behind the same blocked write queue.
    this.socket.terminate()
  }

  check() {
    if (this.closed || this.socket.readyState !== this.socket.OPEN) return false
    if (this.socket.bufferedAmount >= this.hardLimit) {
      this.disconnect('outbound queue limit')
      return false
    }
    if (this.socket.bufferedAmount >= this.softLimit) {
      this.slowSince ??= this.now()
      if (this.now() - this.slowSince >= this.slowTimeout) {
        this.disconnect('outbound queue timeout')
        return false
      }
    } else this.slowSince = null
    return true
  }

  heartbeat() {
    if (!this.check()) return
    if (this.awaitingPong) return this.disconnect('heartbeat timeout')
    this.awaitingPong = true
    try {
      this.socket.ping(undefined, undefined, (error) => {
        if (error) this.disconnect('ping failed')
      })
    } catch {
      this.disconnect('ping failed')
    }
  }

  send(message) {
    if (!this.check()) return false
    const payload = JSON.stringify(message)
    // UTF-8 payload plus the maximum unmasked server frame header (10 bytes).
    const queued = this.socket.bufferedAmount + Buffer.byteLength(payload) + 10
    if (message.type === 'snapshot' && queued > this.softLimit) return false
    if (queued > this.hardLimit) {
      this.disconnect('outbound queue limit')
      return false
    }
    try {
      this.socket.send(payload, (error) => {
        if (error) this.disconnect('send failed')
      })
      return true
    } catch {
      this.disconnect('send failed')
      return false
    }
  }
}
