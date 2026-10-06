import { describe, expect, it } from 'vitest'
import { BackSide, DoubleSide, FrontSide } from 'three'
import {
  isGroundSurface,
  tileMeshSide,
  upwardWinding,
} from '../../src/render/planet/ground-material.js'

// Two-triangle 10 m quad on y = 0, wound counter-clockwise seen from above (front face up).
const quad = new Float32Array([0, 0, 0, 0, 0, 10, 10, 0, 10, 10, 0, 0])
const up = new Uint32Array([0, 1, 2, 0, 2, 3])
const down = new Uint32Array([0, 2, 1, 0, 3, 2])

describe('single-sided ground', () => {
  it('measures which way a mesh is wound', () => {
    expect(upwardWinding(quad, up)).toBe(1)
    expect(upwardWinding(quad, down)).toBe(0)
    expect(upwardWinding(new Float32Array(), undefined)).toBe(0)
  })

  it('treats terrain, land use and ground-photo drapes as ground, not roads or water edges', () => {
    expect(isGroundSurface({ category: 'Terrain' })).toBe(true)
    expect(isGroundSurface({ category: 'Surfaces' })).toBe(true)
    expect(isGroundSurface({ category: 'Terrain', drape: 'terrain' })).toBe(true)
    // Road meshes carry bridge decks; skirts and buildings keep their own sides.
    expect(isGroundSurface({ category: 'Roads' })).toBe(false)
    expect(isGroundSurface({ category: 'Roads', drape: 'roads' })).toBe(false)
    expect(isGroundSurface({ category: 'Terrain', skirt: true })).toBe(false)
    expect(isGroundSurface({ category: 'Buildings' })).toBe(false)
  })

  it('draws double-sided ground (LiDAR) single-sided, and nothing else', () => {
    expect(tileMeshSide(DoubleSide, { category: 'Terrain' }, quad, up)).toBe(FrontSide)
    expect(tileMeshSide(DoubleSide, { category: 'Surfaces' }, quad, up)).toBe(FrontSide)
    expect(tileMeshSide(DoubleSide, { category: 'Roads' }, quad, up)).toBe(DoubleSide)
    expect(tileMeshSide(FrontSide, { category: 'Terrain' }, quad, up)).toBe(FrontSide)
    expect(tileMeshSide(BackSide, { category: 'Buildings' }, quad, up)).toBe(BackSide)
    // Ground wound upside down keeps the GLB side rather than vanishing.
    expect(tileMeshSide(DoubleSide, { category: 'Terrain' }, quad, down)).toBe(DoubleSide)
  })
})
