/**
 * Phase-2 two-wheeler dynamics on the vfr800 preset: wheelies and stoppies from real pitch
 * (with the assist and without), the rider counterweight, the clutch kick and the combined
 * brakes. Angles are chassis pitch against the ground, nose up positive.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createEntity } from '../../src/entity/schema.js'
import type { Entity } from '../../src/entity/schema.js'
import { Simulation, idleInput } from '../../src/simulation/simulation.js'
import type { PlayerInput } from '../../src/simulation/contracts.js'
import { parseScene } from '../../src/scene/document.js'
import { twoWheeledDefaults } from '../../src/config/simulation.js'
import { finishStartUp } from '../start-up.js'

const assist = twoWheeledDefaults.pitchAssist
let sim: Simulation | undefined
afterEach(() => sim?.dispose())

function ride(edit?: (bike: Entity) => void) {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [10000, 1, 10000]
  const bike = presetVehicle('vfr800', 'bike', [0, 0.6, 0])
  edit?.(bike)
  sim = new Simulation(
    parseScene({
      version: 1,
      name: 'Pitch',
      entities: [floor, bike, createEntity('spawn', 'spawn', [3, 1, 4])],
    }),
  )
  const s = sim
  for (let i = 0; i < 60; i++) s.step(1 / 60)
  s.startInVehicle('bike')
  finishStartUp(s)
  const pose = () => s.twoWheeledPose('bike')!
  const info = () => s.vehicleInfo('bike')
  /** Run `seconds` with `input` (or a per-tick input), tracking the pitch range. */
  const run = (
    seconds: number,
    input: Partial<PlayerInput> | ((tick: number) => Partial<PlayerInput>),
  ) => {
    let max = -Infinity,
      min = Infinity
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      s.setInput({ ...idleInput(), ...(typeof input === 'function' ? input(i) : input) })
      s.step(1 / 60)
      max = Math.max(max, pose().pitch)
      min = Math.min(min, pose().pitch)
    }
    return { max, min }
  }
  return { sim: s, pose, info, run }
}

const editTwoWheeled = (bike: Entity, patch: Record<string, unknown>) => {
  Object.assign(bike.vehicle!.twoWheeled!, patch)
}

describe('vfr800 wheelies', () => {
  it('a centred rider at full throttle in first only gets the front light', () => {
    const { run, pose, info } = ride()
    const { max } = run(5, { forward: 1 })
    expect(max).toBeGreaterThan(0)
    expect(max).toBeLessThan(assist.wheelieNeutralAngle + 0.05)
    expect(pose().fallen).toBe(false)
    expect(info().gear).toBeGreaterThanOrEqual(2)
  })

  it('weight back lifts a held wheelie the assist keeps below its max angle, and it lands', () => {
    const { run, pose } = ride()
    const lift = run(4, { forward: 1, riderForward: -1 })
    expect(lift.max).toBeGreaterThan(assist.wheelieSoftAngle)
    expect(lift.max).toBeLessThan(assist.wheelieMaxAngle + 0.1)
    expect(pose().fallen).toBe(false)
    run(3, {})
    expect(Math.abs(pose().pitch)).toBeLessThan(0.05)
    expect(pose().fallen).toBe(false)
  })

  it('without the assist the same input loops it past the balance point', () => {
    const { run } = ride((bike) => editTwoWheeled(bike, { pitchAssist: { wheelie: false } }))
    const { max } = run(4, { forward: 1, riderForward: -1 })
    expect(max).toBeGreaterThan(assist.wheelieMaxAngle + 0.3)
  })

  it('the clutch kick (Shift) pops a wheelie in second gear', () => {
    const second = (kick: boolean) => {
      const { run, info, sim: s } = ride()
      let ticks = 0
      while (info().gear < 2 && ticks++ < 600) run(1 / 60, { forward: 1 })
      run(0.5, { forward: 1 })
      expect(info().gear).toBe(2)
      const result = run(3, (i) => ({
        forward: 1,
        riderForward: -1,
        sprint: kick && i >= 20 && i < 26,
      }))
      s.dispose()
      sim = undefined
      return result.max
    }
    const plain = second(false),
      kicked = second(true)
    expect(kicked).toBeGreaterThan(assist.wheelieSoftAngle)
    expect(kicked).toBeGreaterThan(plain + 0.1)
    expect(kicked).toBeLessThan(assist.wheelieMaxAngle + 0.1)
  })
})

describe('vfr800 stoppies', () => {
  const brakeFromSpeed = (
    input: Partial<PlayerInput>,
    edit?: (bike: Entity) => void,
    accelerate = 5,
  ) => {
    const r = ride(edit)
    r.run(accelerate, { forward: 1 })
    const start = r.info().speedKmh
    const pitch = r.run(6, input)
    return { ...r, start, pitch }
  }

  it('hard on the lever with the weight forward lifts the rear, limited and recovered', () => {
    const { start, pitch, pose, info, run } = brakeFromSpeed({ forward: -1, riderForward: 1 })
    expect(start).toBeGreaterThan(80)
    expect(pitch.min).toBeLessThan(-0.07)
    expect(pitch.min).toBeGreaterThan(-(assist.stoppieMaxAngle + 0.1))
    // Stopped: S still held would now walk the bike back (foot paddling), so let go.
    run(1, {})
    expect(info().speedKmh).toBeLessThan(2)
    expect(Math.abs(pose().pitch)).toBeLessThan(0.05)
    expect(pose().fallen).toBe(false)
  })

  it('a centred rider keeps the rear tyre nearly down', () => {
    const { pitch } = brakeFromSpeed({ forward: -1 })
    expect(pitch.min).toBeGreaterThan(-(assist.stoppieNeutralAngle + 0.06))
  })

  it('without the assist the rear climbs much higher', () => {
    const assisted = brakeFromSpeed({ forward: -1, riderForward: 1 }, undefined, 4).pitch.min
    sim?.dispose()
    sim = undefined
    const free = brakeFromSpeed(
      { forward: -1, riderForward: 1 },
      (bike) => editTwoWheeled(bike, { pitchAssist: { stoppie: false } }),
      4,
    ).pitch.min
    // From ~100 km/h: unassisted the rear goes far past the assisted maximum.
    expect(free).toBeLessThan(assisted - 0.3)
  })
})

