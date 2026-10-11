import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { ExhaustSmoke, s3SmokeAmount } from '../../src/render/entity/exhaust-smoke.js'

describe('exhaust smoke', () => {
  it.each([
    [0, 0.1],
    [1000, 0.1],
    [4000, 1.05],
    [7000, 2],
    [9000, 2],
  ])('S3 smoke quantity follows rpm (%s -> %s)', (rpm, amount) => {
    expect(s3SmokeAmount(rpm)).toBeCloseTo(amount)
  })
  it('S3 emits little at high rpm without throttle and reaches 200% under full load', () => {
    const space = new THREE.Group(),
      outlet = new THREE.Object3D()
    space.add(outlet)
    const counts: number[] = []
    for (const load of [0, 1]) {
      const smoke = new ExhaustSmoke(outlet, space, { emissionRate: 32, capacity: 96 })
      smoke.setAmount(s3SmokeAmount(7000, load))
      for (let i = 0; i < 20; i++) smoke.update(0.05, true, load)
      const life = smoke.root.geometry.getAttribute('life')
      counts.push(
        Array.from({ length: life.count }, (_, i) => life.getX(i)).filter((v) => v > 0).length,
      )
      smoke.dispose()
    }
    expect(counts).toEqual([3, 64])
  })
  it('twin outlets emit half an interval apart rather than simultaneously', () => {
    const space = new THREE.Group(),
      outlet = new THREE.Object3D()
    space.add(outlet)
    const first = new ExhaustSmoke(outlet, space)
    const second = new ExhaustSmoke(outlet, space, { emissionPhase: 0.5 })
    for (let i = 0; i < 6; i++) {
      first.update(0.02, true, 0)
      second.update(0.02, true, 0)
    }
    expect(first.root.visible).toBe(true)
    expect(second.root.visible).toBe(false)
    for (let i = 0; i < 2; i++) {
      first.update(0.02, true, 0)
      second.update(0.02, true, 0)
    }
    expect(second.root.visible).toBe(true)
    first.dispose()
    second.dispose()
  })
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
