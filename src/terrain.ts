import type { Vec3Tuple } from './scene.js'
export interface TerrainData {
  columns: number
  rows: number
  spacing: number
  heights: number[]
}
/** Exact triangular interpolation matching the Cannon heightfield and render mesh. */
export function terrainHeight(t: TerrainData, x: number, z: number): number {
  let u = x / t.spacing + (t.columns - 1) / 2,
    v = z / t.spacing + (t.rows - 1) / 2
  // Fractional XYZ widths can land a few ulps beyond a mathematically shared edge.
  const epsilon = 1e-8
  if (u < -epsilon || v < -epsilon || u > t.columns - 1 + epsilon || v > t.rows - 1 + epsilon)
    throw new Error('Outside terrain coverage')
  u = Math.max(0, Math.min(t.columns - 1, u))
  v = Math.max(0, Math.min(t.rows - 1, v))
  const i = Math.min(t.columns - 2, Math.floor(u)),
    j = Math.min(t.rows - 2, Math.floor(v)),
    fx = u - i,
    fz = v - j
  const a = t.heights[j * t.columns + i],
    b = t.heights[j * t.columns + i + 1],
    c = t.heights[(j + 1) * t.columns + i],
    d = t.heights[(j + 1) * t.columns + i + 1]
  return fx <= fz ? a * (1 - fz) + c * (fz - fx) + d * fx : a * (1 - fx) + d * fz + b * (fx - fz)
}
export function terrainVertices(t: TerrainData): Vec3Tuple[] {
  return t.heights.map((h, i) => [
    ((i % t.columns) - (t.columns - 1) / 2) * t.spacing,
    h,
    (Math.floor(i / t.columns) - (t.rows - 1) / 2) * t.spacing,
  ])
}
export function terrainIndices(t: TerrainData): number[] {
  const indices: number[] = []
  for (let z = 0; z < t.rows - 1; z++)
    for (let x = 0; x < t.columns - 1; x++) {
      const a = z * t.columns + x,
        b = a + 1,
        c = a + t.columns,
        d = c + 1
      indices.push(a, c, d, a, d, b)
    }
  return indices
}
