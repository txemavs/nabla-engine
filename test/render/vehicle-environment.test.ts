import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import { vehicleAppearanceDefaults } from '../../src/config/vehicle-appearance.js'
import { applyVehicleEnvironment } from '../../src/render/vehicle-presentation/reflection-environment.js'

describe('common vehicle PBR lighting', () => {
  for (const asset of [
    'cars/a3/a3.cabrio.glb',
    'trucks/white-truck/assets/tractor.modern.glb',
    'trucks/white-truck/assets/trailer.box.glb',
    'motorcycles/vfr800fi-1999/vfr800fi-1999.glb',
  ]) {
    it(`lights every PBR material without repainting ${asset}`, async () => {
      const bytes = readFileSync(`assets/library/${asset}`)
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
      // Node checks material membership/values; actual texture decoding is covered in WebGL.
      const loader = new GLTFLoader().register(() => ({
        name: 'unit-test-textures',
        loadTexture: () => Promise.resolve(new THREE.Texture()),
      }))
      const { scene } = await loader.parseAsync(buffer as ArrayBuffer, '')
      const originals = new Map<THREE.MeshStandardMaterial, unknown>()
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        for (const material of [object.material].flat()) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue
          originals.set(material, [
            material.color.toArray(),
            material.metalness,
            material.roughness,
          ])
        }
      })
      const rig = applyVehicleEnvironment(scene)
      expect(originals.size).toBeGreaterThan(0)
      expect(rig.materials.length).toBe(originals.size)
      for (const [material, original] of originals) {
        expect(material.envMap).toBeTruthy()
        expect([material.color.toArray(), material.metalness, material.roughness]).toEqual(original)
      }
      rig.setLevel(0)
      const retained = rig.materials.filter((material) => material.envMapIntensity > 0)
      if (asset.startsWith('motorcycles/')) {
        expect(retained.map((material) => material.name)).toEqual([
          'VFR silencer subtle reflection',
        ])
        expect(retained[0].envMapIntensity).toBeCloseTo(0.025)
      } else expect(retained).toEqual([])
    })
  }

  it('gives late wheels/steering the current night and user level', () => {
    const rig = applyVehicleEnvironment(new THREE.Group())
    rig.setLevel(0.2)
    const material = new THREE.MeshStandardMaterial({ color: '#090909', metalness: 0 })
    const part = new THREE.Mesh(new THREE.BoxGeometry(), material)
    rig.add(part)
    expect(material.envMapIntensity).toBeCloseTo(
      vehicleAppearanceDefaults.environment.intensity * 0.2,
    )
    expect(material.color.getHexString()).toBe('090909')
    rig.setLevel(0)
    expect(material.envMapIntensity).toBe(0)
    rig.setLevel(1)
    expect(material.envMapIntensity).toBe(vehicleAppearanceDefaults.environment.intensity)
  })
})
