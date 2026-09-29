/** Menus emit declarative actions. The host decides how to edit its scene or pilot a vehicle. */
export interface MonitorAction {
  type: string
  value?: string
}
export interface MonitorMenuItem {
  id: string
  label: string
  action?: MonitorAction
  children?: readonly MonitorMenuItem[]
  back?: boolean
  disabled?: boolean
}
export class MonitorMenu {
  selected = 0
  open = false
  private stack: { items: readonly MonitorMenuItem[]; selected: number; title: string }[] = []
  constructor(
    public items: readonly MonitorMenuItem[],
    public title = '',
  ) {}
  get depth(): number {
    return this.stack.length
  }
  private back(): void {
    const parent = this.stack.pop()
    if (parent) {
      this.items = parent.items
      this.selected = parent.selected
      this.title = parent.title
    } else this.open = false
  }
  key(key: string): { handled: boolean; action?: MonitorAction } {
    if (!this.open) return { handled: false }
    if (key === 'Escape') {
      this.back()
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
      if (item && !item.disabled) {
        if (item.back) this.back()
        else if (item.children) {
          this.stack.push({ items: this.items, selected: this.selected, title: this.title })
          this.items = item.children
          this.selected = 0
          this.title = item.label
        } else return { handled: true, action: item.action }
      }
      return { handled: true }
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
