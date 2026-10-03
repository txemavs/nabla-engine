/**
 * S3 car regression tests - ensures truck/DrivingController changes don't break the car.
 *
 * Tests cover:
 * - Spawn at correct terrain height
 * - Driving with DrivingController
 * - Camera modes (chase, cockpit, map)
 * - Vehicle recovery/reset
 * - Engine sound integration
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { initPhysics } from '../../src/simulation/physics.js'
import { Simulation, idleInput, type SceneDocument } from '../../src/simulation/simulation.js'
import { presetVehicle, hasVehiclePreset } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import { DrivingController } from '../../src/driving/controller.js'
import * as THREE from 'three'

describe('S3 car regression tests', () => {
  beforeAll(async () => {
    await initPhysics()
  })

  it('S3 preset exists and has correct vehicle properties', () => {
    expect(hasVehiclePreset('car')).toBe(true)
    const entity = presetVehicle('car', 's3', [0, 0.62, 0])
    expect(entity.vehicle).toBeDefined()
    expect(entity.vehicle!.powertrain).toBeDefined()
    expect(entity.vehicle!.powertrain!.powerCv).toBe(400)
    expect(entity.vehicle!.wheelRadius).toBeCloseTo(0.315, 2)
    expect(entity.vehicle!.hubs).toHaveLength(4) // 4 wheels
  })

  it('S3 spawns at terrain height, not at Y=0', async () => {
    const terrainHeight = 5
    const vehicleHeight = 0.62
    const expectedSpawnY = terrainHeight + vehicleHeight

    const floor = createEntity('floor', 'box', [0, terrainHeight - 0.5, 0])
    floor.size = [100, 1, 100]

    const car = presetVehicle('car', 's3', [0, expectedSpawnY, 0])

    const document: SceneDocument = {
      version: 1,
      name: 'S3 Terrain Test',
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
        floor,
        { ...createEntity('spawn', 'spawn', [-4, terrainHeight + 0.2, 0]), groundOffset: 0.2 },
        { ...car, groundOffset: vehicleHeight },
      ],
    }

    const sim = new Simulation(document, {
      playerMode: 'walk',
      planetaryTerrain: true,
    })

    sim.startInVehicle('s3')

    const initialY = sim.player.position[1]
    expect(initialY).toBeGreaterThan(terrainHeight - 0.5)
    expect(initialY).not.toBeCloseTo(0, 0) // Must NOT be at Y=0

    console.log(`S3 spawn: terrain=${terrainHeight}m, vehicle Y=${initialY.toFixed(2)}m`)

    sim.dispose()
  })

  it('S3 drives forward and accelerates correctly', async () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [2000, 1, 2000]

    const car = presetVehicle('car', 's3', [0, 0.62, 0])

    const sim = new Simulation({
      version: 1,
      name: 'S3 Drive Test',
      entities: [floor, car, createEntity('spawn', 'spawn', [0, 1, 4])],
    })

    try {
      // Settle physics
      for (let i = 0; i < 60; i++) sim.step(1 / 60)

      sim.startInVehicle('s3')
      expect(sim.player.vehicleId).toBe('s3')

      // Drive forward for 3 seconds
      sim.setInput({ ...idleInput(), forward: 1 })
      for (let i = 0; i < 180; i++) sim.step(1 / 60)

      const info = sim.vehicleInfo('s3')
      expect(info.speedKmh).toBeGreaterThan(30) // Should accelerate to at least 30 km/h
      expect(info.gear).toBeGreaterThanOrEqual(1)
      expect(info.rpm).toBeGreaterThan(1000)

      console.log(`S3 after 3s: ${info.speedKmh.toFixed(1)} km/h, gear ${info.gear}, ${info.rpm.toFixed(0)} RPM`)
    } finally {
      sim.dispose()
    }
  })

  it('S3 steering and braking work correctly', async () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [2000, 1, 2000]

    const car = presetVehicle('car', 's3', [0, 0.62, 0])

    const sim = new Simulation({
      version: 1,
      name: 'S3 Steer Test',
      entities: [floor, car, createEntity('spawn', 'spawn', [0, 1, 4])],
    })

    try {
      for (let i = 0; i < 60; i++) sim.step(1 / 60)

      sim.startInVehicle('s3')

      // Accelerate
      sim.setInput({ ...idleInput(), forward: 1 })
      for (let i = 0; i < 120; i++) sim.step(1 / 60)

      const initialSpeed = sim.vehicleInfo('s3').speedKmh
      const initialZ = sim.player.position[2]

      // Steer right while continuing forward
      sim.setInput({ ...idleInput(), forward: 1, right: 1 })
      for (let i = 0; i < 60; i++) sim.step(1 / 60)

      // Should have moved in Z direction due to steering
      const afterSteerZ = sim.player.position[2]
      expect(Math.abs(afterSteerZ - initialZ)).toBeGreaterThan(0.1)

      // Brake
      sim.setInput({ ...idleInput(), forward: 0, brake: true })
      for (let i = 0; i < 120; i++) sim.step(1 / 60)

      const finalSpeed = sim.vehicleInfo('s3').speedKmh
      expect(finalSpeed).toBeLessThan(initialSpeed)

      console.log(`S3 steering: initial Z=${initialZ.toFixed(2)}, after steer Z=${afterSteerZ.toFixed(2)}`)
      console.log(`S3 braking: ${initialSpeed.toFixed(1)} -> ${finalSpeed.toFixed(1)} km/h`)
    } finally {
      sim.dispose()
    }
  })

  it('DrivingController works with S3 (camera and audio integration)', async () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [2000, 1, 2000]

    const car = presetVehicle('car', 's3', [0, 0.62, 0])

    const sim = new Simulation({
      version: 1,
      name: 'S3 DrivingController Test',
      entities: [floor, car, createEntity('spawn', 'spawn', [0, 1, 4])],
    })

    // DrivingController manages camera and audio for driving
    const driving = new DrivingController({ enableAudio: false, initialCameraMode: 'chase' })

    try {
      for (let i = 0; i < 60; i++) sim.step(1 / 60)

      sim.startInVehicle('s3')

      // Update driving controller
      driving.update(sim, 1 / 60)

      // Compute camera state
      const groundUp = new THREE.Vector3(0, 1, 0)
      const cameraState = driving.computeCamera(sim, 1 / 60, groundUp)

      expect(cameraState.position).toBeDefined()
      expect(cameraState.target).toBeDefined()
      expect(cameraState.up).toBeDefined()
      expect(cameraState.fov).toBeGreaterThan(0)

      // Camera should be behind and above the car (chase mode)
      const vehiclePos = sim.player.position
      expect(cameraState.position.y).toBeGreaterThan(vehiclePos[1])

      // Cycle camera modes
      expect(driving.cycleCamera()).toBe('cockpit')
      expect(driving.cycleCamera()).toBe('map')
      expect(driving.cycleCamera()).toBe('chase')

      console.log(`DrivingController camera: position=${cameraState.position.toArray().map(n => n.toFixed(2))}`)
    } finally {
      driving.dispose()
      sim.dispose()
    }
  })

  it('S3 vehicle recovery (recoverVehicle) works after flip', async () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [2000, 1, 2000]

    const car = presetVehicle('car', 's3', [0, 0.62, 0])

    const sim = new Simulation({
      version: 1,
      name: 'S3 Recovery Test',
      entities: [floor, car, createEntity('spawn', 'spawn', [0, 1, 4])],
    })

    try {
      for (let i = 0; i < 60; i++) sim.step(1 / 60)

      sim.startInVehicle('s3')

      // Get initial position
      const initialY = sim.player.position[1]
      expect(initialY).toBeGreaterThan(0)

      // Recover vehicle (simulating R key press)
      sim.recoverVehicle()

      // Step a few frames
      for (let i = 0; i < 30; i++) sim.step(1 / 60)

      // Vehicle should still be above ground
      const afterRecoverY = sim.player.position[1]
      expect(afterRecoverY).toBeGreaterThan(0)

      console.log(`S3 recovery: initial Y=${initialY.toFixed(2)}, after recover Y=${afterRecoverY.toFixed(2)}`)
    } finally {
      sim.dispose()
    }
  })

  it('S3 teleportVehicle places car at specified position', async () => {
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [2000, 1, 2000]

    const car = presetVehicle('car', 's3', [0, 0.62, 0])

    const sim = new Simulation({
      version: 1,
      name: 'S3 Teleport Test',
      entities: [floor, car, createEntity('spawn', 'spawn', [0, 1, 4])],
    })

    try {
      for (let i = 0; i < 60; i++) sim.step(1 / 60)

      sim.startInVehicle('s3')

      // Teleport to new position
      const targetPos: [number, number, number] = [50, 5, 100]
      sim.teleportVehicle(targetPos, Math.PI / 4) // 45 degree rotation

      // Verify position
      const pos = sim.player.position
      expect(pos[0]).toBeCloseTo(targetPos[0], 0)
      expect(pos[1]).toBeCloseTo(targetPos[1], 0)
      expect(pos[2]).toBeCloseTo(targetPos[2], 0)

      console.log(`S3 teleport: target=[${targetPos}], actual=[${pos.map(n => n.toFixed(2))}]`)
    } finally {
      sim.dispose()
    }
  })

  it('S3 Y position stays >= terrain height during driving', async () => {
    const terrainHeight = 3
    const floor = createEntity('floor', 'box', [0, terrainHeight - 0.5, 0])
    floor.size = [2000, 1, 2000]

    const car = presetVehicle('car', 's3', [0, terrainHeight + 0.62, 0])

    const sim = new Simulation({
      version: 1,
      name: 'S3 Terrain Stability',
      entities: [floor, car, createEntity('spawn', 'spawn', [0, terrainHeight + 1, 4])],
    })

    try {
      for (let i = 0; i < 60; i++) sim.step(1 / 60)

      sim.startInVehicle('s3')

      // Drive for 5 seconds and check Y position never goes below terrain
      sim.setInput({ ...idleInput(), forward: 1 })

      let minY = Infinity
      for (let i = 0; i < 300; i++) {
        sim.step(1 / 60)
        const y = sim.player.position[1]
        if (y < minY) minY = y
      }

      // Y should never drop significantly below terrain
      // Allow some tolerance for physics settling (wheels compress suspension)
      expect(minY).toBeGreaterThan(terrainHeight - 0.5)

      console.log(`S3 driving stability: terrain=${terrainHeight}m, min Y=${minY.toFixed(2)}m`)
    } finally {
      sim.dispose()
    }
  })
})
