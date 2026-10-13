import { weaponHeatTuning } from '../../config/gameplay-tuning.js'
/** Arcade thermal response; these temperatures are not real-world measurements. */
export class WeaponThermal {
  ambientC = 20
  barrelC = 20
  slideC = 20
  heatPerShotC = weaponHeatTuning.heatPerShotC
  get heat(): number {
    return Math.max(0, Math.min(1, (this.barrelC - this.ambientC) / weaponHeatTuning.hotRiseC))
  }
  get spreadRadians(): number {
    return (
      (Math.max(
        0,
        (this.heat - weaponHeatTuning.spreadStarts) / (1 - weaponHeatTuning.spreadStarts),
      ) *
        weaponHeatTuning.maxSpreadDegrees *
        Math.PI) /
      180
    )
  }
  get ruptured(): boolean {
    return this.heat >= weaponHeatTuning.ruptureHeat
  }
  private time: number | null = null
  reset(): void {
    this.barrelC = this.slideC = this.ambientC
    this.time = null
  }
  step(now: number): void {
    if (!Number.isFinite(now)) return
    const dt = this.time === null ? 0 : Math.max(0, (now - this.time) / 1000)
    this.time = now
    this.barrelC =
      this.ambientC +
      (this.barrelC - this.ambientC) * Math.exp(-dt / weaponHeatTuning.coolingSeconds)
    this.slideC = this.ambientC + (this.slideC - this.ambientC) * Math.exp(-dt / 150)
  }
  shot(now: number): void {
    this.step(now)
    this.barrelC = Math.min(
      this.ambientC + weaponHeatTuning.hotRiseC * 1.5,
      this.barrelC + this.heatPerShotC,
    )
    // Only the barrel is heated; slide temperature is retained for legacy diagnostics.
  }
}
