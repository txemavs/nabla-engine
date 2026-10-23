/**
 * Combat HUD: the local player's health bar (bottom centre), the red flash on a hit and the
 * death notice with the respawn countdown. Styles in styles/combat.css (tokens only).
 *
 * `display: 'readout'` keeps the bar hidden and only reports the health share through
 * `onHealth` (0–100, null while there is no body), so a host can show it in its own readout.
 */
export type HealthDisplay = 'bar' | 'readout'

export class CombatHud {
  readonly root: HTMLElement
  private readonly fill: HTMLElement
  private readonly label: HTMLElement
  private readonly flash: HTMLElement
  private readonly death: HTMLElement
  private flashTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    parent: HTMLElement,
    private readonly text: { health: string; dead: (seconds: number) => string } = {
      health: 'HP',
      dead: (s) => `Down · respawn in ${s} s`,
    },
    private readonly display: HealthDisplay = 'bar',
    private readonly onHealth?: (percent: number | null) => void,
  ) {
    const doc = parent.ownerDocument
    this.root = doc.createElement('div')
    this.root.className = 'nabla-health'
    this.root.hidden = true
    this.root.setAttribute('role', 'meter')
    this.root.setAttribute('aria-valuemin', '0')
    const track = doc.createElement('div')
    track.className = 'nabla-health-track'
    this.fill = doc.createElement('div')
    this.fill.className = 'nabla-health-fill'
    track.append(this.fill)
    this.label = doc.createElement('div')
    this.label.className = 'nabla-health-label'
    this.root.append(track, this.label)
    this.flash = doc.createElement('div')
    this.flash.className = 'nabla-hit-flash'
    this.death = doc.createElement('div')
    this.death.className = 'nabla-death'
    this.death.hidden = true
    parent.append(this.flash, this.root, this.death)
  }

  /** Show `health` of `max`; hidden while `visible` is false (no body, home page). */
  setHealth(health: number, max: number, visible = true): void {
    const share = Math.max(0, Math.min(1, health / max))
    this.onHealth?.(visible ? Math.round(share * 100) : null)
    this.root.hidden = !visible || this.display !== 'bar'
    this.fill.style.width = `${share * 100}%`
    this.root.classList.toggle('nabla-health--low', share <= 0.3)
    this.root.setAttribute('aria-valuemax', String(max))
    this.root.setAttribute('aria-valuenow', String(Math.round(health)))
    this.label.textContent = `${this.text.health} ${Math.max(0, Math.round(health))}`
  }

  /** Red flash on the victim's screen. */
  hit(): void {
    this.flash.classList.add('nabla-hit-flash--on')
    if (this.flashTimer) clearTimeout(this.flashTimer)
    this.flashTimer = setTimeout(() => this.flash.classList.remove('nabla-hit-flash--on'), 90)
  }

  /** Death notice; null hides it. */
  setRespawnIn(seconds: number | null): void {
    this.death.hidden = seconds === null
    if (seconds !== null) this.death.textContent = this.text.dead(Math.max(0, Math.ceil(seconds)))
  }

  dispose(): void {
    if (this.flashTimer) clearTimeout(this.flashTimer)
    this.root.remove()
    this.flash.remove()
    this.death.remove()
  }
}
