import { vehicleDamageTuning as tuning } from '../config/gameplay-tuning.js'

/** Session-only vehicle health. Physics and presentation consume each destruction once. */
export class VehicleDamage {
  private readonly health = new Map<string, number>()
  private readonly wrecks = new Set<string>()
  private readonly pending: string[] = []
  private readonly impacts = new Map<string, { at: number; damage: number }>()
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
  impact(id: string, _other: number, speed: number, seconds: number): void {
    if (!Number.isFinite(speed) || !Number.isFinite(seconds) || speed <= tuning.minimumImpactSpeed)
      return
    const amount =
      speed >= tuning.catastrophicImpactSpeed
        ? 100
        : Math.min(
            tuning.maxOrdinaryDamage,
            (speed - tuning.minimumImpactSpeed) * tuning.damagePerSpeed,
          )
    const previous = this.impacts.get(id)
    // Several wheels/panels may strike different colliders during the same blow.
    // Charge its strongest contact, including a later catastrophic contact.
    if (previous && seconds >= previous.at && seconds - previous.at < tuning.contactWindowSeconds) {
      this.apply(id, Math.max(0, amount - previous.damage))
      previous.damage = Math.max(previous.damage, amount)
      return
    }
    this.impacts.set(id, { at: seconds, damage: amount })
    this.apply(id, amount)
  }
  drain(): string[] {
    return this.pending.splice(0)
  }
  remove(id: string): void {
    this.health.delete(id)
    this.wrecks.delete(id)
    this.impacts.delete(id)
    for (let i = this.pending.length - 1; i >= 0; i--)
      if (this.pending[i] === id) this.pending.splice(i, 1)
  }
}
