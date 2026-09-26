/**
 * Generated planet content versus objects the host authored.
 * The renderer draws both. An outliner hides the generated set.
 */
import type { Entity } from '../entity/schema.js'

export function isMapEnvironment(entity: Entity): boolean {
  return (
    !!entity.source ||
    !!entity.terrain ||
    /^world-(terrain|buildings|roads|trees|landcover|water|railways|places)(-|$)/.test(entity.id)
  )
}
