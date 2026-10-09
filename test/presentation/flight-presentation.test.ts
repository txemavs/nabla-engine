import { expect, it } from 'vitest'
import { Vector3, Mesh, SpotLight, type Object3D } from 'three'
import { withinMapDistance } from '../../src/render/planet/visibility.js'
import { CarrierThrusters } from '../../src/render/entity/carrier-thrusters.js'

it('keeps nearby ground detail visible in flight without extending horizontal range', () => {
  const center = new Vector3(0, 0, 0)
  expect(withinMapDistance(center, new Vector3(100, 500, 0), 20, 250)).toBe(true)
  expect(withinMapDistance(center, new Vector3(300, 500, 0), 20, 250)).toBe(false)
  expect(withinMapDistance(center, new Vector3(100, 0, 0), 20, 250)).toBe(true)
})
it('mounts four downward exhausts and extinguishes them after flight stops', () => {
  const effect = new CarrierThrusters()
  const jets: Object3D[] = []
  effect.root.traverse((child) => {
    if (child.children.some((part) => part instanceof Mesh)) jets.push(child)
  })
  const lamps: SpotLight[] = []
  effect.root.traverse((child) => {
    if (child instanceof SpotLight) lamps.push(child)
  })
  expect(jets).toHaveLength(4)
  expect(lamps).toHaveLength(4)
  expect(effect.root.visible).toBe(false)
  effect.update(true, 500, 0.1, 0)
  expect(effect.root.visible).toBe(true)
  expect(jets[0].parent!.visible).toBe(true)
  for (const jet of jets) {
    expect(jet.position.y).toBeCloseTo(-1.085)
    for (const flame of jet.children) {
      expect(flame.position.y).toBeLessThan(0)
      expect((flame as Mesh).castShadow).toBe(false)
    }
  }
  for (let i = 0; i < 100; i++) effect.update(false, 0, 0.1, i)
  // Flames out; the lamps stay in the scene (dark by day) so the light count does not change.
  expect(jets[0].parent!.visible).toBe(false)
  expect(effect.root.visible).toBe(true)
  for (const lamp of lamps) {
    expect(lamp.parent!.visible).toBe(true)
    expect(lamp.intensity).toBe(0)
  }
})
