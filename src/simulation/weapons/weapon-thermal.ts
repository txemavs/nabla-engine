/** Provisional thermal response: coefficients require measurements before training validation. */
export class WeaponThermal {
  ambientC = 20
  barrelC = 20
  slideC = 20
  heatPerShotC = 0.8
  private time: number | null = null
  reset(): void {
    this.barrelC = this.slideC = this.ambientC
    this.time = null
  }
  step(now: number): void {
    if (!Number.isFinite(now)) return
    const dt = this.time === null ? 0 : Math.max(0, (now - this.time) / 1000)
    this.time = now
    this.barrelC = this.ambientC + (this.barrelC - this.ambientC) * Math.exp(-dt / 90)
    this.slideC = this.ambientC + (this.slideC - this.ambientC) * Math.exp(-dt / 150)
  }
  shot(now: number): void {
    this.step(now)
    this.barrelC += this.heatPerShotC
    this.slideC += this.heatPerShotC * 0.18
  }
}
