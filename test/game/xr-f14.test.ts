import { expect, it } from 'vitest'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { adjustFlightThrottle } from '../../src/runtime/xr-input.js'
import { XRScaledVehicles } from '../../src/runtime/xr-scaled-vehicles.js'

it('runs the shared plane controller with identical motion in full size and AR scale', async () => {
  const runs = await Promise.all(
    [1, 0.01, 0.002, 0.001].map((scale) =>
      XRScaledVehicles.create([presetVehicle('f14', 'jet', [0, 200, 0])], scale, {
        ignition: false,
        vehicleDamage: false,
      }),
    ),
  )
  try {
    for (const run of runs) expect(run.simulation.vehicleInfo('jet').helm).toBe('plane')
    for (let i = 0; i < 1200; i++)
      for (const run of runs)
        run.step(1 / 60, { throttle: 0, steering: 0, brake: 0, lift: 1, turn: 0 })
    const slow = runs[0].simulation.player.speed
    expect(slow).toBeGreaterThan(110)
    expect(slow).toBeLessThan(125)
    expect(runs[0].pose('jet').position.every(Number.isFinite)).toBe(true)
    expect(runs[1].pose('jet').position[2] / 0.01).toBeCloseTo(runs[0].pose('jet').position[2], 5)
    for (const run of runs) {
      const before = run.pose('jet')
      expect(run.simulation.setFlightSpeedMode('jet', 'fast')).toBe(true)
      expect(run.pose('jet')).toEqual(before)
      expect(run.simulation.vehicleInfo('jet').flightSpeedMode).toBe('fast')
    }
    for (let i = 0; i < 3600; i++)
      for (const run of runs)
        run.step(1 / 60, { throttle: 0, steering: 0, brake: 0, lift: 1, turn: 0 })
    expect(runs[0].simulation.player.speed).toBeGreaterThan(580)
    expect(runs[0].simulation.player.speed).toBeLessThan(620)
    for (const run of runs.slice(1)) {
      expect(run.simulation.player.speed).toBeCloseTo(runs[0].simulation.player.speed, 5)
      expect(run.pose('jet').position[2] / run.scale).toBeCloseTo(
        runs[0].pose('jet').position[2],
        5,
      )
    }
    expect(runs[1].simulation.player.speed).toBeCloseTo(runs[0].simulation.player.speed, 5)
    const cruise = runs[0].simulation.player.speed
    for (let i = 0; i < 60; i++)
      runs[0].step(1 / 60, { throttle: 0, steering: 0, brake: 0, lift: 0 })
    expect(runs[0].simulation.player.speed).toBeGreaterThan(cruise * 0.9)
    runs[0].simulation.setFlightSpeedMode('jet', 'slow')
    const beforeSlowing = runs[0].simulation.player.speed
    runs[0].step(1 / 60, { throttle: 0, steering: 0, brake: 0, lift: 1 })
    expect(beforeSlowing - runs[0].simulation.player.speed).toBeLessThan(2)
    runs[0].step(1 / 60, { throttle: 0.4, steering: -0.5, brake: 0, lift: 0.7, turn: 0.2 })
    expect(runs[0].simulation.vehicleInfo('jet').flightControls).toEqual({
      pitch: 0.4,
      roll: -0.5,
      yaw: 0.2,
    })
  } finally {
    for (const run of runs) run.dispose()
  }
})

it('taxies on the shared floor and takes off when the pilot pulls back', async () => {
  const run = await XRScaledVehicles.create([presetVehicle('f14', 'jet')], 0.01, {
    ignition: false,
    vehicleDamage: false,
  })
  try {
    run.updateSurfaces([])
    for (let i = 0; i < 360; i++) run.step(1 / 60, { throttle: 0, steering: 0, brake: 0, lift: 1 })
    for (let i = 0; i < 240; i++)
      run.step(1 / 60, { throttle: -0.5, steering: 0, brake: 0, lift: 1 })
    expect(run.simulation.vehicleInfo('jet').altitude).toBeGreaterThan(5)
    expect(run.pose('jet').position.every(Number.isFinite)).toBe(true)
  } finally {
    run.dispose()
  }
})

it('holds RC throttle with the stick centred and can reduce it without cutting on release', () => {
  let gas = 0
  for (let i = 0; i < 120; i++) gas = adjustFlightThrottle(gas, -1, 1 / 60)
  expect(gas).toBe(1)
  for (let i = 0; i < 120; i++) gas = adjustFlightThrottle(gas, 0, 1 / 60)
  expect(gas).toBe(1)
  for (let i = 0; i < 30; i++) gas = adjustFlightThrottle(gas, 1, 1 / 60)
  expect(gas).toBeCloseTo(0.6)
  expect(adjustFlightThrottle(gas, 0, 1 / 60)).toBeCloseTo(gas)
  expect(adjustFlightThrottle(gas, NaN, 1)).toBe(gas)
})
