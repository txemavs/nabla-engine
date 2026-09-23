import { boxSolid, validateSolid } from './solid.js'
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
  finite.min(0.01).max(10000),
  finite.min(0.01).max(10000),
  finite.min(0.01).max(10000),
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
    mapBaseline: z
      .string()
      .regex(/^[0-9a-f]{16}$/)
      .optional(),
    kind: z.enum(['group', 'box', 'vehicle', 'spawn', 'solid', 'terrain']),
    transform,
    geoAnchor: z
      .object({
        latitude: finite.min(-90).max(90),
        longitude: finite.min(-180).max(180),
        altitude: finite,
      })
      .strict()
      .optional(),
    size,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    motion: z.enum(['none', 'static', 'dynamic']),
    mass: finite.min(0.1).max(100000),
    light: z
      .object({
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        intensity: finite.min(0).max(10000),
        distance: finite.min(1).max(100),
        enabled: z.boolean(),
        nightOnly: z.boolean(),
      })
      .strict()
      .optional(),
    railway: z
      .object({ part: z.enum(['ballast', 'rail']) })
      .strict()
      .optional(),
    placeLabel: z
      .object({ text: z.string().min(1).max(100), category: z.enum(['city', 'town', 'village']) })
      .strict()
      .optional(),
    road: z
      .object({
        paths: z.array(z.array(vector).min(2).max(8192)).min(1).max(8192),
        width: finite.min(0.5).max(30),
        terrainId: z.string(),
        renderSuppressed: z.boolean().optional(),
        mode: z.enum(['raw', 'smooth-float']).optional(),
        elevation: z.enum(['terrain', 'bridge', 'tunnel']).optional(),
        profiled: z.boolean().optional(),
        layer: z.number().int().min(-5).max(5).optional(),
      })
      .strict()
      .optional(),
    terrain: z
      .object({
        columns: z.number().int().min(2).max(129),
        rows: z.number().int().min(2).max(129),
        spacing: finite.min(0.25).max(100),
        heights: z.array(coordinate).min(4).max(16641),
        colors: z
          .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
          .min(4)
          .max(16641)
          .optional(),
      })
      .strict()
      .optional(),
    mapEditable: z.boolean().optional(),
    source: z
      .object({
        provider: z.enum(['openstreetmap', 'geoeuskadi']),
        dataset: z.string().optional(),
        revision: z.string().optional(),
        id: z.string().min(1).max(160),
        retrievedAt: z.string(),
        tags: z.record(z.string(), z.string()),
      })
      .strict()
      .refine(
        (source) =>
          source.provider === 'openstreetmap'
            ? /^(way|node|relation)\/\d+$/.test(source.id)
            : !!source.dataset && /^[a-f0-9]{64}$/.test(source.revision ?? ''),
        'Invalid provider provenance',
      )
      .optional(),
    geometry: z
      .object({
        vertices: z.array(vector).max(2048),
        edges: z
          .array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]))
          .max(8192),
        faces: z.array(z.array(z.number().int().nonnegative()).min(3).max(64)).max(4096),
        roofFaces: z.array(z.number().int().nonnegative()).max(4096).optional(),
      })
      .strict()
      .optional(),
    roofColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
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
        upright: z.boolean().optional(),
        saturation: finite.min(0).max(1).optional(),
        groundShadow: z.boolean().optional(),
      })
      .strict()
      .optional(),
    surface: z
      .object({ url: z.string().regex(/^\/(?!\/)[a-zA-Z0-9_./-]+\.(jpg|jpeg|png)$/) })
      .strict()
      .optional(),
    landcover: z
      .object({
        surface: z.enum([
          'grass',
          'forest',
          'farmland',
          'sand',
          'scrub',
          'water',
          'wetland',
          'rock',
          'residential',
          'industrial',
          'default',
        ]),
        isWater: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict()
const documentSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(100),
    cursor: vector.optional(),
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
    entities: z.array(entitySchema).min(1).max(20000),
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
    ...(kind === 'terrain'
      ? {
          name: 'Terreno',
          motion: 'static' as const,
          terrain: { columns: 2, rows: 2, spacing: 2, heights: [0, 0, 0, 0] },
        }
      : {}),
    ...(kind === 'solid'
      ? { name: 'Edificio', motion: 'static' as const, geometry: boxSolid([2, 2, 2]) }
      : {}),
  }
}

