import { Box3, Matrix4, Vector3, type Object3D, type Mesh } from 'three'

/** Extend below the actual authored mouth, independent of the model's pivot. */
export function poseMagazineCapacity(magazine: Object3D, capacity: number): void {
  if (magazine.userData.magazineMouthY === undefined) {
    magazine.updateWorldMatrix(true, true)
    const inverse = new Matrix4().copy(magazine.matrixWorld).invert()
    const bounds = new Box3()
    const point = new Vector3()
    for (const body of magazine.children) {
      if (body.name === 'MagazineTopRound') continue
      body.traverse((node) => {
        const mesh = node as Mesh
        if (!mesh.isMesh) return
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
        const box = mesh.geometry.boundingBox!
        const matrix = new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)
        for (const x of [box.min.x, box.max.x])
          for (const y of [box.min.y, box.max.y])
            for (const z of [box.min.z, box.max.z])
              bounds.expandByPoint(point.set(x, y, z).applyMatrix4(matrix))
      })
    }
    if (bounds.isEmpty()) return
    magazine.userData.magazineMouthY = bounds.max.y
  }
  const top = magazine.userData.magazineMouthY as number
  const factor = capacity > 13 ? 1.75 : 1
  for (const body of magazine.children) {
    if (body.name === 'MagazineTopRound') continue
    const rest = (body.userData.magazineShapeRest ??= {
      y: body.position.y,
      scaleY: body.scale.y,
    })
    body.scale.y = rest.scaleY * factor
    body.position.y = top + (rest.y - top) * factor
  }
}
