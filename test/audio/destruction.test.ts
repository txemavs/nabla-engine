import { expect, it } from 'vitest'
import { blastVoice } from '../../src/audio/destruction.js'

it('a vehicle-sized blast keeps the original explosion voice', () => {
  expect(blastVoice()).toEqual(blastVoice(1))
  expect(blastVoice(1)).toEqual({
    noisePeak: 0.7,
    noiseDuration: 1.3,
    bassPeak: 0.65,
    bassDuration: 0.6,
    filterHz: 850,
    bassStartHz: 105,
    bassEndHz: 28,
  })
})

it('a smaller blast is quieter, shorter and higher, and never louder than a vehicle', () => {
  const small = blastVoice(0.18),
    full = blastVoice(1)
  expect(small.noisePeak).toBeLessThan(full.noisePeak)
  expect(small.noiseDuration).toBeLessThan(full.noiseDuration)
  expect(small.bassDuration).toBeLessThan(full.bassDuration)
  expect(small.filterHz).toBeGreaterThan(full.filterHz)
  expect(small.bassStartHz).toBeGreaterThan(full.bassStartHz)
  expect(blastVoice(5)).toEqual(full)
  expect(blastVoice(0).noisePeak).toBeGreaterThan(0)
  expect(blastVoice(Number.NaN)).toEqual(full)
})
