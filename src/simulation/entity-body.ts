/** Build collision geometry without installing it or owning simulation registries. */
import { Body, Box, Sphere, Trimesh, Vec3, Quaternion, type Material } from './physics.js'
import { isMapBuilding, type Entity, type Transform, type Vec3Tuple } from '../entity/schema.js'
import { portalColliders } from '../entity/portal/portal.js'
import { vehicleDefinition } from '../entity/vehicle/vehicle.js'
import { terrainVertices, terrainIndices } from '../planet/land/terrain.js'
import { roadGeometry } from '../planet/land/roads/draped-road.js'
import { triangles } from '../math/solid/mesh.js'
/** Return an uninstalled body and its map-culling classification, or skip nonphysical/disabled entities. */
export function createEntityBody(
  e: Entity,
  transform: Transform,
  entitiesById: ReadonlyMap<string, Entity>,
  material: Material,
  buildingsEnabled: boolean,
) {
  const roadSurface =
    e.road?.elevation === 'bridge' ||
    (e.road?.mode === 'smooth-float' && (!e.road.elevation || e.road.elevation === 'terrain'))
  // Gallery targets are animated billboards, not trees with stationary trunks.
  const trunk = !!e.sprite && !e.sprite.target
  if ((e.motion === 'none' && !e.portal && !roadSurface && !trunk) || (e.portal && e.parentId))
    return
  if (isMapBuilding(e) && e.motion === 'static' && !buildingsEnabled) return
  const body = new Body({
    mass: e.motion === 'dynamic' ? e.mass : 0,
    material: material,
  })
  const colliders = e.portal
    ? portalColliders(e)
    : e.kind === 'vehicle'
      ? vehicleDefinition(e).colliders
      : [
          {
            size: (e.light && e.light.shape !== 'globe'
              ? [Math.max(e.size[0], 0.44), e.size[1], Math.max(e.size[2], 0.44)]
              : e.size) as Vec3Tuple,
            transform: {
              position: [0, 0, 0] as Vec3Tuple,
              rotation: [0, 0, 0, 1] as [number, number, number, number],
            },
          },
        ]
  if (e.sprite) {
    const height = Math.max(1, e.size[1])
    body.addShape(new Box(new Vec3(0.35, height / 2, 0.35)), new Vec3(0, height / 2, 0))
  }
  if (e.terrain) {
    const t = e.terrain
    // Share the exact rendered triangle grid, including missing-data holes.
    const index = new Uint32Array(terrainIndices(t))
    if (index.length) body.addShape(new Trimesh(new Float32Array(terrainVertices(t).flat()), index))
  }
  const bridgeTerrain = roadSurface ? entitiesById.get(e.road!.terrainId)?.terrain : undefined
  const geometry =
    e.geometry ??
    (bridgeTerrain ? roadGeometry(bridgeTerrain, e.road!.paths, e.road!.width, e.road) : undefined)
  if (geometry) {
    const vertices = new Float32Array(geometry.vertices.length * 3)
    geometry.vertices.forEach((vertex, i) => {
      vertices[i * 3] = vertex[0]
      vertices[i * 3 + 1] = vertex[1]
      vertices[i * 3 + 2] = vertex[2]
    })
    const faces = triangles(geometry)
    const indices = new Uint32Array(faces.length * 3)
    faces.forEach((face, i) => {
      indices[i * 3] = face[0]
      indices[i * 3 + 1] = face[1]
      indices[i * 3 + 2] = face[2]
    })
    if (indices.length >= 3) body.addShape(new Trimesh(vertices, indices))
  }
  const hull = e.vehicle?.plane
    ? colliders.filter((c) => c.transform.position[1] - c.size[1] / 2 > -0.5)
    : colliders
  for (const collider of geometry || e.terrain || e.road || e.sprite ? [] : hull)
    body.addShape(
      new Box(new Vec3(...(collider.size.map((n) => n / 2) as Vec3Tuple))),
      new Vec3(...collider.transform.position),
      new Quaternion(...collider.transform.rotation),
    )
  // Slightly above the tyre, so the wheels still drive. The ball only meets a road lip.
  if (e.vehicle?.plane)
    for (const hub of vehicleDefinition(e).hubs) {
      const gear = new Sphere(Math.max(0.08, vehicleDefinition(e).wheelRadius - 0.05))
      gear.friction = 0
      body.addShape(gear, new Vec3(...hub))
    }
  body.position.set(...transform.position)
  body.quaternion.set(...transform.rotation)
  body.previousPosition.copy(body.position)
  body.previousQuaternion.copy(body.quaternion)
  body.linearDamping = 0.05
  body.angularDamping = 0.35
  return {
    body,
    mapBody: !!(e.source && e.motion === 'static' && !e.terrain && !e.portal) || !!roadSurface,
  }
}
