/**
 * Small fire-mode label (SEMI / EXPERIMENTAL · RÁFAGA 30) at the bottom right while the pistol is
 * drawn on foot. One element; `show(null)` hides it.
 */
export class FireModeBadge {
  private readonly element: HTMLDivElement
  private text: string | null = null

  constructor(host: HTMLElement) {
    const element = host.ownerDocument.createElement('div')
    element.className = 'nabla-fire-mode'
    element.setAttribute('aria-live', 'polite')
    element.hidden = true
    host.append(element)
    this.element = element
  }

  show(text: string | null): void {
    if (text === this.text) return
    this.text = text
    this.element.hidden = !text
    if (text) {
      this.element.textContent = text
      this.element.classList.toggle('is-burst', text !== 'SEMI')
    }
  }

  dispose(): void {
    this.element.remove()
  }
}
