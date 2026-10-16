import { expect, it } from 'vitest'
import {
  createDrivetrain,
  selectManualGear,
  stepDrivetrain,
} from '../../src/simulation/vehicles/drivetrain.js'
const spec = {
  powerCv: 150,
  torqueNm: 250,
  ratios: [3.4, 2.1, 1.4, 1, 0.8],
  finalDrive: 3.8,
  grip: 4.5,
}
it('uses the same H-pattern gears, neutral and reverse with direction and overrev protection', () => {
  const state = createDrivetrain()
  expect(selectManualGear(state, spec, 0.32, 30, -1)).toBe(false)
  expect(selectManualGear(state, spec, 0.32, 100, 1)).toBe(false)
  expect(selectManualGear(state, spec, 0.32, 0, 2)).toBe(true)
  for (let i = 0; i < 120; i++) stepDrivetrain(state, spec, 0.32, 5, 0.7, false, 1 / 60, false, 2)
  expect(state.gear).toBe(2)
  expect(state.force).toBeGreaterThan(0)
  for (let i = 0; i < 120; i++) stepDrivetrain(state, spec, 0.32, 5, 0.7, false, 1 / 60, false, 0)
  expect(state.gear).toBe(0)
  expect(state.force).toBe(0)
})
