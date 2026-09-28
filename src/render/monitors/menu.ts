/** Menus emit declarative actions. The host decides how to edit its scene or pilot a vehicle. */
export interface MonitorAction {
  type: string
  value?: string
}
export interface MonitorMenuItem {
  id: string
  label: string
  action: MonitorAction
  disabled?: boolean
}
export class MonitorMenu {
  selected = 0
  open = false
  constructor(readonly items: readonly MonitorMenuItem[]) {}
  key(key: string): { handled: boolean; action?: MonitorAction } {
    if (!this.open) return { handled: false }
    if (key === 'Escape') {
      this.open = false
      return { handled: true }
    }
    if (key === 'ArrowUp' || key === 'ArrowDown') {
      const direction = key === 'ArrowDown' ? 1 : -1
      for (let i = 0; i < this.items.length; i++) {
        this.selected = (this.selected + direction + this.items.length) % this.items.length
        if (!this.items[this.selected].disabled) break
      }
      return { handled: true }
    }
    if (key === 'Enter') {
      const item = this.items[this.selected]
      return { handled: true, action: item && !item.disabled ? item.action : undefined }
    }
    return { handled: false }
  }
  get lines(): Record<string, string> {
    return Object.fromEntries(
      this.items.map((item, i) => [
        item.id,
        `${i === this.selected ? '> ' : '  '}${item.label}${item.disabled ? ' (no disponible)' : ''}`,
      ]),
    )
  }
}
