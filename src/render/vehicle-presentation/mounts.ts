import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three'
import type { Group, Object3D } from 'three'
export type Point3 = [number, number, number]
export type SurfaceQuad = [Point3, Point3, Point3, Point3]
export interface InstrumentMounts {
  parent: Object3D
  support: Group
  cluster: {
    position: Point3
    rotation: [number, number, number, number]
    scale: number
    name: string
  }
  menu: SurfaceQuad
  navigator: SurfaceQuad
  navigatorName: string
  retract: { offset: Point3; durationMs: number }
  /** Release only resources installed by the adapter; shared source assets survive. */
  dispose(): void
}
export function quadGeometry(quad: SurfaceQuad): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(quad.flat(), 3))
  geometry.setAttribute('uv', new Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2))
  geometry.setIndex([0, 2, 1, 2, 3, 1])
  return geometry
}
/** Pixel-centred display to a planar local-space mount. */
export function surfaceMatrix(quad: SurfaceQuad, width: number, height: number): Matrix4 {
  if (!(width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)))
    throw new Error('Invalid surface dimensions')
  const a = new Vector3().fromArray(quad[0]),
    b = new Vector3().fromArray(quad[1]),
    c = new Vector3().fromArray(quad[2])
  const x = b.clone().sub(a).divideScalar(width)
  const y = a.clone().sub(c).divideScalar(height)
  const z = x.clone().cross(y).normalize().multiplyScalar(0.00002)
  return new Matrix4().makeBasis(x, y, z).setPosition(b.add(c).multiplyScalar(0.5))
}
