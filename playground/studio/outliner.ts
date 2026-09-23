import type { Entity } from '../../src/scene.js'

/** Generated context stays in the renderer, not in the authored-object tree. */
export function isMapEnvironment(entity: Entity): boolean {
  return (
    !!entity.source ||
    !!entity.terrain ||
    /^world-(terrain|buildings|roads|trees|landcover|water|railways|places)(-|$)/.test(entity.id)
  )
}
export function authoredTree(entities: Entity[]): Map<string | null, Entity[]> {
  const visible = entities.filter((e) => !isMapEnvironment(e) || e.mapEditable)
  const ids = new Set(visible.map((e) => e.id))
  const children = new Map<string | null, Entity[]>()
  for (const e of visible) {
    // Customized map objects remain parented to their terrain in the document.
    // Only their presentation moves to the authored tree's root.
    const parent = e.parentId && ids.has(e.parentId) ? e.parentId : null
    const siblings = children.get(parent) ?? []
    siblings.push(e)
    children.set(parent, siblings)
  }
  return children
}
