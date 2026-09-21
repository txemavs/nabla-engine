import { z } from 'zod'
import { Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three'

/** Engine coordinates: metres, seconds, kilograms; right-handed, +Y up, -Z forward.
 * Persisted rotations are unit quaternions [x,y,z,w]. UI angles are explicitly degrees. */
const finite = z.number().finite()
const coordinate = finite.min(-100000).max(100000)
const vector = z.tuple([coordinate, coordinate, coordinate])
const rotation = z
  .tuple([finite, finite, finite, finite])
  .refine((q) => Math.abs(Math.hypot(...q) - 1) < 1e-5, 'Rotation must be a unit quaternion')
const size = z.tuple([
  finite.min(0.01).max(1000),
  finite.min(0.01).max(1000),
  finite.min(0.01).max(1000),
])
const transform = z.object({ position: vector, rotation }).strict()
const boxCollider = z.object({ size, transform }).strict()
const assetPart = z
  .object({
    url: z.string().regex(/^\/(?!\/)[a-zA-Z0-9_./-]+\.glb$/),
    transform,
  })
  .strict()
const vehicleDefinition = z
  .object({
    colliders: z.array(boxCollider).min(1).max(32),
    hubs: z.tuple([vector, vector, vector, vector]),
    wheelRadius: finite.min(0.05).max(1.5),
    suspensionRest: finite.min(0.02).max(1),
    stiffness: finite.min(5).max(200),
    engineForce: finite.positive().max(100000),
    brakeForce: finite.positive().max(1000),
    driver: vector,
    cameraDistance: finite.min(2).max(30),
    flight: z.boolean().optional(),
    interior: z.object({ min: vector, max: vector, exit: vector }).strict().optional(),
    garage: z
      .object({
        min: vector,
        max: vector,
        ramp: z
          .object({
            colliderIndex: z.number().int().min(0).max(31),
            hinge: vector,
            closeAngle: finite.min(-Math.PI).max(Math.PI),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
const visualDefinition = z
  .object({
    body: assetPart,
    ramp: z
      .object({
        nodes: z.array(z.string()).min(1).max(8),
        hinge: vector,
        closeAngle: finite.min(-Math.PI).max(Math.PI),
      })
      .strict()
      .optional(),
    wheel: assetPart.optional(),
    steering: assetPart.optional(),
    wheelRotations: z.tuple([rotation, rotation, rotation, rotation]).optional(),
  })
  .strict()
const entitySchema = z
  .object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(100),
    parentId: z.string().nullable(),
    kind: z.enum(['group', 'box', 'vehicle', 'spawn']),
    transform,
    size,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    motion: z.enum(['none', 'static', 'dynamic']),
    mass: finite.min(0.1).max(100000),
    vehicle: vehicleDefinition.optional(),
    visual: visualDefinition.optional(),
    portal: z
      .object({
        pairId: z.string().min(1).max(128).nullable(),
        mode: z.enum(['closed', 'window', 'open']),
        clearsRamp: z.boolean().optional(),
      })
      .strict()
      .optional(),
    sprite: z
      .object({
        url: z.string().regex(/^\/(?!\/)[a-zA-Z0-9_./-]+\.png$/),
        target: z.boolean().optional(),
      })
      .strict()
      .optional(),
    surface: z
      .object({ url: z.string().regex(/^\/(?!\/)[a-zA-Z0-9_./-]+\.(jpg|jpeg|png)$/) })
      .strict()
      .optional(),
  })
  .strict()
const documentSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(100),
    geography: z
      .object({
        latitude: finite.min(-90).max(90),
        longitude: finite.min(-180).max(180),
        altitude: finite.min(-500).max(10000),
        imagery: z.enum(['satellite', 'streets', 'offline']),
      })
      .strict()
      .optional(),
    sky: z
      .discriminatedUnion('mode', [
        z.object({ mode: z.literal('live') }).strict(),
        z.object({ mode: z.literal('fixed'), at: z.iso.datetime({ offset: true }) }).strict(),
      ])
      .optional(),
    entities: z.array(entitySchema).min(1).max(2000),
  })
  .strict()
export type VehicleDefinition = z.infer<typeof vehicleDefinition>
export type VisualDefinition = z.infer<typeof visualDefinition>
export type Entity = z.infer<typeof entitySchema>
export type SceneDocument = z.infer<typeof documentSchema>
export type Transform = Entity['transform']
export type Vec3Tuple = [number, number, number]
export type QuatTuple = [number, number, number, number]

export function rotationDegrees(x: number, y: number, z: number): QuatTuple {
  return new Quaternion()
    .setFromEuler(new Euler((x * Math.PI) / 180, (y * Math.PI) / 180, (z * Math.PI) / 180, 'YXZ'))
    .toArray()
}
export function toDegrees(q: QuatTuple): Vec3Tuple {
  const e = new Euler().setFromQuaternion(new Quaternion(...q), 'YXZ')
  return [e.x, e.y, e.z].map((n) => (n * 180) / Math.PI) as Vec3Tuple
}
export function createEntity(
  id: string,
  kind: Entity['kind'],
  position: Vec3Tuple = [0, 0, 0],
): Entity {
  return {
    id,
    name:
      kind === 'vehicle'
        ? 'Coche'
        : kind === 'spawn'
          ? 'Inicio'
          : kind === 'group'
            ? 'Grupo'
            : 'Bloque',
    kind,
    parentId: null,
    transform: { position, rotation: [0, 0, 0, 1] },
    size: kind === 'vehicle' ? [1.8, 0.65, 4] : [2, 2, 2],
    color: kind === 'vehicle' ? '#e9a34e' : '#6c8492',
    motion: kind === 'vehicle' ? 'dynamic' : kind === 'box' ? 'static' : 'none',
    mass: kind === 'vehicle' ? 1200 : 40,
  }
}

/** Validates external data before changing any state. Names never select behavior. */
export function parseScene(raw: unknown): SceneDocument {
  const doc = documentSchema.parse(raw)
  const byId = new Map(doc.entities.map((e) => [e.id, e]))
  if (byId.size !== doc.entities.length) throw new Error('Duplicate entity ID')
  if (doc.entities.filter((e) => e.kind === 'spawn').length !== 1)
    throw new Error('Scene requires exactly one spawn')
  for (const e of doc.entities) {
    if (e.sprite && (e.kind !== 'group' || e.motion !== 'none' || e.portal))
      throw new Error('Sprites require nonphysical groups without portal surfaces')
    if (e.portal) {
      if (e.kind !== 'group' || e.motion !== 'none')
        throw new Error('Portals must be nonphysical groups')
      if (e.parentId && byId.get(e.parentId)?.kind !== 'vehicle')
        throw new Error('Hosted portals require a vehicle parent')
      if (e.portal.clearsRamp && (!e.parentId || !byId.get(e.parentId)?.vehicle?.garage?.ramp))
        throw new Error('Ramp clearance requires a carrier ramp')
      const up = new Vector3(0, 1, 0).applyQuaternion(new Quaternion(...e.transform.rotation))
      if (!e.parentId && up.distanceTo(new Vector3(0, 1, 0)) > 1e-5)
        throw new Error('This portal release requires upright fixed mouths')
      if (e.portal.pairId === null) {
        if (e.portal.mode !== 'closed') throw new Error('An unlinked portal must be closed')
      } else {
        const pair = byId.get(e.portal.pairId)
        if (!pair?.portal || pair.id === e.id || pair.portal.pairId !== e.id)
          throw new Error('Portal links must be reciprocal between distinct mouths')
        if (
          pair.portal.mode !== e.portal.mode ||
          pair.size.some((n, i) => Math.abs(n - e.size[i]) > 1e-6)
        )
          throw new Error('Paired portals must have equal apertures and modes')
      }
    }
    if (e.vehicle && e.kind !== 'vehicle') throw new Error('Vehicle definition requires a vehicle')
    if (
      e.vehicle?.garage?.ramp &&
      e.vehicle.garage.ramp.colliderIndex >= e.vehicle.colliders.length
    )
      throw new Error('Ramp collider does not exist')
    if (
      e.vehicle?.interior &&
      (e.vehicle.interior.min.some((n, i) => n >= e.vehicle!.interior!.max[i]) ||
        e.vehicle.interior.exit.some(
          (n, i) => n < e.vehicle!.interior!.min[i] || n > e.vehicle!.interior!.max[i],
        ))
    )
      throw new Error('Invalid interior bounds or exit')
    if (e.vehicle?.garage && e.vehicle.garage.min.some((v, i) => v >= e.vehicle!.garage!.max[i]))
      throw new Error('Garage bounds are invalid')
    if ((e.kind === 'group' || e.kind === 'spawn') && e.motion !== 'none')
      throw new Error('Groups and spawn cannot have physics')
    if (e.kind === 'vehicle' && (e.motion !== 'dynamic' || e.parentId !== null))
      throw new Error('Vehicles must be dynamic roots')
    if ((e.motion === 'dynamic' || e.kind === 'spawn') && e.parentId !== null)
      throw new Error('Dynamic bodies and spawn must be roots')
    if (e.kind === 'vehicle' && (e.size[0] < 1 || e.size[1] < 0.3 || e.size[2] < 2))
      throw new Error('Vehicle is too small')
    const seen = new Set([e.id])
    let parentId = e.parentId
    while (parentId !== null) {
      if (seen.has(parentId)) throw new Error('Scene hierarchy contains a cycle')
      if (seen.size >= 64) throw new Error('Scene hierarchy exceeds 64 levels')
      seen.add(parentId)
      const parent = byId.get(parentId)
      if (!parent) throw new Error('Unknown parent: ' + parentId)
      if (parent.kind === 'spawn') throw new Error('Spawn cannot have children')
      if (e.motion !== 'none' && parent.motion === 'dynamic')
        throw new Error('A collider cannot be parented to a dynamic body')
      parentId = parent.parentId
    }
  }
  return doc
}

/** Rigid transforms only. Object dimensions are geometry, never inherited scale. */
export class SceneGraph {
  readonly root = new Object3D()
  private readonly nodes = new Map<string, Object3D>()
  constructor(document: SceneDocument) {
    const doc = parseScene(document)
    for (const e of doc.entities) {
      const node = new Object3D()
      node.name = e.id
      node.position.fromArray(e.transform.position)
      node.quaternion.fromArray(e.transform.rotation)
      this.nodes.set(e.id, node)
    }
    for (const e of doc.entities)
      (e.parentId ? this.node(e.parentId) : this.root).add(this.node(e.id))
    this.root.updateMatrixWorld(true)
  }
  private node(id: string): Object3D {
    const node = this.nodes.get(id)
    if (!node) throw new Error('Unknown entity: ' + id)
    return node
  }
  worldTransform(id: string): Transform {
    const node = this.node(id)
    return {
      position: node.getWorldPosition(new Vector3()).toArray(),
      rotation: node.getWorldQuaternion(new Quaternion()).toArray(),
    }
  }
  localFromWorld(parentId: string | null, pose: Transform): Transform {
    const world = new Matrix4().compose(
      new Vector3(...pose.position),
      new Quaternion(...pose.rotation),
      new Vector3(1, 1, 1),
    )
    if (parentId) {
      const parent = this.node(parentId)
      parent.updateWorldMatrix(true, false)
      world.premultiply(parent.matrixWorld.clone().invert())
    }
    const p = new Vector3(),
      q = new Quaternion(),
      s = new Vector3()
    world.decompose(p, q, s)
    return { position: p.toArray(), rotation: q.normalize().toArray() }
  }
}