describe('vfr800 combined brakes (Dual CBS placeholder)', () => {
  const dropIn = (
    seconds: number,
    input: Partial<PlayerInput>,
    cbs: Record<string, number> | null,
  ) => {
    const r = ride((bike) => {
      if (cbs) bike.vehicle!.twoWheeled!.cbs = cbs
      else delete bike.vehicle!.twoWheeled!.cbs
    })
    r.run(5, { forward: 1 })
    const start = r.info().speedKmh
    r.run(seconds, input)
    const drop = start - r.info().speedKmh
    r.sim.dispose()
    sim = undefined
    return drop
  }

  it('the pedal also works the front brake', () => {
    const linked = dropIn(1.5, { brake: true }, {}),
      alone = dropIn(1.5, { brake: true }, null)
    expect(linked).toBeGreaterThan(alone * 1.2)
  })

  it('the lever also works the rear brake', () => {
    // Same front share both times; only the linked rear circuit differs.
    const linked = dropIn(1.5, { forward: -1 }, {}),
      frontOnly = dropIn(1.5, { forward: -1 }, { leverRear: 0 })
    expect(linked).toBeGreaterThan(frontOnly + 1)
  })
})

describe('vfr800 rider counterweight', () => {
  it('moves the rider within its limits and back to centre', () => {
    const { run, pose } = ride()
    run(2, { forward: 0.3, riderRight: 1, riderForward: 1 })
    const rider = twoWheeledDefaults.rider
    expect(pose().riderShift[0]).toBeCloseTo(rider.lateral, 6)
    expect(pose().riderShift[1]).toBeCloseTo(-rider.forward, 6)
    // Keys released on a straight at a steady speed: the automatic rider centres again.
    run(3, { forward: 0.3 })
    expect(Math.abs(pose().riderShift[0])).toBeLessThan(0.01)
    expect(Math.abs(pose().riderShift[1])).toBeLessThan(0.01)
  })

  it('hanging off to the inside makes the bike lean less in the same turn', () => {
    // Automatic rider off: compare a centred rider with one hanging off on the keys.
    const lean = (riderRight: number) => {
      const {
        run,
        info,
        pose,
        sim: s,
      } = ride((bike) => {
        bike.vehicle!.twoWheeled!.rider!.auto = { enabled: false }
        // Same turn at the normal limit (held full steer would raise it to the peg lean).
        delete bike.vehicle!.twoWheeled!.pegLean
      })
      run(5, { forward: 1 })
      run(4, { forward: 0.3, right: 1, riderRight })
      const result = Math.abs(info().lean)
      expect(pose().fallen).toBe(false)
      s.dispose()
      sim = undefined
      return result
    }
    const upright = lean(0),
      hanging = lean(1)
    expect(upright).toBeGreaterThan(0.3)
    expect(hanging).toBeLessThan(upright - 0.03)
  })
})

describe('vfr800 automatic rider', () => {
  const auto = twoWheeledDefaults.rider.auto

  it('hangs off to the inside of a turn and sits centred when cruising', () => {
    const { run, pose } = ride()
    run(5, { forward: 1 })
    run(3, { forward: 0.25 })
    expect(Math.abs(pose().riderShift[0])).toBeLessThan(0.01)
    expect(Math.abs(pose().riderShift[1])).toBeLessThan(0.01)
    run(3, { forward: 0.3, right: 1 })
    expect(pose().riderShift[0]).toBeGreaterThan(0.08)
    expect(pose().fallen).toBe(false)
  })

  it('moves forward under hard throttle and back under hard front braking', () => {
    const { run, pose } = ride()
    run(0.8, { forward: 1 })
    expect(pose().riderShift[1]).toBeLessThan(-0.05)
    run(4, { forward: 1 })
    run(0.8, { forward: -1 })
    expect(pose().riderShift[1]).toBeGreaterThan(0.05)
  })

  it('keeps the front lower than a centred rider at full throttle in first', () => {
    const peak = (enabled: boolean) => {
      const r = ride((bike) => {
        bike.vehicle!.twoWheeled!.rider!.auto = { enabled }
      })
      const result = r.run(3, { forward: 1 }).max
      r.sim.dispose()
      sim = undefined
      return result
    }
    expect(peak(true)).toBeLessThanOrEqual(peak(false) + 1e-3)
  })

  it('gives way to the keys at once and takes back over after the release delay', () => {
    const { run, pose } = ride()
    // A deliberate wheelie: sit back (L) with the throttle open; the automatic rider would
    // move forward under this acceleration.
    const held = run(2, { forward: 1, riderForward: -1 })
    expect(pose().riderShift[1]).toBeGreaterThan(0.2)
    expect(held.max).toBeGreaterThan(assist.wheelieNeutralAngle * 2)
    // Released: still the key target (centred) during the delay, then automatic again.
    run(auto.releaseDelay * 0.5, { forward: 0.3, right: 1 })
    const during = pose().riderShift[0]
    run(auto.releaseDelay + auto.blend + 1.5, { forward: 0.3, right: 1 })
    expect(Math.abs(during)).toBeLessThan(0.05)
    expect(pose().riderShift[0]).toBeGreaterThan(0.08)
  })
})
