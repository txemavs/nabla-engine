/** Session-only vehicle health. Physics and presentation consume each destruction once. */
export class VehicleDamage {
  private readonly health = new Map<string, number>()
  private readonly wrecks = new Set<string>()
  private readonly pending: string[] = []
  private readonly impacts = new Map<string, number>()
  remaining(id: string): number {
    return this.health.get(id) ?? 100
  }
  destroyed(id: string): boolean {
    return this.wrecks.has(id)
  }
  apply(id: string, amount: number): boolean {
    if (!Number.isFinite(amount) || amount <= 0 || this.destroyed(id)) return false
    const next = Math.max(0, this.remaining(id) - amount)
    this.health.set(id, next)
    if (next) return false
    this.wrecks.add(id)
    this.pending.push(id)
    return true
  }
  impact(id: string, other: number, speed: number, seconds: number): void {
    if (!Number.isFinite(speed) || speed < 12) return
    const key = `${id}:${other}`
    if (seconds - (this.impacts.get(key) ?? -Infinity) < 1) return
    this.impacts.set(key, seconds)
    if (this.impacts.size > 1024) this.impacts.delete(this.impacts.keys().next().value!)
    this.apply(id, Math.min(100, (speed - 12) * 7))
  }
  drain(): string[] {
    return this.pending.splice(0)
  }
  remove(id: string): void {
    this.health.delete(id)
    this.wrecks.delete(id)
    for (const key of this.impacts.keys()) if (key.startsWith(`${id}:`)) this.impacts.delete(key)
    for (let i = this.pending.length - 1; i >= 0; i--)
      if (this.pending[i] === id) this.pending.splice(i, 1)
  }
}
