/** UI ownership only; never owns physics or the authored scene. */
export class StudioInputOwner {
  private active = true
  private visible = true
  private interactions = 0
  constructor(private readonly releaseInput: () => void) {}
  get acceptsInput(): boolean {
    return this.active && this.visible && this.interactions === 0
  }
  setActive(value: boolean): void {
    this.active = value
    this.changed()
  }
  setVisible(value: boolean): void {
    this.visible = value
    this.changed()
  }
  beginInteraction(): void {
    this.interactions++
    this.changed()
  }
  endInteraction(): void {
    this.interactions = Math.max(0, this.interactions - 1)
  }
  private changed(): void {
    if (!this.acceptsInput) this.releaseInput()
  }
}
