import { smokeTuning } from '../../config/gameplay-tuning.js'
/** Shared live opacity multiplier for exhaust, wrecks, tires and weapon smoke. */
export const smokeDensity = { value: smokeTuning.defaultPercent / 100 }
export function setSmokeDensity(percent: number): number {
  smokeDensity.value =
    Math.max(
      0,
      Math.min(
        smokeTuning.maxPercent,
        Number.isFinite(percent) ? percent : smokeTuning.defaultPercent,
      ),
    ) / 100
  return smokeDensity.value * 100
}
