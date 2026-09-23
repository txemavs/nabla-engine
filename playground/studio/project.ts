import { z } from 'zod'
import { parseScene, type SceneDocument } from '../../src/scene.js'

/** Locations have their own metre-scale frame. Entity IDs are scoped to a location. */
export interface StudioProject {
  format: 'nabla-project'
  version: 1
  name: string
  activeLocation: string
  locations: { id: string; scene: SceneDocument }[]
}
const schema = z
  .object({
    format: z.literal('nabla-project'),
    version: z.literal(1),
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
  return geo && scene.entities.some((e) => e.terrain)
    ? `geo:${geo.latitude.toFixed(6)}:${geo.longitude.toFixed(6)}`
    : `local:${scene.name}`
}
export function createProject(scene: SceneDocument): StudioProject {
  const id = locationId(scene)
  return {
    format: 'nabla-project',
    version: 1,
    name: scene.name,
    activeLocation: id,
    locations: [{ id, scene: structuredClone(scene) }],
  }
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
  return { ...value, locations }
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
  return next
}
export function projectFilename(name: string): string {
  const stem = name
    .replace(/\.nabla\.json$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '-')
    .trim()
    .slice(0, 100)
  return `${stem || 'Untitled'}.nabla.json`
}
