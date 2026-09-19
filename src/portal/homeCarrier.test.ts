import { describe, expect, it } from 'vitest'
import {
  IDENTITY_CARRIER,
  isIdentityCarrier,
  rideHomeCarrier,
  inverseRideHomeCarrier,
  ridesHomeCarrier,
  meshRidesHomeCarrier,
  rideCamera,
  inverseRideCamera,
  rideCssMm,
  rideGlMm,
} from './homeCarrier.js'
import type { StageCamera } from '../pose.js'

describe('homeCarrier', () => {
  it('IDENTITY_CARRIER is zero', () => {
    expect(IDENTITY_CARRIER).toEqual({ x: 0, y: 0, z: 0, yaw: 0 })
    expect(isIdentityCarrier(IDENTITY_CARRIER)).toBe(true)
  })

  it('isIdentityCarrier detects non-identity', () => {
    expect(isIdentityCarrier({ x: 1, y: 0, z: 0, yaw: 0 })).toBe(false)
    expect(isIdentityCarrier({ x: 0, y: 0, z: 0, yaw: 1 })).toBe(false)
  })

  it('rideHomeCarrier transforms local to world', () => {
    const carrier = { x: 10, y: 0, z: 20, yaw: 0 }
    const local = { x: 1, y: 0, z: 2, yaw: 0 }
    const world = rideHomeCarrier(local, carrier)
    expect(world.x).toBeCloseTo(11)
    expect(world.z).toBeCloseTo(22)
  })

  it('rideHomeCarrier applies yaw rotation', () => {
    const carrier = { x: 0, y: 0, z: 0, yaw: 90 }
    const local = { x: 1, y: 0, z: 0, yaw: 0 }
    const world = rideHomeCarrier(local, carrier)
    expect(world.z).toBeCloseTo(-1, 1)
    expect(world.yaw).toBeCloseTo(90)
  })

  it('inverseRideHomeCarrier is inverse of rideHomeCarrier', () => {
    const carrier = { x: 5, y: 1, z: 10, yaw: 45 }
    const local = { x: 2, y: 0.5, z: 3, yaw: 30 }
    const world = rideHomeCarrier(local, carrier)
    const back = inverseRideHomeCarrier(world, carrier)
    expect(back.x).toBeCloseTo(local.x)
    expect(back.y).toBeCloseTo(local.y)
    expect(back.z).toBeCloseTo(local.z)
    expect(back.yaw).toBeCloseTo(local.yaw)
  })

  it('ridesHomeCarrier filters lot-fixed entities', () => {
    expect(ridesHomeCarrier('world.home')).toBe(true)
    expect(ridesHomeCarrier('world.chair.1')).toBe(true)
    expect(ridesHomeCarrier('world.phi.edge.1')).toBe(false)
    expect(ridesHomeCarrier('world.phi.host.1')).toBe(false)
    expect(ridesHomeCarrier('world.car.a3')).toBe(false)
    expect(ridesHomeCarrier('world.drone.1')).toBe(false)
    expect(ridesHomeCarrier('world.yard.avatars')).toBe(false)
    expect(ridesHomeCarrier('world.wormhole.a')).toBe(false)
  })

  it('meshRidesHomeCarrier checks parent too', () => {
    expect(meshRidesHomeCarrier('world.cargo.box', 'world.home')).toBe(true)
    expect(meshRidesHomeCarrier('world.car.a3', 'desktop.world')).toBe(false)
  })

  it('rideCamera transforms camera coordinates', () => {
    const carrier = { x: 10, y: 0, z: 20, yaw: 0 }
    const cam: StageCamera = { x: 1000, y: -500, z: 2000, rx: 8, ry: 0 }
    const world = rideCamera(cam, carrier)
    expect(world.x).toBeCloseTo(11000)
    expect(world.z).toBeCloseTo(22000)
    expect(world.y).toBe(-500)
  })

  it('inverseRideCamera is inverse of rideCamera', () => {
    const carrier = { x: 5, y: 1, z: 10, yaw: 45 }
    const cam: StageCamera = { x: 2000, y: -1000, z: 3000, rx: 8, ry: 30 }
    const world = rideCamera(cam, carrier)
    const back = inverseRideCamera(world, carrier)
    expect(back.x).toBeCloseTo(cam.x, 0)
    expect(back.y).toBeCloseTo(cam.y, 0)
    expect(back.z).toBeCloseTo(cam.z, 0)
  })

  it('rideCssMm handles Y-down convention', () => {
    const carrier = { x: 0, y: 1, z: 0, yaw: 0 }
    const css = rideCssMm({ x: 0, y: -500, z: 0 }, carrier)
    expect(css.y).toBeCloseTo(-1500)
  })

  it('rideGlMm handles Y-up convention', () => {
    const carrier = { x: 0, y: 1, z: 0, yaw: 0 }
    const gl = rideGlMm([0, 500, 0], carrier)
    expect(gl[1]).toBeCloseTo(1500)
  })
})
