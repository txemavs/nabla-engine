import { expect, test } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { MADRID } from './geography.js'
import { fromWorldPose, reframeVector, toWorldPose, worldPoseGeography } from './world-pose.js'
import { rotationDegrees, type Transform } from './scene.js'
const sydney = { latitude: -33.8688, longitude: 151.2093, altitude: 20 }

test('one planet-fixed object survives changing the working frame across hemispheres', () => {
  const pose: Transform = { position: [0.012, 2, -3], rotation: rotationDegrees(10, 45, -5) }
  const world = toWorldPose(sydney, pose)
  const inMadrid = fromWorldPose(MADRID, world)
  expect(new Vector3(...inMadrid.position).length()).toBeGreaterThan(1000000)
  const back = fromWorldPose(sydney, toWorldPose(MADRID, inMadrid))
  expect(new Vector3(...back.position).distanceTo(new Vector3(...pose.position))).toBeLessThan(1e-7)
  expect(
    Math.abs(new Quaternion(...back.rotation).dot(new Quaternion(...pose.rotation))),
  ).toBeCloseTo(1, 12)
  expect(worldPoseGeography(world).latitude).toBeCloseTo(sydney.latitude, 3)
})
test('orbital positions and velocities keep precision and length across frames', () => {
  const orbital: Transform = { position: [2, 400000, 5], rotation: [0, 0, 0, 1] }
  const world = toWorldPose(MADRID, orbital)
  expect(worldPoseGeography(world).altitude).toBeCloseTo(400000, 3)
  const velocity: [number, number, number] = [12, 3, -450]
  const remote = reframeVector(velocity, MADRID, sydney)
  expect(new Vector3(...remote).length()).toBeCloseTo(new Vector3(...velocity).length(), 10)
  expect(
    new Vector3(...reframeVector(remote, sydney, MADRID)).distanceTo(new Vector3(...velocity)),
  ).toBeLessThan(1e-10)
})
