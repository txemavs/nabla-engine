import { expect, it } from 'vitest'
import {
  BackSide,
  DoubleSide,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  ShaderChunk,
} from 'three'
import { castShadowFromBackFaces } from '../../src/render/planet/ground-material.js'
import {
  cascadeShadowBias,
  normalizeShadowBias,
  shadowBiasMetres,
  shadowTiers,
} from '../../src/config/shadows.js'
import {
  ShadowManager,
  cascadeBlendMetres,
  cascadeBoundPad,
  cascadedLighting,
  softenCascadeSeams,
} from '../../src/render/shadows.js'

it('reconfigures cascade count, restores hooks and releases shadow maps', () => {
  const manager = new ShadowManager(),
    camera = new PerspectiveCamera(),
    scene = new Scene()
  const direction = new Vector3(1, -2, 1)
  const material = new MeshStandardMaterial(),
    original = material.onBeforeCompile
  manager.setupMaterial(material)
  for (const [quality, count] of [
    [512, 1],
    [1024, 2],
    [2048, 3],
  ]) {
    manager.reconfigure(quality, camera, scene, direction, 3)
    expect(manager.lights).toHaveLength(count)
    expect(material.defines?.CSM_CASCADES).toBe(count)
    expect(material.defines?.CSM_FADE).toBe('')
    const version = material.version
    manager.setupMaterial(material)
    expect(material.version).toBe(version)
    let released = false
    manager.lights[0].shadow.map = {
      dispose: () => {
        released = true
      },
    } as never
    manager.reconfigure(0, camera, scene, direction, 3)
    expect(released).toBe(true)
    expect(scene.children).toHaveLength(0)
    expect(material.onBeforeCompile).toBe(original)
    expect(material.defines?.USE_CSM).toBeUndefined()
  }
  material.dispose()
  manager.reconfigure(512, camera, scene, direction, 3)
  expect(material.defines?.USE_CSM).toBeUndefined()
  manager.dispose()
})
it('updates the projection on zoom and keeps absolute cascade positions during rebasing', () => {
  const manager = new ShadowManager(),
    camera = new PerspectiveCamera(48, 1, 0.1, 4000),
    scene = new Scene()
  camera.position.set(12000, 30, -10000)
  manager.reconfigure(1024, camera, scene, new Vector3(1, -2, 1), 3)
  manager.update(camera, new Vector3())
  const positions = manager.lights.map((l) => l.position.clone())
  const origin = camera.position.clone()
  camera.position.set(0, 0, 0)
  manager.update(camera, origin)
  manager.lights.forEach((light, i) =>
    expect(light.position.clone().add(origin).distanceTo(positions[i])).toBeLessThan(1e-6),
  )
  const oldWidth = manager.lights[0].shadow.camera.right
  camera.aspect = 2
  camera.updateProjectionMatrix()
  manager.update(camera, origin)
  expect(manager.lights[0].shadow.camera.right).not.toBe(oldWidth)
  manager.dispose()
})

it('preserves physical-material reflection initialization with shadows on and off', () => {
  const manager = new ShadowManager()
  for (const quality of [512, 1024, 2048, 0, 512]) {
    manager.reconfigure(quality, new PerspectiveCamera(), new Scene(), new Vector3(1, -2, 1), 3)
    const source = ShaderChunk.lights_fragment_begin
    expect(source).toContain('material.dfg = texture2D( dfgLUT')
    expect(source).toContain('material.multiScatteringCompensation =')
    expect(source).toContain('material.iridescenceF0Metallic =')
    expect(source).toContain('NUM_SUN_LIGHTS')
    expect(source).toContain('USE_LIGHT_PROBES_GRID')
    expect(source.match(/material.dfg =/g)).toHaveLength(1)
    expect(source).toContain('CSM_cascades')
  }
  manager.dispose()
  expect(() => cascadedLighting('changed upstream layout', '')).toThrow('Unsupported')
})

