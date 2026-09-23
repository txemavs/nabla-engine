import { portalRegistry, type PortalConnection } from './portal-registry.js'
import { z } from 'zod'
import { parseScene, type SceneDocument } from '../../src/scene.js'
import { toWorldPose, fromWorldPose, type WorldPose } from '../../src/world-pose.js'

/** Places retain payloads and working frames; planet poses address root objects globally. */
export interface StudioProject {
  format: 'nabla-project'
  version: 2 | 3
  planetId?: string
  bookmarks?: { name: string; latitude: number; longitude: number }[]
  objects: PlanetObject[]
  connections?: PortalConnection[]
  name: string
  activeLocation: string
  locations: { id: string; scene: SceneDocument }[]
}
export interface PlanetObject {
  id: string
  locationId: string
  entityId: string
  pose: WorldPose
}
const worldPoseSchema = z
  .object({
    frame: z.literal('nabla-earth-sphere-v1'),
    position: z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]),
    rotation: z
      .tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
      .refine((q) => Math.abs(Math.hypot(...q) - 1) < 1e-5, 'Expected unit rotation'),
  })
  .strict()
const planetObjectSchema = z
  .object({
    id: z.string().min(1).max(160),
    locationId: z.string().min(1).max(160),
    entityId: z.string().min(1).max(128),
    pose: worldPoseSchema,
  })
  .strict()
const schema = z
  .object({
    format: z.literal('nabla-project'),
    version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    planetId: z.string().uuid().optional(),
    bookmarks: z
      .array(
        z
          .object({
            name: z.string().max(100),
            latitude: z.number().min(-85.051129).max(85.051129),
            longitude: z.number().min(-180).max(180),
          })
          .strict(),
      )
      .max(10000)
      .optional(),
    objects: z.array(planetObjectSchema).max(100000).optional(),
    connections: z
      .array(
        z
          .object({
            source: z.string().max(400),
            destination: z.string().max(400),
            mode: z.enum(['closed', 'window']),
          })
          .strict(),
      )
      .max(10000)
      .optional(),
    name: z.string().trim().min(1).max(100),
    activeLocation: z.string().min(1).max(160),
    locations: z
      .array(z.object({ id: z.string().min(1).max(160), scene: z.unknown() }).strict())
      .min(1)
      .max(64),
  })
  .strict()
