import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'
import { createGameCameraState, updateGameCamera } from '../../src/runtime/game-camera.js'
import { resolveGameCameraSettings } from '../../src/config/camera.js'
import {
  CriticalFollow,
  GroundHeading,
  criticalStep,
} from '../../src/render/entity/driving-camera.js'
import { PlaySession } from '../../src/runtime/session.js'
import { createEntity } from '../../src/entity/schema.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import type { SceneDocument } from '../../src/scene/document.js'
import { Vec3 } from '../../src/simulation/physics.js'
import { LANDING_HEADING, TUMBLE_SECONDS, TumbleSim } from './tumble-fixture.js'

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const settings = resolveGameCameraSettings()
const view = {
  document: { version: 1 as const, name: 'Tumble', entities: [] },
  objects: new Map(),
  vehicleHeadOffset: () => undefined,
}

interface Sample {
  t: number
  yaw: number
  camera: Vector3
  look: Vector3
  up: Vector3
}

/** Run the scripted crash through the camera at an uneven 50/72 fps render rate. */
function crash(mode: 'map' | 'chase'): Sample[] {
  const sim = new TumbleSim()
  const camera = new PerspectiveCamera(48, 16 / 9, 0.1, 2000)
  const state = createGameCameraState()
  state.mode = mode
  const samples: Sample[] = []
  let t = 0
  for (let i = 0; t < TUMBLE_SECONDS; i++) {
    const dt = i % 2 ? 1 / 50 : 1 / 72
    t += dt
    sim.at(t)
    updateGameCamera(sim.asSimulation(), view as never, camera, state, 20_000 + t * 1000, dt)
    const up = camera.up.clone()
    samples.push({
      t,
      yaw: mode === 'map' ? Math.atan2(-up.x, -up.z) : state.yaw,
      camera: camera.position.clone(),
      look: new Vector3(0, 0, -1).applyQuaternion(camera.quaternion),
      up: new Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
    })
  }
  return samples
}

/** Yaw rates between samples, rad/s. */
const yawRates = (samples: Sample[]) =>
  samples.slice(1).map((s, i) => wrap(s.yaw - samples[i].yaw) / (s.t - samples[i].t))

/** Sign changes of significant (> 0.3 rad/s) yaw rate: side-to-side oscillation. */
function reversals(rates: number[]): number {
  let count = 0
  let last = 0
  for (const rate of rates) {
    const sign = rate > 0.3 ? 1 : rate < -0.3 ? -1 : 0
    if (sign && last && sign !== last) count++
    if (sign) last = sign
  }
  return count
}

/** Largest horizontal camera acceleration, m/s². */
function peakAcceleration(samples: Sample[]): number {
  const velocity = samples.slice(1).map((s, i) => ({
    t: s.t,
    v: new Vector3(
      s.camera.x - samples[i].camera.x,
      0,
      s.camera.z - samples[i].camera.z,
    ).divideScalar(s.t - samples[i].t),
  }))
  return Math.max(
    ...velocity.slice(1).map((s, i) => s.v.distanceTo(velocity[i].v) / (s.t - velocity[i].t)),
  )
}

describe('exterior cameras in a multiple rollover', () => {
  it('overhead: straight down, never rolls, turns slowly and once, and settles on the new nose', () => {
    const samples = crash('map')
    for (const s of samples) {
      // Looking straight down with a level screen: no roll or pitch inherited from the chassis.
      expect(s.look.y).toBeCloseTo(-1, 6)
      expect(Math.abs(s.up.y)).toBeLessThan(1e-6)
    }
    const rates = yawRates(samples)
    // Before the fix the heading flipped at up to ~226 rad/s and reversed 9 times.
    const tumble = rates.filter((_, i) => samples[i + 1].t > 1 && samples[i + 1].t < 3.6)
    expect(Math.max(...tumble.map(Math.abs))).toBeLessThanOrEqual(settings.tumbleMaxYawRate + 1e-6)
    expect(Math.max(...rates.map(Math.abs))).toBeLessThanOrEqual(settings.mapMaxYawRate)
    // No side-to-side oscillation: steady through the tumble, and at most one change of
    // direction overall (drifting with the line of travel, then the turn to the new nose).
    expect(reversals(tumble)).toBe(0)
    expect(reversals(rates)).toBeLessThanOrEqual(1)
    // Position follows smoothly (before: ~2e5 m/s² from the look-ahead swinging with the flips).
    expect(peakAcceleration(samples)).toBeLessThan(600)
    expect(wrap(samples.at(-1)!.yaw - LANDING_HEADING)).toBeCloseTo(0, 2)
  })

  it('chase: the heading stays calm through the tumble and then swings once to the new nose', () => {
    const samples = crash('chase')
    const rates = yawRates(samples)
    // Before the fix: up to 32 rad/s with 11 side-to-side reversals.
    const tumble = rates.filter((_, i) => samples[i + 1].t > 1 && samples[i + 1].t < 3.6)
    expect(Math.max(...tumble.map(Math.abs))).toBeLessThan(settings.tumbleMaxYawRate)
    expect(Math.max(...rates.map(Math.abs))).toBeLessThan(settings.mapMaxYawRate)
    expect(reversals(tumble)).toBe(0)
    expect(reversals(rates)).toBeLessThanOrEqual(1)
    expect(peakAcceleration(samples)).toBeLessThan(400)
    expect(wrap(samples.at(-1)!.yaw - LANDING_HEADING)).toBeCloseTo(0, 1)
  })

  it('a real Rapier rollover keeps the overhead heading steady', async () => {
    const session = new PlaySession()
    const floor = createEntity('floor', 'box', [0, -0.5, 0])
    floor.size = [600, 1, 600]
    const document: SceneDocument = {
      version: 1,
      name: 'Rollover',
      entities: [
        floor,
        createEntity('spawn', 'spawn', [5, 0.1, 5]),
        presetVehicle('car', 'car', [0, 1.45, 0]),
      ],
    }
    const sim = await session.play(document, { vehicleId: 'car' })
    const camera = new PerspectiveCamera(48, 16 / 9, 0.1, 2000)
    const state = createGameCameraState()
    state.mode = 'map'
    const body = (
      sim as unknown as {
        vehicles: Map<string, { body: { applyImpulse(i: Vec3, at?: Vec3): void } }>
      }
    ).vehicles.get('car')!.body
    let lowest = 1
    let tumbled = false
    let previous = 0
    const rates: number[] = []
    try {
      for (let i = 0; i < 400; i++) {
        if (i === 60) {
          // Launch forward, lift a front corner and kick the nose sideways: a diagonal tumble.
          body.applyImpulse(new Vec3(0, 0, -1300 * 15), new Vec3(0, 0, 0))
          body.applyImpulse(new Vec3(0, 1300 * 8, 0), new Vec3(0.9, 0, -1.6))
          body.applyImpulse(new Vec3(1300 * 3, 0, 0), new Vec3(0, 0.3, -2))
        }
        sim.step(1 / 60)
        updateGameCamera(sim, view as never, camera, state, 20_000 + i * (1000 / 60), 1 / 60)
        const up = new Vector3(0, 1, 0).applyQuaternion(
          new Quaternion(...sim.entityTransform('car', true).rotation),
        )
        lowest = Math.min(lowest, up.y)
        tumbled ||= state.groundHeading.tumbling
        const yaw = Math.atan2(-camera.up.x, -camera.up.z)
        if (i > 0) rates.push(wrap(yaw - previous) * 60)
        previous = yaw
        expect(new Vector3(0, 0, -1).applyQuaternion(camera.quaternion).y).toBeCloseTo(-1, 6)
      }
      // The car really went over (on its roof at some point) and the tracker noticed.
      expect(lowest).toBeLessThan(-0.5)
      expect(tumbled).toBe(true)
      // Before the fix this crash swung the overhead view at up to 4.3 rad/s, 4 reversals.
      expect(Math.max(...rates.map(Math.abs))).toBeLessThanOrEqual(settings.mapMaxYawRate)
      expect(reversals(rates)).toBe(0)
    } finally {
      session.dispose()
    }
  }, 30_000)
})

