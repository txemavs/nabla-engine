import type { Entity } from '../../src/entity/schema.js'
import { authoredTree } from '../outliner.js'
import type { TreeNode } from '@nabla/desktop/core'
export function sceneHierarchy(entities: Entity[], disabled = false): TreeNode[] {
  const children = authoredTree(entities)
  const visit = (parent: string | null): TreeNode[] =>
    (children.get(parent) ?? []).map((e) => ({
      id: e.id,
      label: e.name,
      disabled,
      children: children.has(e.id) ? visit(e.id) : undefined,
    }))
  return visit(null)
}
export function sceneTree(entities: Entity[], disabled = false): TreeNode[] {
  const groups = new Map<string, TreeNode[]>([
    ['Portales', []],
    ['Vehículos', []],
    ['Barcos', []],
    ['Aviones', []],
    ['Naves', []],
  ])
  for (const list of authoredTree(entities).values())
    for (const e of list) {
      const kind = e.portal
        ? 'Portales'
        : e.vehicle?.boat
          ? 'Barcos'
          : e.vehicle?.plane
            ? 'Aviones'
            : e.vehicle?.flight
              ? 'Naves'
              : e.kind === 'vehicle'
                ? 'Vehículos'
                : e.light
                  ? 'Iluminación'
                  : e.sprite
                    ? 'Sprites'
                    : (
                        {
                          box: 'Bloques',
                          solid: 'Edificios',
                          terrain: 'Terreno',
                          spawn: 'Inicio del jugador',
                          group: 'Grupos',
                        } as const
                      )[e.kind]
      if (!groups.has(kind)) groups.set(kind, [])
      groups.get(kind)!.push({
        id: e.id,
        label: e.name,
        disabled,
        icon: e.portal ? '◎' : e.kind === 'vehicle' ? '▰' : '◇',
      })
    }
  return [...groups]
    .filter(([name, children]) => children.length || name === 'Portales')
    .map(([label, children]) => ({
      id: 'class:' + label,
      label: `${label} · ${children.length}`,
      selectable: false,
      children,
    }))
}
