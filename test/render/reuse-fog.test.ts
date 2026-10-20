import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { reuseFog } from '../../src/render/planet/fog.js'

describe('reuseFog', () => {
  it('updates an existing Fog in place', () => {
    const fog = new THREE.Fog('#000000', 1, 2)
    const next = reuseFog(fog, '#93b7cd', 300, 4000)
    expect(next).toBe(fog)
    expect(next.color.getHexString()).toBe('93b7cd')
    expect([next.near, next.far]).toEqual([300, 4000])
  })
  it('creates a Fog when there is none or it is exponential', () => {
    expect(reuseFog(null, '#ffffff', 1, 2)).toBeInstanceOf(THREE.Fog)
    const exp = new THREE.FogExp2('#ffffff', 0.01)
    expect(reuseFog(exp, '#ffffff', 1, 2)).not.toBe(exp)
  })
})