describe('normal driving is unchanged', () => {
  it('a weaving, bouncing car never counts as tumbling; the overhead heading tracks the nose', () => {
    const tracker = new GroundHeading(settings)
    const dt = 1 / 60
    let worst = 0
    for (let i = 0; i < 60 * 8; i++) {
      const t = i * dt
      // Slalom with a 0.9 rad/s peak yaw rate, plus suspension roll and pitch of ±4°.
      const heading = 0.8 * Math.sin(1.1 * t)
      const roll = 0.07 * Math.sin(2 * Math.PI * 1.6 * t)
      const pitch = 0.07 * Math.sin(2 * Math.PI * 2.3 * t + 1)
      const rotation = new Quaternion()
        .setFromAxisAngle(new Vector3(0, 1, 0), heading)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch))
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll))
      const position = [20 * t * Math.sin(-heading), 0.6, -20 * t]
      tracker.update('car', position, rotation.toArray(), null, dt)
      expect(tracker.tumbling).toBe(false)
      expect(tracker.calm).toBe(1)
      if (t > 0.5) worst = Math.max(worst, Math.abs(wrap(tracker.heading - tracker.target)))
    }
    // Low-passed yaw rate still keeps the view on a smooth nose, within about a degree.
    expect(worst).toBeLessThan(0.02)
  })

  it('a stepped nose does not kick the overhead heading by the whole step', () => {
    const tracker = new GroundHeading(settings)
    const dt = 1 / 60
    const kick = (2.5 * Math.PI) / 180
    let previous = 0
    let maxFrame = 0
    for (let i = 0; i < 60 * 3; i++) {
      const t = i * dt
      const heading = 1.2 * t + kick * Math.floor(t / 0.1)
      const rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), heading)
      tracker.update('car', [0, 0.6, -t], rotation.toArray(), null, dt)
      if (i > 30) maxFrame = Math.max(maxFrame, Math.abs(wrap(tracker.heading - previous)))
      previous = tracker.heading
    }
    // The steady 1.2 rad/s turn already moves the view every frame. The extra from each
    // 2.5° step must stay a fraction of that step, not the whole kick.
    expect(maxFrame).toBeLessThan(1.2 * dt + kick * 0.45)
  })

  it('the follower tracks constant motion without lag and snaps on teleports', () => {
    const follow = new CriticalFollow()
    const dt = 1 / 60
    for (let i = 0; i <= 120; i++) follow.update(new Vector3(30 * i * dt, 0, 0), dt, 8)
    expect(follow.position.x).toBeCloseTo(60, 1)
    follow.update(new Vector3(500, 0, 0), dt, 8)
    expect(follow.position.x).toBe(500)
    // The exact critically damped step decays without overshoot for any step length.
    const [error] = criticalStep(1, 0, 8, 10)
    expect(error).toBeGreaterThanOrEqual(0)
    expect(error).toBeLessThan(1e-6)
  })

  it('validates the tumble settings', () => {
    expect(() => resolveGameCameraSettings({ tumbleUprightness: 1 })).toThrow(RangeError)
    expect(() => resolveGameCameraSettings({ tumbleMaxYawRate: -1 })).toThrow(RangeError)
  })
})
