import type { Object3D } from 'three'
import { smokeTuning } from '../../config/gameplay-tuning.js'
/** Shared live opacity multiplier for exhaust, wrecks, tires and weapon smoke. */
export const smokeDensity = { value: smokeTuning.defaultPercent / 100 }
const defaultDensity = smokeDensity
export function setSmokeDensity(percent: number, smokeDensity = defaultDensity): number {
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

/** Scene-owned density; WeakMap ownership neither leaks scenes nor changes standalone defaults. */
const owners = new WeakMap<Object3D, { value: number }>()
export function bindSmokeDensity(root: Object3D, density: { value: number }): void {
  owners.set(root, density)
}
export function smokeDensityFor(root: Object3D): { readonly value: number } {
  return {
    get value() {
      for (let node: Object3D | null = root; node; node = node.parent) {
        const density = owners.get(node)
        if (density) return density.value
      }
      return smokeDensity.value
    },
  }
}
