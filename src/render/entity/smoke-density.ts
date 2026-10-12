/** Shared live opacity multiplier for exhaust, wrecks, tires and weapon smoke. */
export const smokeDensity = { value: 0.5 }
export function setSmokeDensity(percent: number): number {
  smokeDensity.value = Math.max(0, Math.min(300, Number.isFinite(percent) ? percent : 50)) / 100
  return smokeDensity.value * 100
}
