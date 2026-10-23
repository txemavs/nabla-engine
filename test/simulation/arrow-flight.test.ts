import { describe, expect, it } from 'vitest'
import { ArrowFlight } from '../../src/simulation/weapons/arrow-flight.js'
import { BowDraw, defaultBowSpec, timedDraw } from '../../src/simulation/weapons/bow.js'

describe('arrow flight', () => {
  it('drops under gravity and sticks where the cast hits', () => {
    const flight = new ArrowFlight()
    expect(flight.launch([0, 2, 0], [0, 0, -1], 40)).toBe(true)
    // A wall at z = -20.
    const cast = (from: number[], dir: number[], length: number) => {
      const end = from[2] + dir[2] * length
      if (end > -20) return null
      const t = (-20 - from[2]) / dir[2]
      return {
        point: [from[0] + dir[0] * t, from[1] + dir[1] * t, -20] as [number, number, number],
        normal: [0, 0, 1] as [number, number, number],
        entityId: 'wall',
      }
    }
    const impacts = []
    for (let i = 0; i < 120 && !impacts.length; i++) impacts.push(...flight.update(1 / 60, cast))
    expect(impacts).toHaveLength(1)
    const [hit] = impacts
    expect(hit.entityId).toBe('wall')
    // 0.5 s of flight: about 1.2 m of drop.
    expect(hit.point[1]).toBeLessThan(2 - 1)
    expect(hit.point[1]).toBeGreaterThan(2 - 1.5)
    expect(hit.momentum).toBeCloseTo(0.03 * hit.speed)
    expect(flight.poses()[0].stuck).toBe(true)
    expect(flight.update(1 / 60, cast)).toHaveLength(0)
  })
  it('ignores a dry release and keeps a bounded pool', () => {
    const flight = new ArrowFlight({ limit: 2 })
    expect(flight.launch([0, 0, 0], [0, 0, -1], 0)).toBe(false)
    for (let i = 0; i < 3; i++) flight.launch([i, 0, 0], [0, 0, -1], 10)
    expect(flight.count).toBe(2)
    expect(flight.poses()[0].position[0]).toBe(1)
  })
})

describe('hold-to-draw', () => {
  it('uses the shared bow rules for the release speed', () => {
    expect(timedDraw(defaultBowSpec, 0)).toBe(0)
    expect(timedDraw(defaultBowSpec, 10)).toBe(defaultBowSpec.maxDraw)
    const draw = new BowDraw()
    draw.start()
    draw.pull(timedDraw(draw.spec, 0.05))
    expect(draw.release()).toBe(0)
    draw.start()
    draw.pull(timedDraw(draw.spec, 10))
    expect(draw.release()).toBeCloseTo(
      Math.min(
        defaultBowSpec.maxSpeed,
        Math.sqrt(defaultBowSpec.spring / defaultBowSpec.arrowMass) * defaultBowSpec.maxDraw,
      ),
    )
  })
})
