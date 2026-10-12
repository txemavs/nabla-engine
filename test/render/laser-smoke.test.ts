import { expect, it } from 'vitest'
import { Group, Points, Vector3 } from 'three'
import { laserSmokePools, sampleLaserSmoke } from '../../src/render/entity/laser-smoke.js'

it('brightens only smoke crossed by the finite laser segment, respecting visibility and floating origin', () => {
  const space = new Group()
  space.position.set(-1000, 0, 0)
  const frame = new Group()
  const root = new Points()
  space.add(frame, root)
  const pool = {
    root,
    positions: new Float32Array([1000, 0, 5]),
    life: new Float32Array([0.7]),
    lifetime: 1.4,
    size: 550,
  }
  laserSmokePools.add(pool)
  try {
    const result = new Float32Array(32)
    const start = new Vector3(1000, 0, 0)
    sampleLaserSmoke(start, new Vector3(1000, 0, 10), frame, result)
    expect(Math.max(...result)).toBeGreaterThan(0)
    expect(result[0]).toBe(0)
    expect(result[31]).toBe(0)
    sampleLaserSmoke(start, new Vector3(1000, 0, 2), frame, result)
    expect(Math.max(...result)).toBe(0)
    root.visible = false
    sampleLaserSmoke(start, new Vector3(1000, 0, 10), frame, result)
    expect(Math.max(...result)).toBe(0)
  } finally {
    laserSmokePools.delete(pool)
  }
})
