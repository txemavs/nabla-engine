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
    Object.assign(element.style, {
      position: 'absolute',
      right: '16px',
      bottom: '16px',
      padding: '4px 10px',
      borderRadius: '4px',
      background: 'rgba(0, 0, 0, 0.55)',
      color: '#fff',
      font: '600 12px/1.4 system-ui, sans-serif',
      letterSpacing: '0.08em',
      pointerEvents: 'none',
      zIndex: '20',
      display: 'none',
    })
    host.append(element)
    this.element = element
  }

  show(text: string | null): void {
    if (text === this.text) return
    this.text = text
    this.element.style.display = text ? 'block' : 'none'
    if (text) {
      this.element.textContent = text
      this.element.style.color = text === 'SEMI' ? '#fff' : '#ffcf5a'
    }
  }

  dispose(): void {
    this.element.remove()
  }
}