/** Validates external data before changing any state. Names never select behavior. */
export function parseScene(raw: unknown, experimentalLargeScene = false): SceneDocument {
  const schema = experimentalLargeScene
    ? documentSchema.extend({ entities: z.array(entitySchema).min(1) })
    : documentSchema
  return validateScene(schema.parse(raw))
}

/** Internal streaming transaction over an already validated, privately owned document.
 * Retained geometry must be immutable; edits use parseScene instead. References are
 * rechecked globally, but only incoming topology is parsed and validated again. */
export function replaceMapScene(
  document: SceneDocument,
  remove: Set<string>,
  add: Entity[],
  experimentalLargeScene = false,
): SceneDocument {
  const additions = z.array(entitySchema).max(20000).parse(add)
  const entities = [...document.entities.filter((e) => !remove.has(e.id)), ...additions]
  if (
    !entities.length ||
    (!experimentalLargeScene && entities.length > 20000 && !(add.length === 0 && remove.size > 0))
  )
    throw new Error('Scene entity limit exceeded')
  return validateScene({ ...document, entities }, new Set(additions))
}

/** Patch a privately owned validated scene without reparsing unrelated geometry. */
export function updateSceneEntity(
  document: SceneDocument,
  id: string,
  patch: Partial<Omit<Entity, 'id' | 'parentId'>>,
): SceneDocument {
  const index = document.entities.findIndex((e) => e.id === id)
  if (index < 0) throw new Error('Unknown entity: ' + id)
  const checked = entitySchema.omit({ id: true, parentId: true }).partial().parse(patch)
  // Partial updates may omit required fields, but must not erase them with undefined.
  for (const key of Object.keys(checked) as (keyof typeof checked)[])
    if (checked[key] === undefined)
      Object.assign(checked, { [key]: entitySchema.shape[key].parse(undefined) })
  const previous = document.entities[index]
  if (
    Object.keys(checked).every(
      (key) =>
        JSON.stringify(previous[key as keyof Entity]) ===
        JSON.stringify(checked[key as keyof typeof checked]),
    )
  )
    return document
  const entity = { ...previous, ...checked }
  const entities = [...document.entities]
  entities[index] = entity
  // Topology was already validated unless this transaction actually changes it.
  return validateScene({ ...document, entities }, new Set('geometry' in checked ? [entity] : []))
}

function validateScene(doc: SceneDocument, changed?: Set<Entity>): SceneDocument {
  const byId = new Map(doc.entities.map((e) => [e.id, e]))
  if (byId.size !== doc.entities.length) throw new Error('Duplicate entity ID')
  if (doc.entities.filter((e) => e.kind === 'spawn').length !== 1)
    throw new Error('Scene requires exactly one spawn')
  for (const e of doc.entities) {
    if (
      e.road &&
      (e.kind !== 'group' || e.sprite || e.portal || byId.get(e.road.terrainId)?.kind !== 'terrain')
    )
      throw new Error('Roads require a group and terrain reference')
    if (e.kind === 'terrain') {
      if (
        !e.terrain ||
        e.terrain.heights.length !== e.terrain.columns * e.terrain.rows ||
        (e.terrain.colors && e.terrain.colors.length !== e.terrain.heights.length) ||
        e.motion === 'dynamic' ||
        e.visual ||
        e.surface
      )
        throw new Error('Invalid terrain grid')
    } else if (e.terrain) throw new Error('Terrain requires a terrain entity')
    if (e.kind === 'solid') {
      if (!e.geometry || e.motion === 'dynamic' || e.visual || e.surface)
        throw new Error('Solids require static or visual topology')
      if (!changed || changed.has(e)) validateSolid(e.geometry)
    } else if (e.geometry) throw new Error('Geometry requires a solid entity')
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

const validatedGraph = Symbol('validated graph')

/** Rigid transforms only. Object dimensions are geometry, never inherited scale. */
export class SceneGraph {
  readonly root = new Object3D()
  private readonly nodes = new Map<string, Object3D>()
  /** Internal fast path: caller must have just validated this document with parseScene. */
  static fromValidated(document: SceneDocument): SceneGraph {
    return new SceneGraph(document, validatedGraph)
  }
  constructor(document: SceneDocument, token?: symbol) {
    const doc = token === validatedGraph ? document : parseScene(document)
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

/** Authored road solids retain OSM provenance but are not optional map buildings. */
export function isMapBuilding(entity?: Entity): boolean {
  return !!(
    entity?.source &&
    entity.geometry &&
    !entity.landcover &&
    !entity.railway &&
    !entity.source.tags.highway
  )
}
