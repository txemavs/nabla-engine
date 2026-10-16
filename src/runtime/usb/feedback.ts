/** Physics output is independent of USB vendor protocols and transport. */
import { usbDeviceKey, type UsbPad } from './controllers.js'
import type { VehicleFeedback } from '../../simulation/contracts.js'
export type { VehicleFeedback } from '../../simulation/contracts.js'
export interface ForceFeedbackTransport {
  readonly ready: boolean
  send(force: number): void
  stop(): void
  dispose(): void
}
/** Optional authenticated localhost bridge. The bridge must enforce its own watchdog. */
export class UsbForceBridge implements ForceFeedbackTransport {
  private socket: WebSocket
  private authenticated = false
  error = ''
  get ready(): boolean {
    return this.authenticated && this.socket.readyState === WebSocket.OPEN
  }
  constructor(url: string, token: string) {
    const parsed = new URL(url)
    if (
      !['ws:', 'wss:'].includes(parsed.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    )
      throw new Error('El puente FFB debe ser local (ws/wss en localhost).')
    if (!token || token.length > 256) throw new Error('Token del puente requerido')
    this.socket = new WebSocket(url)
    this.socket.onopen = () => this.socket.send(JSON.stringify({ type: 'authenticate', token }))
    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data))
        this.authenticated = data.type === 'ready'
        if (data.error) this.error = String(data.error)
      } catch {
        this.error = 'Respuesta inválida del puente'
        this.dispose()
      }
    }
    this.socket.onerror = () => {
      this.error = 'No se pudo conectar al puente FFB'
      this.authenticated = false
    }
    this.socket.onclose = () => {
      this.authenticated = false
    }
  }
  send(force: number): void {
    if (this.ready)
      this.socket.send(
        JSON.stringify({
          type: 'force',
          force: Number.isFinite(force) ? Math.max(-1, Math.min(1, force)) : 0,
        }),
      )
  }
  stop(): void {
    this.send(0)
  }
  dispose(): void {
    this.stop()
    this.authenticated = false
    this.socket.close()
  }
}
type HapticPad = UsbPad & {
  vibrationActuator?: {
    effects?: string[]
    playEffect(
      type: string,
      parameters: { duration: number; strongMagnitude: number; weakMagnitude: number },
    ): Promise<unknown>
    reset?: () => Promise<unknown>
  }
}
/** Rate-limited effects sourced from current vehicle contacts; no synthetic engine oscillation. */
export class UsbFeedback {
  enabled = false
  gain = 0.2
  invert = false
  device = ''
  error = ''
  transport: ForceFeedbackTransport | null = null
  get status(): string {
    if (this.transport instanceof UsbForceBridge && this.transport.error)
      return this.transport.error
    if (this.error) return this.error
    if (this.transport)
      return this.transport.ready ? 'Puente FFB conectado' : 'Conectando al puente FFB…'
    return 'Sin puente FFB; vibración según las capacidades del dispositivo'
  }
  private last = -Infinity
  private load = 1
  private smoothForce = 0
  private actuator: HapticPad['vibrationActuator']
  private muted = false
  constructor(private target: Window | null = typeof window === 'undefined' ? null : window) {
    target?.addEventListener('blur', this.suspend)
    target?.document.addEventListener('visibilitychange', this.visibility)
  }
  private visibility = () => {
    if (this.target?.document.hidden) this.suspend()
  }
  private suspend = () => {
    this.enabled = false
    this.stop()
  }
  connect(url: string, token: string): void {
    this.transport?.dispose()
    this.transport = new UsbForceBridge(url, token)
  }
  update(
    feedback: VehicleFeedback | null,
    pads: readonly (UsbPad | null)[],
    active: boolean,
    now = performance.now(),
  ): void {
    if (!active || !this.enabled || !feedback || this.target?.document.hidden) {
      this.stop()
      return
    }
    if (now - this.last < 33) return
    this.last = now
    this.muted = false
    const clamp = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0)
    const gain = clamp(this.gain)
    const force =
      feedback.grounded && Number.isFinite(feedback.steeringTorqueNm)
        ? Math.max(-1, Math.min(1, feedback.steeringTorqueNm / 10)) * gain * (this.invert ? -1 : 1)
        : 0
    this.smoothForce += (force - this.smoothForce) * 0.35
    this.transport?.send(this.smoothForce)
    const pad = pads.find((p) => p?.connected && usbDeviceKey(p) === this.device) as
      HapticPad | undefined
    const actuator = pad?.vibrationActuator
    if (this.actuator && this.actuator !== actuator) void this.actuator.reset?.().catch(() => {})
    this.actuator = actuator
    const impact = Number.isFinite(feedback.suspensionLoad)
      ? Math.abs(feedback.suspensionLoad - this.load)
      : 0
    this.load = Number.isFinite(feedback.suspensionLoad) ? feedback.suspensionLoad : 1
    if (!actuator?.playEffect || (actuator.effects && !actuator.effects.includes('dual-rumble')))
      return
    void actuator
      .playEffect('dual-rumble', {
        duration: 60,
        strongMagnitude: clamp(impact * gain),
        weakMagnitude: clamp(feedback.tireSlip * gain),
      })
      .catch(() => {
        this.error = 'Vibración no disponible para este dispositivo'
      })
  }
  stop(): void {
    this.smoothForce = 0
    this.load = 1
    if (this.muted) return
    this.muted = true
    this.transport?.stop()
    void this.actuator?.reset?.().catch(() => {})
  }
  dispose(): void {
    this.stop()
    this.transport?.dispose()
    this.transport = null
    this.target?.removeEventListener('blur', this.suspend)
    this.target?.document.removeEventListener('visibilitychange', this.visibility)
  }
}
