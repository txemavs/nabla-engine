import type { PlanetMesh } from '../src/planet-artifact.js'
/** Rasterize once in the loader worker; cockpit charts never redraw the 3D scene. */
export function planetChart(meshes: PlanetMesh[]) {
  const roads = meshes.filter((m) => m.metadata.category === 'Roads')
  let minX = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxZ = -Infinity
  for (const m of roads)
    for (let i = 0; i < m.position.length; i += 3) {
      minX = Math.min(minX, m.position[i])
      maxX = Math.max(maxX, m.position[i])
      minZ = Math.min(minZ, m.position[i + 2])
      maxZ = Math.max(maxZ, m.position[i + 2])
    }
  if (!(maxX > minX && maxZ > minZ)) return undefined
  const canvas = new OffscreenCanvas(1024, 1024)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#549bd3'
  for (const m of roads) {
    const count = m.index?.length ?? m.position.length / 3
    // Bounded paths avoid browser path-size limits on dense transport tiles.
    for (let start = 0; start < count; start += 3000) {
      ctx.beginPath()
      for (let i = start; i < Math.min(start + 3000, count); i += 3) {
        for (let j = 0; j < 3; j++) {
          const k = (m.index?.[i + j] ?? i + j) * 3
          const x = ((m.position[k] - minX) * 1024) / (maxX - minX)
          const y = ((m.position[k + 2] - minZ) * 1024) / (maxZ - minZ)
          if (j) ctx.lineTo(x, y)
          else ctx.moveTo(x, y)
        }
        ctx.closePath()
      }
      ctx.fill()
    }
  }
  return {
    bitmap: canvas.transferToImageBitmap(),
    bounds: [minX, minZ, maxX, maxZ] as [number, number, number, number],
  }
}
