import type { Entity } from '../src/scene.js'
export interface MapArtifact {
  format: 'glb' | 'prepared' | 'generated'
  key: string
  revision?: number
  directory?: string
  downloads?: Record<string, string>
}
const artifacts = new WeakMap<Entity, MapArtifact>()
export function registerMapArtifact(entities: Entity[], artifact?: MapArtifact) {
  if (artifact) for (const entity of entities) artifacts.set(entity, artifact)
}
export const entityMapArtifact = (entity: Entity) => artifacts.get(entity)
