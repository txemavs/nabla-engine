import {
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Vector3,
  type Object3D,
} from 'three'
import type { VehicleDefinition } from '../../entity/vehicle/field.js'

/**
 * Flat mirror lenses for bodies whose GLB has no lens material. Each entry is authored in the
 * body model's space (metres); `normal` is the direction the glass faces. The returned meshes
 * are the dark glass shown outside the cockpit and the surface `CarMirrors` replaces with a
 * live reflection for the driver.
 */
export function authoredMirrorLenses(
  model: Object3D,
  mirrors: VehicleDefinition['mirrors'],
): Mesh[] {
  if (!mirrors?.length) return []
  const material = new MeshStandardMaterial({
    name: 'Authored mirror glass',
    color: '#1b2630',
    metalness: 0.9,
    roughness: 0.15,
    side: DoubleSide,
  })
  return mirrors.map((mirror, index) => {
    const normal = new Vector3(...mirror.normal)
    if (normal.length() < 1e-6) throw new Error(`Mirror ${index} has a zero normal`)
    const lens = new Mesh(new PlaneGeometry(mirror.width, mirror.height), material)
    lens.name = `nabla.mirror.${index}`
    lens.position.set(...mirror.position)
    lens.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal.normalize())
    model.add(lens)
    lens.updateMatrix()
    return lens
  })
}
