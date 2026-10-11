import { expect, it } from 'vitest'
import { Quaternion, Vector3 } from 'three'
import { SpatialEmitter } from '../../src/audio/positional.js'

function emitter() {
  const param = () => ({
    value: 0,
    setValueAtTime(value: number) {
      this.value = value
    },
    setTargetAtTime(value: number) {
      this.value = value
    },
  })
  const panner = {
    positionX: param(),
    positionY: param(),
    positionZ: param(),
    connect() {},
    disconnect() {},
  }
  const input = { gain: param(), connect() {}, disconnect() {} }
  const context = {
    currentTime: 1,
    createGain: () => input,
    createPanner: () => panner,
  } as unknown as AudioContext
  return { sound: new SpatialEmitter(context, {} as AudioNode, { maxDistance: 12 }), input, panner }
}
it('keeps a sound at its world origin as the listener moves and turns, including distant planet coordinates', () => {
  const { sound, panner } = emitter()
  sound.setListener([6000000, 0, 0], [0, 0, 0, 1])
  sound.setPosition([6000003, 0, -2])
  expect(panner.positionX.value).toBe(3)
  expect(panner.positionZ.value).toBe(-2)
  const turn = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)
  sound.setListener([6000000, 0, 0], turn.toArray())
  expect(panner.positionX.value).toBeCloseTo(-3)
  expect(panner.positionZ.value).toBeCloseTo(2)
})
it('fades quiet impacts out of range and supports masking by the moving listener', () => {
  const { sound, input } = emitter()
  sound.setPosition([0, 0, -1])
  expect(input.gain.value).toBe(1)
  sound.setMask(1 / (1 + (200 / 30) ** 2))
  expect(input.gain.value).toBeLessThan(0.025)
  sound.setListener([0, 0, 20], [0, 0, 0, 1])
  expect(input.gain.value).toBe(0)
})
