/**
 * A scene document: versioned JSON of entities, geography and sky.
 * External data is parsed before it changes any state. Names never select behavior.
 */
import { validateSolid } from '../math/solid/mesh.js'
import { z } from 'zod'
import { entitySchema, type Entity } from '../entity/schema.js'
import { validatePortal } from '../entity/portal/portal.js'
import { validateSprite } from '../entity/sprite/sprite.js'
import { validateVehicle } from '../entity/vehicle/vehicle.js'
import { validateRoad } from '../entity/road/road.js'
import { validateTerrain } from '../entity/terrain/terrain.js'

/** Local cursor bound. Entity positions use the wider frame in `entity/schema.ts`. */
const finite = z.number().finite()
const coordinate = finite.min(-100000).max(100000)
const vector = z.tuple([coordinate, coordinate, coordinate])

const documentSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1).max(100),
    cursor: vector.optional(),
    cursorOnGround: z.boolean().optional(),
    geography: z
      .object({
        latitude: finite.min(-90).max(90),
        longitude: finite.min(-180).max(180),
        altitude: finite.min(-500).max(10000),
        imagery: z.enum(['satellite', 'streets', 'offline']),
        planetary: z.boolean().optional(),
      })
      .strict()
      .optional(),
    sky: z
      .discriminatedUnion('mode', [
        z.object({ mode: z.literal('live') }).strict(),
        z.object({ mode: z.literal('fixed'), at: z.iso.datetime({ offset: true }) }).strict(),
      ])
      .optional(),
    water: z
      .object({
        mode: z.enum(['manual', 'tide']),
        level: finite.min(-5).max(50),
        amplitude: finite.min(0).max(3),
      })
      .strict()
      .optional(),
    entities: z.array(entitySchema).min(1).max(20000),
  })
  .strict()

export type SceneDocument = z.infer<typeof documentSchema>

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
  if (checked.transform && !('groundOffset' in checked)) delete entity.groundOffset
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
    if (e.road) validateRoad(e, byId)
    if (e.kind === 'terrain' || e.terrain) validateTerrain(e)
    if (e.kind === 'solid') {
      if (!e.geometry || e.motion === 'dynamic' || e.visual || e.surface)
        throw new Error('Solids require static or visual topology')
      if (!changed || changed.has(e)) validateSolid(e.geometry)
    } else if (e.geometry) throw new Error('Geometry requires a solid entity')
    if (e.sprite) validateSprite(e)
    if (e.portal) validatePortal(e, byId, !!doc.geography?.planetary)
    if (e.kind === 'vehicle' || e.vehicle) validateVehicle(e)
    if (e.vehicle?.tow) {
      const tractor = byId.get(e.vehicle.tow.vehicleId)
      if (!tractor?.vehicle || tractor.vehicle.passive || tractor.id === e.id)
        throw new Error('Trailer requires a powered towing vehicle')
    }
    if ((e.kind === 'group' || e.kind === 'spawn') && e.motion !== 'none')
      throw new Error('Groups and spawn cannot have physics')
    if ((e.motion === 'dynamic' || e.kind === 'spawn') && e.parentId !== null)
      throw new Error('Dynamic bodies and spawn must be roots')
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
