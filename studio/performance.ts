import {
  normalizePerformance,
  performanceDefaults,
  performancePresets,
  type PerformanceSettings,
} from '@nabla/engine/runtime'
export {
  performanceDefaults,
  performancePresets,
  performanceProfile,
  streamBudget,
  tileBudget,
  shadowTiers,
  type ShadowTier,
  type PerformanceSettings,
} from '@nabla/engine/runtime'
/** Storage and device preferences belong to the host. */
export function readPerformance(): PerformanceSettings {
  try {
    const stored = localStorage.getItem('nabla.performance.v1')
    if (!stored && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
      return { ...performanceDefaults, ...performancePresets.mobile.settings, preset: 'mobile' }
    return normalizePerformance(JSON.parse(stored ?? '{}'))
  } catch {
    return { ...performanceDefaults }
  }
}
