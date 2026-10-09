import { describe, expect, it } from 'vitest'
import { freshFirearm, type FirearmSpec } from '../../src/simulation/weapons/firearm.js'
import {
  autoIntervalMs,
  fireModeLabel,
  machinePistol,
  nextFireMode,
  pullTrigger,
  RecoilYaw,
  specForMode,
} from '../../src/simulation/weapons/machine-pistol.js'

const pistol: FirearmSpec = {
  magazineCapacity: 13,
  chamber: 1,
  cycleMs: 100,
  reloadMs: { magazineOut: 300, magazineIn: 900, slideRelease: 1200 },
}

/** Hold the trigger from t=0 to `ms`, sampling every frame; count the shots. */
function hold(mode: 'semi' | 'burst30', ms: number, frameMs = 1000 / 60) {
  const spec = specForMode(pistol, mode)
  const state = freshFirearm(spec)
  let shots = 0
  for (let t = 0; t <= ms; t += frameMs) if (pullTrigger(state, spec, mode, true, t).fired) shots++
  return { shots, state }
}

describe('experimental full-auto', () => {
  it('toggles SEMI / RÁFAGA 30 with its HUD labels', () => {
    expect(nextFireMode('semi')).toBe('burst30')
    expect(nextFireMode('burst30')).toBe('semi')
    expect(fireModeLabel('semi')).toBe('SEMI')
    expect(fireModeLabel('burst30')).toBe('EXPERIMENTAL · RÁFAGA 30')
  })

  it('semi fires once per press; a held trigger in RÁFAGA fires at the cyclic rate', () => {
    expect(hold('semi', 1000).shots).toBe(1)
    const auto = hold('burst30', 1000)
    // 900 rpm: one shot every 66.7 ms; 60 fps frames round each interval up to 5 frames.
    expect(auto.shots).toBeGreaterThanOrEqual(12)
    expect(auto.shots).toBeLessThanOrEqual(16)
    expect(autoIntervalMs()).toBeCloseTo(60000 / machinePistol.rpm)
  })

  it('empties the 30-round magazine plus the chambered round, then locks back', () => {
    const spec = specForMode(pistol, 'burst30')
    expect(spec.magazineCapacity).toBe(30)
    const { shots, state } = hold('burst30', 5000)
    expect(shots).toBe(31)
    expect(state.slideLocked).toBe(true)
  })

  it('random sideways kick accumulates while held and recovers on release', () => {
    let n = 0
    const yaw = new RecoilYaw(() => [1, 0.9, 1][n++ % 3])
    let applied = 0
    for (let i = 0; i < 3; i++) {
      yaw.kick()
      applied += yaw.step(1 / 60, true)
    }
    expect(applied).toBeGreaterThan(0)
    expect(applied).toBeCloseTo(yaw.total)
    for (let i = 0; i < 120; i++) applied += yaw.step(1 / 60, false)
    expect(Math.abs(applied)).toBeLessThan(1e-4)
  })
})
