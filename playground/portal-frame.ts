import type { BufferGeometry } from 'three'

/** Agency's four frame bars have inward winding and smoothed box corners. */
export function repairPortalFrame(source: BufferGeometry): BufferGeometry {
  const copy = source.clone()
  const indices = copy.getIndex()
  if (!indices) throw new Error('Expected indexed Agency portal frame')
  for (let i = 0; i < indices.count; i += 3) {
    const second = indices.getX(i + 1)
    indices.setX(i + 1, indices.getX(i + 2))
    indices.setX(i + 2, second)
  }
  // Each rectangular face gets its own normal; no false rounded/concave shading.
  const flat = copy.toNonIndexed()
  copy.dispose()
  flat.computeVertexNormals()
  return flat
}
