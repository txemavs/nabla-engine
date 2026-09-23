import type { StudioProject } from './project.js'
import type { Vec3Tuple } from '../../src/scene.js'
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
export function portalRegistry(project: StudioProject): RegisteredPortal[] {
  const result: RegisteredPortal[] = []
  for (const place of project.locations) {
    const entities = new Map(place.scene.entities.map((e) => [e.id, e]))
    for (const entity of place.scene.entities) {
      if (!entity.portal) continue
      let root = entity
      while (root.parentId) root = entities.get(root.parentId)!
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
export function setPortalConnection(
  project: StudioProject,
  source: string,
  destination: string | null,
  mode: 'closed' | 'window',
): StudioProject {
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