export function locationId(scene: SceneDocument): string {
  const geo = scene.geography
  if (geo?.planetary) return 'planet'
  return geo && (geo.planetary || scene.entities.some((e) => e.terrain))
    ? `geo:${geo.latitude.toFixed(6)}:${geo.longitude.toFixed(6)}`
    : `local:${scene.name}`
}
export function createProject(scene: SceneDocument): StudioProject {
  const id = locationId(scene)
  return unifyPlanet(
    synchronizeWorldObjects({
      format: 'nabla-project',
      version: 2,
      objects: [],
      name: scene.name,
      activeLocation: id,
      locations: [{ id, scene: structuredClone(scene) }],
    }),
  )
}
export function parseProject(raw: unknown, large = false): StudioProject {
  const value = schema.parse(raw)
  const locations = value.locations.map((place) => ({
    id: place.id,
    scene: parseScene(place.scene, large),
  }))
  if (new Set(locations.map((p) => p.id)).size !== locations.length)
    throw Error('Duplicate location ID')
  if (!locations.some((p) => p.id === value.activeLocation)) throw Error('Unknown active location')
  if (value.version === 1)
    return unifyPlanet(synchronizeWorldObjects({ ...value, version: 2, objects: [], locations }))
  if (value.version === 3 && !value.planetId) throw Error('Missing planet identity')
  if (!value.objects) throw Error('Missing planetary objects')
  const ids = new Set<string>(),
    references = new Set<string>()
  for (const object of value.objects) {
    const reference = JSON.stringify([object.locationId, object.entityId])
    if (ids.has(object.id) || references.has(reference)) throw Error('Duplicate planetary object')
    ids.add(object.id)
    references.add(reference)
    const place = locations.find((p) => p.id === object.locationId)
    const entity = place?.scene.entities.find((e) => e.id === object.entityId)
    if (!place?.scene.geography || !entity || entity.parentId)
      throw Error('Invalid planetary object reference')
    entity.transform = fromWorldPose(place.scene.geography, object.pose)
  }
  for (const place of locations) {
    if (
      place.scene.geography &&
      place.scene.entities.some(
        (e) => !e.parentId && !references.has(JSON.stringify([place.id, e.id])),
      )
    )
      throw Error('Missing root world pose')
    place.scene = parseScene(place.scene, large)
  }
  const project: StudioProject = {
    ...value,
    version: value.version === 3 ? 3 : 2,
    objects: value.objects,
    locations,
  }
  const registry = new Map(portalRegistry(project).map((p) => [p.id, p]))
  const sources = new Set<string>()
  for (const connection of project.connections ?? []) {
    const source = registry.get(connection.source),
      destination = registry.get(connection.destination)
    if (
      !source ||
      !destination ||
      source.id === destination.id ||
      sources.has(source.id) ||
      source.size.some((n, i) => Math.abs(n - destination.size[i]) > 1e-6)
    )
      throw Error('Invalid project portal connection')
    sources.add(source.id)
  }
  return unifyPlanet(project)
}
export function retainLocation(project: StudioProject, scene: SceneDocument): StudioProject {
  return visitLocation(project, scene)
}
export function visitLocation(project: StudioProject, scene: SceneDocument): StudioProject {
  const next = structuredClone(project)
  const id = locationId(scene)
  const place = next.locations.find((p) => p.id === id || locationId(p.scene) === id)
  if (place) place.scene = structuredClone(scene)
  else {
    if (next.locations.length >= 64) throw Error('Project supports up to 64 locations')
    next.locations.push({ id, scene: structuredClone(scene) })
  }
  next.activeLocation = place?.id ?? id
  return synchronizeWorldObjects(next)
}
export function projectFilename(name: string): string {
  const stem = name
    .replace(/\.nabla\.json$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .trim()
    .slice(0, 100)
  return `${stem || 'Untitled'}.nabla.json`
}

/** Synchronize edited local working copies at transaction/save boundaries, never per frame. */
function synchronizeWorldObjects(project: StudioProject): StudioProject {
  const previous = new Map(
    project.objects.map((o) => [JSON.stringify([o.locationId, o.entityId]), o.id]),
  )
  const objects: PlanetObject[] = []
  for (const place of project.locations) {
    if (!place.scene.geography) continue
    for (const entity of place.scene.entities) {
      if (entity.parentId) continue
      const key = JSON.stringify([place.id, entity.id])
      objects.push({
        id: previous.get(key) ?? crypto.randomUUID(),
        locationId: place.id,
        entityId: entity.id,
        pose: toWorldPose(place.scene.geography, entity.transform),
      })
    }
  }
  const next = { ...project, objects }
  const known = new Map(portalRegistry(next).map((p) => [p.id, p]))
  next.connections = next.connections?.filter((c) => {
    const source = known.get(c.source),
      destination = known.get(c.destination)
    return (
      source && destination && source.size.every((n, i) => Math.abs(n - destination.size[i]) < 1e-6)
    )
  })
  return next
}

/** Collapse historical city scenes once, preserving world poses and object identities. */
export function unifyPlanet(project: StudioProject): StudioProject {
  const places = project.locations.filter((p) => p.scene.geography?.planetary)
  if (!places.length || (project.version === 3 && places.length === 1 && places[0].id === 'planet'))
    return project
  const active = places.find((p) => p.id === project.activeLocation) ?? places[0]
  const scene = structuredClone(active.scene)
  scene.entities = []
  const registry = portalRegistry(project)
  const remap = new Map<string, Map<string, string>>()
  const used = new Set<string>()
  // Keep the active scene's IDs where possible, rename colliding imports deterministically.
  for (const place of [active, ...places.filter((p) => p !== active)]) {
    const ids = new Map<string, string>()
    remap.set(place.id, ids)
    for (const e of place.scene.entities) {
      let id = e.id,
        suffix = 1
      while (used.has(id)) id = `${e.id.slice(0, 110)}-import-${suffix++}`
      used.add(id)
      ids.set(e.id, id)
    }
    for (const original of place.scene.entities) {
      // One player spawn per planet. Other owned objects must never be discarded.
      if (original.kind === 'spawn' && place !== active) continue
      const e = structuredClone(original)
      e.id = ids.get(e.id)!
      if (e.parentId) e.parentId = ids.get(e.parentId)!
      else
        e.transform = fromWorldPose(
          scene.geography!,
          toWorldPose(place.scene.geography!, e.transform),
        )
      if (e.portal?.pairId) e.portal.pairId = ids.get(e.portal.pairId)!
      if (e.road) e.road.terrainId = ids.get(e.road.terrainId)!
      scene.entities.push(e)
    }
  }
  const roots = project.objects
    .filter((o) => remap.has(o.locationId))
    .flatMap((o) => {
      const entityId = remap.get(o.locationId)!.get(o.entityId)!
      return scene.entities.some((e) => e.id === entityId)
        ? [{ ...o, locationId: 'planet', entityId }]
        : []
    })
  const idsForPortal = new Map(
    registry.map((p) => {
      const entityId = remap.get(p.locationId)?.get(p.entityId)
      if (!entityId) return [p.id, p.id]
      let entity = scene.entities.find((e) => e.id === entityId)!
      while (entity.parentId) entity = scene.entities.find((e) => e.id === entity.parentId)!
      const root = roots.find((o) => o.entityId === entity.id)!
      return [p.id, `${root.id}/${encodeURIComponent(entityId)}`]
    }),
  )
  // Legacy directed windows may be many-to-one. Preserve their topology rather
  // than silently forcing them into the reciprocal physical-pair contract.
  const remaining = (project.connections ?? []).map((c) => ({
    ...c,
    source: idsForPortal.get(c.source)!,
    destination: idsForPortal.get(c.destination)!,
  }))
  const bookmarks = places.map((p) => ({
    name: p.scene.name,
    latitude: p.scene.geography!.latitude,
    longitude: p.scene.geography!.longitude,
  }))
  return synchronizeWorldObjects({
    ...project,
    version: 3,
    planetId: project.planetId ?? crypto.randomUUID(),
    bookmarks,
    activeLocation: places.some((p) => p.id === project.activeLocation)
      ? 'planet'
      : project.activeLocation,
    locations: [{ id: 'planet', scene }, ...project.locations.filter((p) => !remap.has(p.id))],
    objects: [...roots, ...project.objects.filter((o) => !remap.has(o.locationId))],
    connections: remaining,
  })
}

/** Travel changes the working frame, never the planet or its authored world poses. */
export function travelPlanet(
  project: StudioProject,
  latitude: number,
  longitude: number,
  name: string,
): StudioProject {
  let source = project
  if (!project.locations.some((p) => p.scene.geography?.planetary)) {
    source = structuredClone(project)
    const active = source.locations.find((p) => p.id === source.activeLocation)!
    if (!active.scene.geography) throw Error('This local scene has no geographic anchor')
    active.scene.geography.planetary = true
  }
  const next = structuredClone(unifyPlanet(source))
  const place = next.locations.find((p) => p.id === 'planet')
  if (!place) throw Error('This document has no planet; create a new planet from File')
  const scene = place.scene,
    previous = scene.geography!
  const origin = { ...previous, latitude, longitude, altitude: 0 }
  for (const e of scene.entities)
    if (!e.parentId) e.transform = fromWorldPose(origin, toWorldPose(previous, e.transform))
  scene.geography = origin
  scene.name = name
  scene.cursor = [0, 0, 0]
  scene.cursorOnGround = true
  const spawn = scene.entities.find((e) => e.kind === 'spawn')
  if (spawn) {
    spawn.transform = { position: [0, 0.2, 0], rotation: [0, 0, 0, 1] }
    spawn.groundOffset = 0.2
  }
  next.activeLocation = 'planet'
  next.bookmarks ??= []
  if (
    !next.bookmarks.some(
      (p) => Math.abs(p.latitude - latitude) < 1e-6 && Math.abs(p.longitude - longitude) < 1e-6,
    )
  )
    next.bookmarks.push({ name, latitude, longitude })
  return synchronizeWorldObjects(next)
}
