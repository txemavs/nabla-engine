import { afterEach, describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  ASPHALT_CONTRAST_DEFAULT,
  ASPHALT_CONTRAST_MAX,
  ASPHALT_CONTRAST_MIN,
  ASPHALT_CONTRAST_PIVOT,
  asphaltContrast,
  asphaltContrastShader,
  asphaltContrastTone,
  setAsphaltContrast,
  withAsphaltContrast,
} from '../../src/render/planet/ground-material.js'
import { NO_ASPHALT_MASK, asphaltMaskTexture } from '../../src/render/planet/asphalt-mask.js'

afterEach(() => {
  setAsphaltContrast(ASPHALT_CONTRAST_DEFAULT)
})

describe('asphalt contrast', () => {
  it('is neutral by default and clamps live changes', () => {
    expect(asphaltContrast()).toBe(1)
    expect(setAsphaltContrast(1.6)).toBe(1.6)
    expect(setAsphaltContrast(9)).toBe(ASPHALT_CONTRAST_MAX)
    expect(setAsphaltContrast(0)).toBe(ASPHALT_CONTRAST_MIN)
    expect(() => setAsphaltContrast(Number.NaN)).toThrow(RangeError)
  })

  it('darkens asphalt and brightens paint around the pivot, unchanged at 1', () => {
    const pivot = ASPHALT_CONTRAST_PIVOT ** 2
    const asphalt = 0.3
    const paint = 0.8
    expect(asphaltContrastTone(asphalt, 1)).toBe(asphalt)
    expect(asphaltContrastTone(asphalt, 1.6)).toBeLessThan(asphalt)
    expect(asphaltContrastTone(paint, 1.6)).toBeGreaterThan(paint)
    expect(asphaltContrastTone(pivot, 2)).toBeCloseTo(pivot, 6)
    expect(asphaltContrastTone(1, 2.5)).toBe(1)
    expect(asphaltContrastTone(0, 2.5)).toBe(0)
  })

  it('curves the map texel before it multiplies the material colour', () => {
    const out = asphaltContrastShader('void main() {\n#include <map_fragment>\n}')
    expect(out).toContain('uniform float asphaltContrast;')
    expect(out).not.toContain('#include <map_fragment>')
    expect(out.indexOf('* asphaltContrast + asphaltPivot')).toBeGreaterThan(-1)
    expect(out.indexOf('* asphaltContrast + asphaltPivot')).toBeLessThan(
      out.indexOf('diffuseColor *= sampledDiffuseColor;'),
    )
    expect(out).toContain('float asphaltLuma = dot(')
    expect(asphaltContrastShader('void main() {}')).toBe('void main() {}')
  })

  it('patches roads materials with shared uniforms and their own program key', () => {
    const plain = new THREE.MeshStandardMaterial()
    const roads = withAsphaltContrast(new THREE.MeshStandardMaterial())
    const shader = {
      uniforms: {},
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      vertexShader: THREE.ShaderLib.standard.vertexShader,
    } as unknown as THREE.WebGLProgramParametersWithUniforms
    roads.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
    expect(shader.fragmentShader).toContain('asphaltContrast != 1.0')
    setAsphaltContrast(2)
    expect((shader.uniforms.asphaltContrast as THREE.IUniform<number>).value).toBe(2)
    expect(roads.customProgramCacheKey()).not.toBe(plain.customProgramCacheKey())
  })

  it('weights the curve by the road mask on photo-draped terrain', () => {
    const out = asphaltContrastShader('void main() {\n#include <map_fragment>\n}', true)
    expect(out).toContain('uniform sampler2D asphaltMask;')
    expect(out).toContain('texture2D( asphaltMask, vMapUv ).r')
    const mask = { value: NO_ASPHALT_MASK as THREE.Texture }
    const terrain = withAsphaltContrast(new THREE.MeshStandardMaterial(), mask)
    const roads = withAsphaltContrast(new THREE.MeshStandardMaterial())
    const shader = {
      uniforms: {},
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      vertexShader: THREE.ShaderLib.standard.vertexShader,
    } as unknown as THREE.WebGLProgramParametersWithUniforms
    terrain.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
    expect(shader.uniforms.asphaltMask).toBe(mask)
    expect(terrain.customProgramCacheKey()).not.toBe(roads.customProgramCacheKey())
    expect(asphaltMaskTexture([], 900)).toBeNull()
  })
})
