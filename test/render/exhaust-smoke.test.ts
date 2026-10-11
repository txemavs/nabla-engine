import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ExhaustSmoke } from '../../src/render/entity/exhaust-smoke.js'

describe('exhaust smoke', () => {
  it('emits from a socket, lightens diesel smoke with speed and clears it when disabled', () => {
    const space = new THREE.Group(),
      outlet = new THREE.Object3D()
    outlet.position.set(1, 2, 3)
    space.add(outlet)
    const smoke = new ExhaustSmoke(outlet, space, {
      direction: [1, 0, 0],
      color: '#111111',
      clearColor: '#888888',
      clearAtKmh: 60,
    })
    smoke.update(0.05, true, 1, 0)
    const tint = smoke.root.geometry.getAttribute('tint')
    const black = tint.getX(0)
    expect(smoke.root.geometry.getAttribute('position').getX(0)).toBeCloseTo(1.03)
    smoke.update(0.05, true, 1, 60)
    expect(tint.getX(1)).toBeGreaterThan(black * 10)
    smoke.setEnabled(false)
    expect(smoke.root.visible).toBe(false)
    smoke.update(0.05, true, 1, 60)
    expect(smoke.root.visible).toBe(false)
    smoke.setEnabled(true)
    smoke.update(0.05, false, 0)
    expect(smoke.root.visible).toBe(false)
    smoke.dispose()
  })
  it('emits only while running and lets the remaining vapour dissipate after stopping', () => {
    const space = new THREE.Group(),
      outlet = new THREE.Mesh(new THREE.CircleGeometry(0.023, 12))
    space.add(outlet)
    const smoke = new ExhaustSmoke(outlet, space)
    space.add(smoke.root)
    smoke.update(0.05, false, 0)
    expect(smoke.root.visible).toBe(false)
    for (let i = 0; i < 10; i++) smoke.update(0.05, true, 0.5)
    expect(smoke.root.visible).toBe(true)
    const positions = smoke.root.geometry.getAttribute('position')
    expect(positions.count).toBe(48)
    const first = new THREE.Vector3().fromBufferAttribute(positions, 0)
    expect(first.z).toBeGreaterThan(0)
    space.position.set(-100000, 0, 0)
    smoke.update(0.05, false, 0)
    expect(new THREE.Vector3().fromBufferAttribute(positions, 0).distanceTo(first)).toBeLessThan(
      0.1,
    )
    for (let i = 0; i < 32; i++) smoke.update(0.05, false, 0)
    expect(smoke.root.visible).toBe(false)
    smoke.dispose()
  })
})
