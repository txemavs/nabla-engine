import { describe, expect, it } from 'vitest'
import {
  homeInterior,
  interiorForHost,
  interiorContainsCamera,
  HOME_INTERIOR_AABB,
} from './interior.js'
import { deriveOffice, HELM_PAINT } from '../office/roomPaint.js'
import type { StageCamera } from '../pose.js'

describe('interior', () => {
  it('HOME_INTERIOR_AABB has correct dimensions', () => {
    expect(HOME_INTERIOR_AABB.min).toEqual([-2.5, 0, 0])
    expect(HOME_INTERIOR_AABB.max).toEqual([2.5, 3.2, 10])
  })

  it('homeInterior returns css3d for world.home', () => {
    const interior = homeInterior('world.home')
    expect(interior.render).toBe('css3d')
    expect(interior.hostId).toBe('world.home')
    expect(interior.aabb).toBe(HOME_INTERIOR_AABB)
  })

  it('interiorForHost returns css3d for home and containers', () => {
    expect(interiorForHost('world.home')).toBe('css3d')
    expect(interiorForHost('world.home.container.1')).toBe('css3d')
    expect(interiorForHost('entity.container.5x10')).toBe('css3d')
  })

  it('interiorForHost returns rendered for other entities', () => {
    expect(interiorForHost('world.car.a3')).toBe('rendered')
    expect(interiorForHost('world.drone.1')).toBe('rendered')
    expect(interiorForHost('world.wormhole.a')).toBe('rendered')
  })

  it('interiorForHost respects explicit override', () => {
    expect(interiorForHost('world.home', 'rendered')).toBe('rendered')
    expect(interiorForHost('world.car.a3', 'css3d')).toBe('css3d')
  })

  it('interiorContainsCamera checks css3d with helmInside', () => {
    const interior = homeInterior()
    const office = deriveOffice(HELM_PAINT)
    const viewportW = 1920

    const insideCam: StageCamera = { x: 0, y: -1000, z: 500, rx: 0, ry: 0 }
    expect(interiorContainsCamera(interior, insideCam, office, viewportW)).toBe(true)

    const outsideCam: StageCamera = { x: 10000, y: -1000, z: 500, rx: 0, ry: 0 }
    expect(interiorContainsCamera(interior, outsideCam, office, viewportW)).toBe(false)
  })

  it('interiorContainsCamera checks rendered with AABB', () => {
    const interior = {
      hostId: 'world.box',
      render: 'rendered' as const,
      origin: { x: 0, y: 0, z: 0 },
      aabb: { min: [-5, 0, -5], max: [5, 3, 5] } as const,
    }
    const office = deriveOffice(HELM_PAINT)

    const insideCam: StageCamera = { x: 0, y: -1500, z: 0, rx: 0, ry: 0 }
    expect(interiorContainsCamera(interior, insideCam, office, 1920)).toBe(true)

    const outsideCam: StageCamera = { x: 10000, y: -1500, z: 0, rx: 0, ry: 0 }
    expect(interiorContainsCamera(interior, outsideCam, office, 1920)).toBe(false)
  })
})
