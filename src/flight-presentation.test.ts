import { expect, it } from 'vitest'
import { Vector3, Mesh } from 'three'
import { withinMapDistance } from '../playground/map-visibility.js'
import { CarrierThrusters } from '../playground/carrier-thrusters.js'

it('keeps nearby ground detail visible in flight without extending horizontal range', () => {
  const center = new Vector3(0, 0, 0)
  expect(withinMapDistance(center, new Vector3(100, 500, 0), 20, 250)).toBe(true)
  expect(withinMapDistance(center, new Vector3(300, 500, 0), 20, 250)).toBe(false)
  expect(withinMapDistance(center, new Vector3(100, 0, 0), 20, 250)).toBe(true)
})
it('mounts four downward exhausts and extinguishes them after flight stops', () => {
  const effect = new CarrierThrusters()
  expect(effect.root.children).toHaveLength(4)
  expect(effect.root.visible).toBe(false)
  effect.update(true, 500, 0.1, 0)
  expect(effect.root.visible).toBe(true)
  for (const jet of effect.root.children) {
    expect(jet.position.y).toBeCloseTo(-1.085)
    for (const flame of jet.children) {
      expect(flame.position.y).toBeLessThan(0)
      expect((flame as Mesh).castShadow).toBe(false)
    }
  }
  for (let i = 0; i < 100; i++) effect.update(false, 0, 0.1, i)
  expect(effect.root.visible).toBe(false)
})
