import { describe, expect, it } from 'vitest'
import {
  createPlaceable,
  hasPlaceable,
  placeable,
  placeables,
} from '../../src/catalog/placeables.js'
import { parseScene } from '../../src/scene/document.js'
import { createEntity } from '../../src/entity/schema.js'

describe('placeables', () => {
  it('lists Portal, Galería 2.5D, Sprite and both street lamps in menu order', () => {
    expect(placeables.map((entry) => entry.label)).toEqual([
      'Portal',
      'Galería 2.5D',
      'Sprite',
      'Farola de autopista',
      'Farola de barrio',
    ])
    expect(hasPlaceable('portal')).toBe(true)
    expect(hasPlaceable('car')).toBe(false)
    expect(() => placeable('car')).toThrow(/Unknown placeable/)
  })

  it('builds a closed Stargate mouth whose lower bar sits below the ground contact', () => {
    const [portal] = createPlaceable('portal', 'gate')
    expect(portal.portal).toEqual({ pairId: null, mode: 'closed' })
    expect(portal.size).toEqual([4.71, 2.91, 0.145])
    expect(portal.transform.position).toEqual([0, 1.455, 0])
    expect(portal.parentId).toBeNull()
  })

  it('moves the gallery window to the origin and keeps its window link', () => {
    const gallery = createPlaceable('gallery', 'g')
    const window = gallery.find((e) => e.id === 'g-window')!
    expect(window.transform.position[0]).toBe(0)
    expect(window.transform.position[2]).toBe(0)
    expect(window.portal).toEqual({ pairId: 'g-back', mode: 'window' })
    expect(gallery.some((e) => e.sprite?.target)).toBe(true)
  })

  it('stands sprites and lamps on the ground and every entry is a valid scene', () => {
    expect(createPlaceable('sprite', 's')[0].sprite).toBeDefined()
    const [lamp] = createPlaceable('streetlight', 'l')
    expect(lamp.transform.position[1]).toBe(lamp.size[1] / 2)
    for (const entry of placeables)
      expect(() =>
        parseScene({
          version: 1,
          name: entry.id,
          entities: [createEntity('spawn', 'spawn'), ...createPlaceable(entry.id, `x-${entry.id}`)],
        }),
      ).not.toThrow()
  })
})