it('widens the 140 m and 500 m cascade fades without eating the near field', () => {
  expect(cascadeBlendMetres(0)).toBe(0)
  expect(cascadeBlendMetres(140)).toBe(28)
  expect(cascadeBlendMetres(500)).toBe(90)
  expect(cascadeBlendMetres(1200)).toBe(120)
  expect(cascadeBoundPad(0, 3, 4000)).toBe(48)
  expect(cascadeBoundPad(1, 3, 4000)).toBe(90)
  expect(cascadeBoundPad(2, 3, 4000)).toBe(120)
  const faded = softenCascadeSeams('margin = 0.25 * pow( closestEdge, 2.0 );')
  expect(faded).toContain('closestEdge * ( shadowFar - cameraNear ) * 0.18')
  expect(faded).not.toContain('margin = 0.25 * pow( closestEdge, 2.0 );')
  expect(() => softenCascadeSeams('no fade line')).toThrow('Unsupported')
})

it('enables cascade fade on materials and keeps the widened blend after reconfigure', () => {
  const manager = new ShadowManager()
  const material = new MeshStandardMaterial()
  manager.setupMaterial(material)
  const camera = new PerspectiveCamera(48, 1, 0.1, 50000)
  const scene = new Scene()
  manager.reconfigure(2048, camera, scene, new Vector3(1, -2, 1), 3)
  expect(material.defines?.CSM_FADE).toBe('')
  const padded = manager.lights[1].shadow.camera.right
  manager.updateFrustums()
  expect(padded - manager.lights[1].shadow.camera.right).toBeCloseTo(90)
  manager.reconfigure(4096, camera, scene, new Vector3(1, -2, 1), 3)
  expect(material.defines?.CSM_FADE).toBe('')
  expect(ShaderChunk.lights_fragment_begin).toContain(
    'closestEdge * ( shadowFar - cameraNear ) * 0.18',
  )
  material.dispose()
  manager.dispose()
})

it('scales each cascade bias with its texel size and applies the player factor live', () => {
  const manager = new ShadowManager(),
    camera = new PerspectiveCamera(60, 1.6, 0.1, 50000),
    scene = new Scene()
  manager.reconfigure(2048, camera, scene, new Vector3(1, -0.3, 0.2), 3)
  manager.update(camera, new Vector3())
  const tier = shadowTiers[2048]!
  const texel = (index: number) => {
    const cam = manager.lights[index].shadow.camera
    return (cam.right - cam.left) / tier.mapSize
  }
  const near = manager.lights[0].shadow
  const expected = cascadeShadowBias(tier, texel(0))
  expect(near.normalBias).toBeCloseTo(expected.normal)
  expect(near.normalBias).toBeCloseTo(tier.normalBiasTexels * texel(0))
  const range = near.camera.far - near.camera.near
  expect(near.bias).toBeCloseTo(-expected.depth / range, 12)
  // Coarser cascades get a larger offset, but never past the contact-safe ceiling.
  expect(manager.lights[1].shadow.normalBias).toBeGreaterThan(near.normalBias)
  expect(manager.lights[2].shadow.normalBias).toBe(shadowBiasMetres.normal.max)
  manager.setBiasScale(2)
  expect(manager.shadowBiasScale).toBe(2)
  expect(manager.lights[0].shadow.normalBias).toBeCloseTo(expected.normal * 2)
  // The factor survives a quality change.
  manager.reconfigure(512, camera, scene, new Vector3(1, -0.3, 0.2), 3)
  manager.update(camera, new Vector3())
  expect(manager.shadowBiasScale).toBe(2)
  manager.setBiasScale(0)
  expect(manager.lights[0].shadow.normalBias).toBe(0)
  expect(manager.lights[0].shadow.bias === 0).toBe(true)
  manager.dispose()
})

it('clamps the shadow bias factor and keeps the floor on tight frusta', () => {
  expect(normalizeShadowBias(undefined)).toBe(1)
  expect(normalizeShadowBias('1.5')).toBe(1.5)
  expect(normalizeShadowBias(Number.NaN)).toBe(1)
  expect(normalizeShadowBias(7)).toBe(3)
  expect(normalizeShadowBias(-2)).toBe(0)
  const tight = cascadeShadowBias(shadowTiers[2048]!, 0.01)
  expect(tight.normal).toBe(shadowBiasMetres.normal.min)
  expect(tight.depth).toBe(shadowBiasMetres.depth.min)
})

it('casts terrain shadows from back faces even when the ground is double-sided', () => {
  const lidar = new MeshStandardMaterial({ side: DoubleSide })
  expect(castShadowFromBackFaces(lidar)).toBe(lidar)
  expect(lidar.shadowSide).toBe(BackSide)
  expect(lidar.side).toBe(DoubleSide)
})
