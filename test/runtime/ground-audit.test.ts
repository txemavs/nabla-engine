import { describe, expect, it } from 'vitest'
import { auditGround } from '../../src/runtime/ground-audit.js'

const sim = (playerY: number, onFoot: boolean) =>
  ({
    entityTransform: (id: string) => ({
      position: id === 'car' ? [0, 1.1, 0] : [3, 1, 4],
      rotation: [0, 0, 0, 1],
    }),
    wheelTransforms: () => [
      { position: [-1, 0.6, 1], rotation: [0, 0, 0, 1] },
      { position: [1, 0.55, 1], rotation: [0, 0, 0, 1] },
    ],
    wheelContactInfo: () => [{ contactPoint: [-1, 0.25, 1] }, { contactPoint: null }],
    player: {
      position: [3, playerY, 4],
      vehicleId: onFoot ? null : 'car',
      yaw: 0,
      grounded: true,
      interiorId: null,
      speed: 0,
    },
    nearestVehicle: () => (onFoot ? 'car' : null),
  }) as never

describe('auditGround', () => {
  const vehicles = [{ id: 'car', name: 'Car', wheelRadius: 0.35 }]
  it('reports wheel clearance against the ground, negative when sunk', () => {
    const audit = auditGround(sim(1, true), vehicles, () => 0.25, 0.9)
    const car = audit.vehicles[0]
    expect(car.wheelBottom).toBeCloseTo(0.2)
    expect(car.minClearance).toBeCloseTo(-0.05)
    expect(car.maxClearance).toBeCloseTo(-0.05 + 0.05)
    expect(car.contact).toEqual([0.25, null])
  })
  it('reports player feet clearance and the interaction distance', () => {
    const audit = auditGround(sim(1.15, true), vehicles, () => 0.25, 0.9)
    expect(audit.player.mode).toBe('on-foot')
    expect(audit.player.feetClearance).toBeCloseTo(0)
    expect(audit.player.nearestVehicle).toBe('car')
    expect(audit.player.distances.car).toBeCloseTo(Math.hypot(3, 0.05, 4))
  })
  it('tolerates missing ground', () => {
    const audit = auditGround(sim(1, false), vehicles, () => undefined, 0.28)
    expect(audit.vehicles[0].minClearance).toBeNull()
    expect(audit.player.mode).toBe('vehicle')
    expect(audit.player.feetClearance).toBeNull()
  })
})
