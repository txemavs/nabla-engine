/**
 * Truck stability test - verifies vehicle stays on ground for 12 seconds.
 *
 * This test creates a simulation with a truck on terrain and verifies
 * that it doesn't fall through the ground over an extended period.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { initPhysics } from '../../src/simulation/physics.js'
import { Simulation, type SceneDocument } from '../../src/simulation/simulation.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'

describe('truck stability', () => {
  beforeAll(async () => {
    await initPhysics()
  })

  it('truck stays within 2m of ground for 12 seconds with fallback ground', async () => {
    const vehicleEntity = presetVehicle('car', 'test-vehicle', [0, 2, 0])

    const document: SceneDocument = {
      version: 1,
      name: 'Stability Test',
      sky: { mode: 'live' },
      geography: {
        latitude: 43.3365,
        longitude: -1.7565,
        altitude: 50,
        imagery: 'offline',
        planetary: true,
      },
      cursor: [0, 0, 0],
      cursorOnGround: true,
      entities: [
        { ...createEntity('spawn', 'spawn', [-4, 1, 0]), groundOffset: 0.2 },
        { ...vehicleEntity, groundOffset: 0.62 },
      ],
    }

    const sim = new Simulation(document, {
      playerMode: 'walk',
      planetaryTerrain: true,
    })

    // Set fallback ground at Y=0 (simulating what game/main.ts does)
    sim.setFallbackGround(0)
    sim.startInVehicle('test-vehicle')

    const yPositions: number[] = []
    const groundLevel = 0.62 // Vehicle ground offset
    const fixedStep = 1 / 60

    // Simulate 12 seconds at 60fps
    const totalTime = 12
    const steps = totalTime * 60

    for (let i = 0; i < steps; i++) {
      sim.setInput({
        forward: 0,
        right: 0,
        yaw: 0,
        sprint: false,
        jump: false,
        brake: false,
      })
      sim.step(fixedStep)

      // Record position every 0.5 seconds
      if (i % 30 === 0) {
        yPositions.push(sim.player.position[1])
      }
    }

    console.log('Y positions over 12 seconds:', yPositions.map((y) => y.toFixed(2)).join(', '))

    // Verify: all positions should be within 2m of ground level
    for (let i = 0; i < yPositions.length; i++) {
      const y = yPositions[i]
      const time = (i * 0.5).toFixed(1)
      const deviation = Math.abs(y - groundLevel)
      expect(
        deviation,
        `At t=${time}s, Y=${y.toFixed(2)} deviates ${deviation.toFixed(2)}m from ground`,
      ).toBeLessThanOrEqual(2)
    }

    // Final position should be stable (settled on ground)
    const finalY = yPositions[yPositions.length - 1]
    expect(finalY).toBeGreaterThan(0)
    expect(finalY).toBeLessThan(5)
  })

  it('truck recovers with teleportVehicle after falling below ground', async () => {
    const vehicleEntity = presetVehicle('car', 'test-vehicle', [0, 50, 0]) // Start high

    const document: SceneDocument = {
      version: 1,
      name: 'Recovery Test',
      sky: { mode: 'live' },
      geography: {
        latitude: 43.3365,
        longitude: -1.7565,
        altitude: 50,
        imagery: 'offline',
        planetary: true,
      },
      cursor: [0, 0, 0],
      cursorOnGround: true,
      entities: [
        { ...createEntity('spawn', 'spawn', [-4, 1, 0]), groundOffset: 0.2 },
        { ...vehicleEntity, groundOffset: 0.62 },
      ],
    }

    const sim = new Simulation(document, {
      playerMode: 'walk',
      planetaryTerrain: true,
    })

    // No fallback ground - vehicle will fall
    sim.startInVehicle('test-vehicle')

    // Simulate 2 seconds of falling
    for (let i = 0; i < 120; i++) {
      sim.setInput({
        forward: 0,
        right: 0,
        yaw: 0,
        sprint: false,
        jump: false,
        brake: false,
      })
      sim.step(1 / 60)
    }

    const fallenY = sim.player.position[1]
    console.log('Fallen Y after 2s:', fallenY.toFixed(2))

    // Vehicle should have fallen significantly (started at Y=50)
    expect(fallenY).toBeLessThan(35)

    // Teleport to safe position
    sim.teleportVehicle([0, 2, 0], 0)

    // Verify teleport worked
    const recoveredY = sim.player.position[1]
    expect(recoveredY).toBeCloseTo(2, 0)

    // Add fallback ground and verify stability
    sim.setFallbackGround(0)

    for (let i = 0; i < 60; i++) {
      sim.setInput({
        forward: 0,
        right: 0,
        yaw: 0,
        sprint: false,
        jump: false,
        brake: false,
      })
      sim.step(1 / 60)
    }

    const finalY = sim.player.position[1]
    console.log('Final Y after recovery:', finalY.toFixed(2))
    expect(finalY).toBeGreaterThan(0)
    expect(finalY).toBeLessThan(5)
  })
})
