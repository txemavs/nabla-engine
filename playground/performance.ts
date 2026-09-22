export interface PerformanceSettings {
  roads: number
  buildings: number
  distance: number
  collisions: number
  resolution: number
  shadows: number
}
export const performanceDefaults: PerformanceSettings = {
  roads: 1000,
  buildings: 1,
  distance: 4000,
  collisions: 400,
  resolution: 1.25,
  shadows: 1024,
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
      shadows: choose(s.shadows, [0, 512, 1024, 2048], 1024),
    }
  } catch {
    return { ...performanceDefaults }
  }
}
