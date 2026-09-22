import type { Entity } from './scene.js'

export type EntityCapability =
  | 'transform'
  | 'appearance'
  | 'clone'
  | 'solid-edit'
  | 'drive'
  | 'fly'
  | 'interior'
  | 'dock'
  | 'portal'
  | 'sprite'
  | 'light'
/** Derived from components, so old scenes and edited entities cannot have stale flags. */
export function entityCapabilities(entity: Entity): EntityCapability[] {
  const result: EntityCapability[] = ['transform']
  if (!entity.visual && ['box', 'solid', 'terrain'].includes(entity.kind)) result.push('appearance')
  if (entity.kind !== 'spawn') result.push('clone')
  if (entity.geometry) result.push('solid-edit')
  if (entity.kind === 'vehicle') result.push('drive')
  if (entity.vehicle?.flight) result.push('fly')
  if (entity.vehicle?.interior) result.push('interior')
  if (entity.vehicle?.garage) result.push('dock')
  if (entity.portal) result.push('portal')
  if (entity.sprite) result.push('sprite')
  if (entity.light) result.push('light')
  return result
}
