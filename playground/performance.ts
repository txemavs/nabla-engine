export interface PerformanceSettings {
  roads: number
  buildings: number
  distance: number
  collisions: number
  resolution: number
  shadows: number
}

/** CSM configuration per quality tier. */
export interface ShadowTier {
  cascades: number
  mapSize: number
  maxFar: number
}

/** Mapping from shadow quality value to CSM configuration. */
export const shadowTiers: Record<number, ShadowTier | null> = {
  0: null, // disabled
  512: { cascades: 1, mapSize: 512, maxFar: 40 },
  1024: { cascades: 2, mapSize: 1024, maxFar: 200 },
  2048: { cascades: 3, mapSize: 2048, maxFar: 500 },
}

export const performanceDefaults: PerformanceSettings = {
  roads: 1000,
  buildings: 1,
  distance: 4000,
  collisions: 400,
  resolution: 1.25,
  shadows: 512,
}
export function readPerformance(): PerformanceSettings {
  try {
    const s = JSON.parse(localStorage.getItem('nabla.performance.v1') ?? '{}')
    const choose = (value: number, allowed: number[], fallback: number) =>
      allowed.includes(value) ? value : fallback
    return {
      roads: choose(s.roads, [0, 250, 500, 1000, 2000, 4000, 6000], 1000),
      buildings: choose(s.buildings, [0, 1], 1),
      distance: choose(s.distance, [1000, 2000, 4000, 6000], 4000),
      collisions: choose(s.collisions, [200, 400, 800, 2000], 400),
      resolution: choose(s.resolution, [0.75, 1, 1.25, 2], 1.25),
      shadows: choose(s.shadows, [0, 512, 1024, 2048], 512),
    }
  } catch {
    return { ...performanceDefaults }
  }
}
