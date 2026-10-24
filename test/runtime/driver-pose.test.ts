import { expect, it } from 'vitest'
import {
  normalizeDriverPose,
  readDriverPose,
  writeDriverPose,
} from '../../src/config/driver-pose.js'
it('clamps corrupt offsets and keeps saved adjustments isolated per vehicle model', () => {
  const data = new Map<string, string>()
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
  const pose = normalizeDriverPose({ head: [Infinity, -3, 0.15], view: [0, 'bad', 0.1] })
  expect(pose).toEqual({ head: [0, -1, 0.15], view: [0, 0, 0.1] })
  writeDriverPose(storage, '/car.glb', pose)
  expect(readDriverPose(storage, '/car.glb')).toEqual(pose)
  expect(readDriverPose(storage, '/a3.glb').head).toEqual([0, 0, 0])
  writeDriverPose(storage, '/car.glb')
  expect(readDriverPose(storage, '/car.glb').head).toEqual([0, 0, 0])
})
