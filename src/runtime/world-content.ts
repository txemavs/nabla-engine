/**
 * Describe cross-location visual windows independently of editor persistence.
 * Registry IDs address authored portals; resolving a view does not transfer
 * actors, physics or gameplay into the destination location.
 */
import type { SceneDocument } from '../scene/document.js'
import type { ExternalPortalView, PortalSurface } from '../render/portal/portals.js'
import type { Vec3Tuple } from '../entity/schema.js'
/** Runtime world content; editor history, bookmarks and persistence are host-owned. */
export interface WorldContent {
  activeLocation: string
  locations: { id: string; scene: SceneDocument }[]
  objects: { id: string; locationId: string; entityId: string }[]
  connections?: PortalConnection[]
}
export interface RegisteredPortal {
  id: string
  locationId: string
  entityId: string
  name: string
  place: string
  size: Vec3Tuple
}
export interface PortalConnection {
  source: string
  destination: string
  mode: 'closed' | 'window'
}
/**
 * Index authored portal apertures using their root object's global identity when available.
 * Sizes are copied. Missing parents and cyclic ancestry are rejected rather than
 * silently producing unstable addresses; no project entities are mutated.
 */
export function portalRegistry(project: WorldContent): RegisteredPortal[] {
  const result: RegisteredPortal[] = []
  for (const place of project.locations) {
    const entities = new Map(place.scene.entities.map((e) => [e.id, e]))
    for (const entity of place.scene.entities) {
      if (!entity.portal) continue
      let root = entity
      const visited = new Set<string>()
      while (root.parentId) {
        if (visited.has(root.id)) throw new Error('Cyclic portal ancestry')
        visited.add(root.id)
        const parent = entities.get(root.parentId)
        if (!parent) throw new Error('Missing portal parent')
        root = parent
      }
      const global = project.objects.find(
        (o) => o.locationId === place.id && o.entityId === root.id,
      )
      result.push({
        id: `${global?.id ?? place.id}/${encodeURIComponent(entity.id)}`,
        locationId: place.id,
        entityId: entity.id,
        name: entity.name,
        place: place.scene.name,
        size: [...entity.size],
      })
    }
  }
  return result
}
/**
 * Replace one source's outgoing connection while preserving host-specific project fields.
 * A null destination removes it. Reject unknown/self destinations and unequal
 * aperture sizes. The returned project is a shallow copy with a new connection list.
 */
export function setPortalConnection<T extends WorldContent>(
  project: T,
  source: string,
  destination: string | null,
  mode: 'closed' | 'window',
): T {
  const registry = portalRegistry(project)
  const from = registry.find((p) => p.id === source),
    to = registry.find((p) => p.id === destination)
  if (!from || (destination && (!to || source === destination)))
    throw Error('Destino de portal no válido')
  if (to && from.size.some((n, i) => Math.abs(n - to.size[i]) > 1e-6))
    throw Error('Los marcos deben tener las mismas dimensiones')
  const connections = (project.connections ?? []).filter((c) => c.source !== source)
  if (destination) connections.push({ source, destination, mode })
  return { ...project, connections }
}

/** Resolve only visible windows sourced in the active location; no physical transfer. */
export function resolveWorldPortalViews(
  world: WorldContent,
  surfaces: Map<string, PortalSurface>,
  resolve: (
    location: string,
    scene: SceneDocument,
    entity: string,
  ) => ExternalPortalView | undefined,
  registry = portalRegistry(world),
): Map<string, ExternalPortalView> {
  const result = new Map<string, ExternalPortalView>()
  for (const connection of world.connections ?? []) {
    if (connection.mode !== 'window') continue
    const from = registry.find((p) => p.id === connection.source),
      to = registry.find((p) => p.id === connection.destination)
    if (
      !from ||
      !to ||
      from.locationId !== world.activeLocation ||
      !surfaces.get(from.entityId)?.mesh.visible
    )
      continue
    const destination = world.locations.find((p) => p.id === to.locationId)
    if (!destination) continue
    const remote = resolve(to.locationId, destination.scene, to.entityId)
    if (remote) result.set(from.entityId, remote)
  }
  return result
}
