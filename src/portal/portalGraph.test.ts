import { describe, expect, it } from 'vitest'
import {
  portalCrossing,
  portalLocal,
  portalPoseOnFace,
  parseEntityPortals,
  portalIdOn,
  portalShortName,
  portalCaption,
  mapThroughPortals,
  CONTAINER_MESH_AABB,
  SHIP_HULL_AABB,
  approachCamera,
  enterNaveCamera,
  insideCamera,
} from './portalGraph.js'

describe('portalGraph', () => {
  it('portalLocal computes local coordinates', () => {
    const pose = { x: 0, y: 0, z: 0, yaw: 0 }
    const loc = portalLocal({ x: 1000, z: 2000 }, pose)
    expect(loc.x).toBeCloseTo(1)
    expect(loc.z).toBeCloseTo(2)
  })

  it('portalLocal handles yaw rotation', () => {
    const pose = { x: 0, y: 0, z: 0, yaw: 90 }
    const loc = portalLocal({ x: 1000, z: 0 }, pose)
    expect(loc.z).toBeCloseTo(1, 1)
  })

  it('portalCrossing detects crossing from -Z to +Z', () => {
    const pose = { x: 0, y: 0, z: 0, yaw: 0 }
    expect(portalCrossing({ x: 0, z: -500 }, { x: 0, z: 500 }, pose)).toBe(true)
    expect(portalCrossing({ x: 0, z: 500 }, { x: 0, z: -500 }, pose)).toBe(false)
    expect(portalCrossing({ x: 0, z: 500 }, { x: 0, z: 1000 }, pose)).toBe(false)
  })

  it('portalCrossing respects width limit', () => {
    const pose = { x: 0, y: 0, z: 0, yaw: 0 }
    expect(portalCrossing({ x: 0, z: -500 }, { x: 0, z: 500 }, pose, 2)).toBe(true)
    expect(portalCrossing({ x: 3000, z: -500 }, { x: 3000, z: 500 }, pose, 2)).toBe(false)
  })

  it('portalPoseOnFace computes pose on AABB face', () => {
    const hostPose = { x: 0, y: 0, z: 5, yaw: 0 }
    const pose = portalPoseOnFace(hostPose, CONTAINER_MESH_AABB, '-z', 'out')
    expect(pose.z).toBeCloseTo(0, 1)
    expect(pose.yaw).toBeCloseTo(Math.PI, 5)
  })

  it('parseEntityPortals extracts valid portals', () => {
    const raw = [
      { face: '-z', pairId: 'world.yard.a', arrive: 'walk', toward: 'out' },
      { face: '+z', pairId: 'world.yard.b', arrive: 'walk', toward: 'out' },
      { face: 'invalid' },
      null,
    ]
    const portals = parseEntityPortals(raw)
    expect(portals).toHaveLength(2)
    expect(portals![0].face).toBe('-z')
    expect(portals![1].face).toBe('+z')
  })

  it('parseEntityPortals returns undefined for empty', () => {
    expect(parseEntityPortals([])).toBeUndefined()
    expect(parseEntityPortals(null)).toBeUndefined()
  })

  it('portalIdOn generates ID from host and face', () => {
    expect(portalIdOn('world.home', { face: '-z' })).toBe('world.home.-z')
    expect(portalIdOn('world.home', { face: '+z', id: 'custom.id' })).toBe('custom.id')
  })

  it('portalShortName strips world prefix', () => {
    expect(portalShortName('world.home.-z')).toBe('home.-z')
    expect(portalShortName('world.yard.avatars')).toBe('avatars')
  })

  it('portalCaption formats names', () => {
    expect(portalCaption('world.home.-z', 'world.yard.avatars')).toBe('home.-z\navatars')
    expect(portalCaption('world.home.-z')).toBe('home.-z\n—')
  })

  it('mapThroughPortals transforms coordinates', () => {
    const from = { x: 0, z: 0, yaw: 0 }
    const to = { x: 10, z: 10, yaw: 0 }
    const result = mapThroughPortals([1000, 500, 2000], from, to)
    expect(result[0]).toBeCloseTo(11000)
    expect(result[1]).toBe(500)
    expect(result[2]).toBeCloseTo(12000)
  })

  it('CONTAINER_MESH_AABB is midship centered', () => {
    expect(CONTAINER_MESH_AABB.min[2]).toBe(-5)
    expect(CONTAINER_MESH_AABB.max[2]).toBe(5)
  })

  it('SHIP_HULL_AABB starts at z=0', () => {
    expect(SHIP_HULL_AABB.min[2]).toBe(0)
    expect(SHIP_HULL_AABB.max[2]).toBe(10)
  })

  it('approachCamera stands outside looking in', () => {
    const pose = { x: 0, y: 0, z: 0, yaw: 0 }
    const cam = approachCamera(pose, -1440)
    expect(cam.z).toBeLessThan(0)
    expect(cam.ry).toBeCloseTo(180, 0)
  })

  it('enterNaveCamera steps inward', () => {
    // Pose with yaw=0 faces +Z, so inward is -Z direction
    const pose = { x: 0, y: 0, z: 0, yaw: 0 }
    const cam = enterNaveCamera(pose, -1440, 2)
    // Camera steps backward from the hole (−inward in local Z)
    expect(cam.z).toBeLessThan(0)
    expect(cam.z).toBeGreaterThan(-3000)
  })

  it('insideCamera looks through the far end', () => {
    const pose = { x: 0, y: 0, z: 5, yaw: Math.PI }
    const cam = insideCamera(pose, -1440, 2)
    expect(cam.z).toBeLessThan(5000)
  })
})
