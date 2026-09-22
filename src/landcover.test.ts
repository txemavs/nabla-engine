import { expect, it, describe } from 'vitest'
import {
  classifySurface,
  isLandcoverFeature,
  isWaterFeature,
  isWaterwayCenterline,
  getWaterwayWidth,
  SURFACE_COLORS,
  type SurfaceType,
} from './landcover.js'

describe('classifySurface', () => {
  it('classifies water features', () => {
    expect(classifySurface({ natural: 'water' })).toBe('water')
    expect(classifySurface({ water: 'lake' })).toBe('water')
    expect(classifySurface({ waterway: 'riverbank' })).toBe('water')
    expect(classifySurface({ landuse: 'reservoir' })).toBe('water')
    expect(classifySurface({ landuse: 'basin' })).toBe('water')
  })

  it('classifies beach and sand', () => {
    expect(classifySurface({ natural: 'beach' })).toBe('sand')
    expect(classifySurface({ natural: 'sand' })).toBe('sand')
    expect(classifySurface({ natural: 'dune' })).toBe('sand')
  })

  it('classifies forest and woodland', () => {
    expect(classifySurface({ natural: 'wood' })).toBe('forest')
    expect(classifySurface({ landuse: 'forest' })).toBe('forest')
    expect(classifySurface({ natural: 'tree_row' })).toBe('forest')
  })

  it('classifies grass and meadow', () => {
    expect(classifySurface({ landuse: 'grass' })).toBe('grass')
    expect(classifySurface({ landuse: 'meadow' })).toBe('grass')
    expect(classifySurface({ landuse: 'village_green' })).toBe('grass')
    expect(classifySurface({ leisure: 'park' })).toBe('grass')
    expect(classifySurface({ leisure: 'garden' })).toBe('grass')
    expect(classifySurface({ leisure: 'pitch' })).toBe('grass')
  })

  it('classifies farmland', () => {
    expect(classifySurface({ landuse: 'farmland' })).toBe('farmland')
    expect(classifySurface({ landuse: 'orchard' })).toBe('farmland')
    expect(classifySurface({ landuse: 'vineyard' })).toBe('farmland')
    expect(classifySurface({ landuse: 'allotments' })).toBe('farmland')
  })

  it('classifies scrub and heath', () => {
    expect(classifySurface({ natural: 'scrub' })).toBe('scrub')
    expect(classifySurface({ natural: 'heath' })).toBe('scrub')
    expect(classifySurface({ natural: 'grassland' })).toBe('scrub')
  })

  it('classifies wetland', () => {
    expect(classifySurface({ natural: 'wetland' })).toBe('wetland')
    expect(classifySurface({ natural: 'marsh' })).toBe('wetland')
    expect(classifySurface({ natural: 'swamp' })).toBe('wetland')
  })

  it('classifies rock', () => {
    expect(classifySurface({ natural: 'bare_rock' })).toBe('rock')
    expect(classifySurface({ natural: 'scree' })).toBe('rock')
    expect(classifySurface({ natural: 'rock' })).toBe('rock')
  })

  it('classifies residential and industrial', () => {
    expect(classifySurface({ landuse: 'residential' })).toBe('residential')
    expect(classifySurface({ landuse: 'industrial' })).toBe('industrial')
    expect(classifySurface({ landuse: 'commercial' })).toBe('industrial')
    expect(classifySurface({ landuse: 'retail' })).toBe('industrial')
  })

  it('returns default for unrecognized tags', () => {
    expect(classifySurface({})).toBe('default')
    expect(classifySurface({ highway: 'primary' })).toBe('default')
    expect(classifySurface({ building: 'yes' })).toBe('default')
    expect(classifySurface({ amenity: 'parking' })).toBe('default')
  })

  it('prioritizes natural over landuse', () => {
    expect(classifySurface({ natural: 'water', landuse: 'grass' })).toBe('water')
    expect(classifySurface({ natural: 'beach', landuse: 'farmland' })).toBe('sand')
  })
})

describe('isLandcoverFeature', () => {
  it('returns true for valid landcover features', () => {
    expect(isLandcoverFeature({ natural: 'water' })).toBe(true)
    expect(isLandcoverFeature({ landuse: 'grass' })).toBe(true)
    expect(isLandcoverFeature({ leisure: 'park' })).toBe(true)
    expect(isLandcoverFeature({ landuse: 'forest' })).toBe(true)
  })

  it('returns false for non-landcover features', () => {
    expect(isLandcoverFeature({})).toBe(false)
    expect(isLandcoverFeature({ highway: 'primary' })).toBe(false)
    expect(isLandcoverFeature({ building: 'yes' })).toBe(false)
  })

  it('rejects boundaries and places', () => {
    expect(isLandcoverFeature({ landuse: 'grass', boundary: 'administrative' })).toBe(false)
    expect(isLandcoverFeature({ natural: 'wood', place: 'locality' })).toBe(false)
  })
})

describe('isWaterFeature', () => {
  it('identifies water features', () => {
    expect(isWaterFeature({ natural: 'water' })).toBe(true)
    expect(isWaterFeature({ water: 'lake' })).toBe(true)
    expect(isWaterFeature({ waterway: 'riverbank' })).toBe(true)
  })

  it('rejects non-water features', () => {
    expect(isWaterFeature({ landuse: 'grass' })).toBe(false)
    expect(isWaterFeature({ natural: 'wood' })).toBe(false)
    expect(isWaterFeature({})).toBe(false)
  })
})

describe('SURFACE_COLORS', () => {
  it('provides colors for all surface types', () => {
    const types: SurfaceType[] = [
      'grass',
      'forest',
      'farmland',
      'sand',
      'scrub',
      'water',
      'wetland',
      'rock',
      'residential',
      'industrial',
      'default',
    ]
    for (const type of types) {
      expect(SURFACE_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('isWaterwayCenterline', () => {
  it('identifies river and stream centerlines', () => {
    expect(isWaterwayCenterline({ waterway: 'river' })).toBe(true)
    expect(isWaterwayCenterline({ waterway: 'stream' })).toBe(true)
  })

  it('rejects non-centerline waterways', () => {
    expect(isWaterwayCenterline({ waterway: 'riverbank' })).toBe(false)
    expect(isWaterwayCenterline({ waterway: 'dock' })).toBe(false)
    expect(isWaterwayCenterline({ natural: 'water' })).toBe(false)
    expect(isWaterwayCenterline({})).toBe(false)
  })
})

describe('getWaterwayWidth', () => {
  it('uses explicit width tag when present', () => {
    expect(getWaterwayWidth({ waterway: 'river', width: '25' })).toBe(25)
    expect(getWaterwayWidth({ waterway: 'stream', width: '5 m' })).toBe(5)
  })

  it('returns type-based defaults without width tag', () => {
    expect(getWaterwayWidth({ waterway: 'river' })).toBe(15)
    expect(getWaterwayWidth({ waterway: 'stream' })).toBe(3)
    expect(getWaterwayWidth({})).toBe(5)
  })

  it('caps width at 100m', () => {
    expect(getWaterwayWidth({ waterway: 'river', width: '200' })).toBe(100)
  })
})
