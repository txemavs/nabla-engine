/**
 * Flatten one planet GLB mesh into transferred typed arrays.
 *
 * Atlas candidate road GLBs (`asphalt-candidate-*.glb`, `road-collision-candidate-*.glb`,
 * `supports-candidate-*.glb`) publish POSITION only. Missing NORMALs are computed here so the
 * worker can install the layer instead of failing the whole cell.
 */
import { Matrix3, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry } from 'three'
import { seaCoverageIndex } from '../../planet/sea-coverage.js'
import { isCandidateRoadKind, tagCandidateRoadMesh, type PlanetMesh } from '../../planet/index.js'

export const PLANET_MESH_VERTEX_LIMIT = 4_000_000

/** Compute missing vertex normals, then reject meshes without POSITION or with too many verts. */
export function preparePlanetMeshGeometry(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position')
  if (!position || position.count > PLANET_MESH_VERTEX_LIMIT) throw Error('Invalid planet mesh')
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const normal = geometry.getAttribute('normal')
  if (!normal) throw Error('Invalid planet mesh')
  return {
    position,
    normal,
    color: geometry.getAttribute('color'),
    uv: geometry.getAttribute('uv'),
  }
}

/** Same conversion the planet worker applies to every GLB mesh in a cell. */
export function convertPlanetGlbMesh(
  mesh: Mesh,
  options: { kind: string; anchorAltitude: number },
): { mesh: PlanetMesh; image?: CanvasImageSource } | undefined {
  const g = mesh.geometry
  const { position, normal, color, uv: uvAttr } = preparePlanetMeshGeometry(g)
  const p = new Float32Array(position.count * 3),
    n = new Float32Array(position.count * 3),
    c = color ? new Float32Array(position.count * 3) : undefined,
    uv = uvAttr ? new Float32Array(uvAttr.count * 2) : undefined
  const nm = new Matrix3().getNormalMatrix(mesh.matrixWorld)
  for (let i = 0; i < position.count; i++) {
    p.set(
      new Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).toArray(),
      i * 3,
    )
    n.set(
      new Vector3().fromBufferAttribute(normal, i).applyMatrix3(nm).normalize().toArray(),
      i * 3,
    )
    if (c && color) c.set([color.getX(i), color.getY(i), color.getZ(i)], i * 3)
    if (uv && uvAttr) uv.set([uvAttr.getX(i), uvAttr.getY(i)], i * 2)
  }
  if (!p.every(Number.isFinite) || !n.every(Number.isFinite)) throw Error('Invalid GLB coordinates')
  const material = (
    Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
  ) as MeshStandardMaterial
  const originalIndex = g.index ? new Uint32Array(g.index.array) : undefined
  const index = seaCoverageIndex(p, originalIndex, mesh.userData, options.anchorAltitude)
  if (index?.length === 0) return
  const metadata = { ...mesh.userData }
  // Atlas LiDAR terrain (`terrain-lidar-*.glb`) has no category: it is one 2 m grid mesh. Declare
  // it as terrain so it is rendered, collided with and draped like the engine's own terrain.
  if (metadata.nablaTerrainLidar && !metadata.category) metadata.category = 'Terrain'
  if (isCandidateRoadKind(options.kind)) tagCandidateRoadMesh(metadata, options.kind)
  if (index !== originalIndex) delete metadata.parts
  const converted: PlanetMesh = {
    name: mesh.name,
    position: p,
    normal: n,
    color: c,
    uv,
    index,
    tint: '#' + material.color.getHexString(),
    side: material.side,
    metadata,
  }
  const image = material.map?.image
  return uv && image ? { mesh: converted, image: image as CanvasImageSource } : { mesh: converted }
}
