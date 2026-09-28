import type { Entity } from '../schema.js'

export function validateSprite(entity: Entity): void {
  if (!entity.sprite) return
  if (entity.kind !== 'group' || entity.motion !== 'none' || entity.portal)
    throw new Error('Sprites require nonphysical groups without portal surfaces')
}

/** Mix the generated foliage cutout with the five Videotiro trees. */
export function treeSprite(index: number) {
  const generated = index % 3 === 0
  return {
    url: generated ? '/sprites/tree.png' : `/sprites/tree-${(index % 5) + 1}.png`,
    upright: true,
    saturation: generated ? 1 : 0.35,
    groundShadow: true,
  }
}
