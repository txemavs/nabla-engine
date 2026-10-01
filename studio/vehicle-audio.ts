import { VehicleAudio as EngineVehicleAudio } from '../src/audio/vehicle.js'

/**
 * Studio wrapper: footer mute button, the `nabla.flight-sound` preference,
 * and browser activation. The storage key keeps its original name so an
 * existing mute choice still applies. The engine class owns the graph.
 */
export class VehicleAudio extends EngineVehicleAudio {
  private readonly events = new AbortController()
  private readonly button = document.createElement('button')
  constructor() {
    let enabled = true
    try {
      enabled = localStorage.getItem('nabla.flight-sound') !== 'off'
    } catch {
      /* optional */
    }
    super(enabled)
    const label = () => {
      this.button.textContent = enabled ? 'Sonido: sí' : 'Sonido: no'
      this.button.setAttribute('aria-pressed', String(enabled))
    }
    label()
    this.button.title = 'Activar o silenciar los motores'
    document.querySelector('footer')?.append(this.button)
    const options = { signal: this.events.signal }
    this.button.addEventListener(
      'click',
      () => {
        enabled = !enabled
        this.setEnabled(enabled)
        try {
          localStorage.setItem('nabla.flight-sound', enabled ? 'on' : 'off')
        } catch {
          /* optional */
        }
        label()
      },
      options,
    )
    window.addEventListener('pointerdown', () => this.unlock(), options)
    window.addEventListener('keydown', () => this.unlock(), options)
    const visibility = () => this.setSuspended(document.hidden)
    document.addEventListener('visibilitychange', visibility, options)
    visibility()
  }
  override dispose(): void {
    this.events.abort()
    this.button.remove()
    super.dispose()
  }
}
