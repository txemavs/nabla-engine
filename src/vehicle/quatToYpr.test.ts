import { describe, expect, it } from 'vitest'
import { Quaternion, Vec3 } from 'cannon-es'
import { quatToYpr } from './vehicleSim.js'

describe('quatToYpr Y-up', () => {
  it('maps pure yaw around Y to yaw, not pitch', () => {
    const q = new Quaternion()
    q.setFromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2)
    const ypr = quatToYpr(q)
    expect(Math.abs(ypr.yaw - 90)).toBeLessThan(1)
    expect(Math.abs(ypr.pitch)).toBeLessThan(1)
    expect(Math.abs(ypr.roll)).toBeLessThan(1)
  })

  it('maps pure pitch around X to pitch', () => {
    const q = new Quaternion()
    q.setFromAxisAngle(new Vec3(1, 0, 0), Math.PI / 6)
    const ypr = quatToYpr(q)
    expect(Math.abs(ypr.pitch - 30)).toBeLessThan(1)
    expect(Math.abs(ypr.yaw)).toBeLessThan(1)
  })
})
