import { describe, expect, it } from 'vitest'
import {
  ROAD_HIDDEN_HINT,
  initialHiddenLayers,
  osmRoadsRequested,
  roadHiddenHint,
} from '../../game/layers-ui.js'

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

describe('osmRoads URL opt-in', () => {
  it('is off by default and only an explicit osmRoads turns the OSM road mesh on', () => {
    expect(osmRoadsRequested('')).toBe(false)
    expect(osmRoadsRequested('?terrain=/terrain&relief=lidar')).toBe(false)
    for (const off of ['0', 'false', 'off', 'no'])
      expect(osmRoadsRequested('?osmRoads=' + off)).toBe(false)
    for (const on of ['?osmRoads=1', '?osmRoads=true', '?osmRoads=on', '?osmRoads'])
      expect(osmRoadsRequested(on)).toBe(true)
  })
})
