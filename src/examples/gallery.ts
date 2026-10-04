import { treeSprite } from '../entity/sprite/sprite.js'
import { createEntity, type Entity } from '../entity/schema.js'
import { createPortalPair } from '../entity/portal/portal.js'
export function createGallery(prefix: string): Entity[] {
  const gates = createPortalPair(
    `${prefix}-window`,
    `${prefix}-back`,
    [-1, 1.455, -4],
    [-140, 1.455, 0],
  )
  gates.forEach((e) => (e.portal!.mode = 'window'))
  gates[0].name = 'Galería 2.5D · ventana'
  gates[1].name = 'Galería 2.5D · escenario'
  const ground = createEntity(`${prefix}-ground`, 'box', [-140, -0.1, -12])
  ground.size = [28, 0.2, 32]
  ground.color = '#435a4c'
  const backdrop = createEntity(`${prefix}-wall`, 'box', [-140, 5, -27])
  backdrop.size = [28, 10, 0.5]
  backdrop.color = '#354b65'
  const entities = [...gates, ground, backdrop]
  for (let i = 0; i < 8; i++) {
    const tree = createEntity(`${prefix}-tree-${i}`, 'group', [
      -149 + (i % 4) * 6,
      0,
      -7 - Math.floor(i / 4) * 13,
    ])
    tree.size = [7, 7, 0.1]
    tree.name = 'Árbol · capa lejana'
    tree.sprite = treeSprite(i)
    entities.push(tree)
  }
  for (let i = 0; i < 5; i++) {
    const target = createEntity(`${prefix}-target-${i}`, 'group', [
      -144 + i * 2,
      0.4,
      -11 - (i % 3) * 3,
    ])
    target.size = [1.6, 2, 0.1]
    target.name = 'Diana móvil'
    target.sprite = { url: '/sprites/target.png', target: true }
    entities.push(target)
  }
  return entities
}
