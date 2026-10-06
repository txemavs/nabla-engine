import { describe, expect, it } from 'vitest'
import { ROAD_HIDDEN_HINT, initialHiddenLayers, roadHiddenHint } from '../../game/layers-ui.js'

const storage = (value?: string) => ({
  getItem: () => value ?? null,
  setItem: () => undefined,
  removeItem: () => undefined,
})

describe('road hidden hint', () => {
  it('shows a short Spanish hint only while Carretera is hidden', () => {
    expect(roadHiddenHint(['road'])).toBe(ROAD_HIDDEN_HINT)
    expect(roadHiddenHint(['photo', 'road'])).toBe('Carretera oculta: no se ven asfalto ni puentes')
    expect(roadHiddenHint([])).toBeUndefined()
    expect(roadHiddenHint(['photo'])).toBeUndefined()
  })

  it('follows a stored -road, and an explicit layers=all clears it for one visit', () => {
    expect(roadHiddenHint(initialHiddenLayers('', storage('-road')))).toBe(ROAD_HIDDEN_HINT)
    expect(roadHiddenHint(initialHiddenLayers('?layers=all', storage('-road')))).toBeUndefined()
  })
})
