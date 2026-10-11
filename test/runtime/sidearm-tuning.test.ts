import { expect, it } from 'vitest'
import {
  normalizeSidearmTuning,
  readSidearmTuning,
  writeSidearmTuning,
  sidearmTuningDefaults,
} from '../../src/runtime/sidearm-tuning.js'
it('keeps malformed saved settings safe and clamps live slider values', () => {
  expect(readSidearmTuning({ getItem: () => '{broken', setItem: () => {} })).toEqual(
    sidearmTuningDefaults,
  )
  expect(normalizeSidearmTuning({ height: NaN, angle: Infinity })).toEqual(sidearmTuningDefaults)
  expect(normalizeSidearmTuning({ height: -9, angle: 99 })).toEqual({ height: -0.08, angle: 8 })
})
it('round-trips the chosen millimetre height and degree angle', () => {
  let value = ''
  const storage = {
    getItem: () => value,
    setItem: (_key: string, saved: string) => {
      value = saved
    },
  }
  writeSidearmTuning(storage, { height: -0.033, angle: 0.7 })
  expect(readSidearmTuning(storage)).toEqual({ height: -0.033, angle: 0.7 })
})
