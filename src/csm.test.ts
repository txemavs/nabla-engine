import { expect, it } from 'vitest'
import { MeshStandardMaterial, PerspectiveCamera, Scene, Vector3, ShaderChunk } from 'three'
import { ShadowManager, cascadedLighting } from '../playground/csm.js'

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
