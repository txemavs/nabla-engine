import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { readFileSync } from 'node:fs'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import {
  s3Presentation,
  stockVehiclePresentation,
} from '../../src/catalog/presentation/road-vehicles.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { assignVehicleColor } from '../../game/vehicle-colors.js'
import { vehicleAppearanceDefaults } from '../../src/config/vehicle-appearance.js'

describe('vehicle colours and finishes', () => {
  it('restores normal paint after chrome without modifying cabin materials', () => {
    const model = new THREE.Group()
    const paint = new THREE.MeshPhysicalMaterial({ name: 'Pintura' })
    const seat = new THREE.MeshStandardMaterial({ name: 'Asiento', color: '#111111' })
    model.add(new THREE.Mesh(new THREE.BoxGeometry(), [paint, seat]))
    s3Presentation.paint!(model, '#ffffff', 'chrome')
    expect(paint.metalness).toBe(1)
    expect(paint.roughness).toBe(vehicleAppearanceDefaults.chromePaint.roughness)
    s3Presentation.paint!(model, '#888888')
    expect(paint.color.getHexString()).toBe('888888')
    expect(paint.metalness).toBe(vehicleAppearanceDefaults.paint.metalness)
    expect(paint.clearcoat).toBe(vehicleAppearanceDefaults.paint.clearcoat)
    expect(seat.color.getHexString()).toBe('111111')
    expect(presetVehicle('car', 'default-car').color).toBe('#888888')
  })

  it('chooses the motorcycle/car palette once and leaves other vehicles unchanged', () => {
    const bike = presetVehicle('vfr800', 'bike')
    for (let i = 0; i < 6; i++) {
      assignVehicleColor(bike, () => (i + 0.5) / 6)
      expect(bike.color).toBe(vehicleAppearanceDefaults.motorcycleColors[i])
    }
    const car = presetVehicle('car', 'car')
    for (let i = 0; i < vehicleAppearanceDefaults.carColors.length; i++) {
      assignVehicleColor(car, () => (i + 0.5) / vehicleAppearanceDefaults.carColors.length)
      expect(car.color).toBe(vehicleAppearanceDefaults.carColors[i])
    }
    const truck = presetVehicle('white-truck', 'truck')
    const original = truck.color
    assignVehicleColor(truck, () => 0)
    expect(truck.color).toBe(original)
  })

  it('recolours the authored VFR fairing while preserving every other material', async () => {
    const bytes = readFileSync('assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999.glb')
    const loader = new GLTFLoader().register(() => ({
      name: 'test-textures',
      loadTexture: () => Promise.resolve(new THREE.Texture()),
    }))
    const { scene } = await loader.parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      '',
    )
    const originals = new Map<THREE.MeshStandardMaterial, string>()
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      for (const material of [object.material].flat())
        if (material instanceof THREE.MeshStandardMaterial)
          originals.set(material, material.color.getHexString())
    })
    const bike = presetVehicle('vfr800', 'bike')
    bike.color = '#f5cc19'
    stockVehiclePresentation(bike)!.mount(scene, bike)
    let painted = 0
    for (const [material, original] of originals) {
      if (material.userData.nabla?.paint) {
        expect(material.color.getHexString()).toBe('f5cc19')
        painted++
      } else expect(material.color.getHexString()).toBe(original)
    }
    expect(painted).toBe(1)
    for (const name of [
      'Fixed black plastic',
      'Fixed dark grey cockpit plastic',
      'Fixed grey radiator',
      'Fixed black wheel finish',
    ]) {
      const material = [...originals.keys()].find((material) => material.name === name)
      expect(material).toBeDefined()
      expect(material!.userData.nabla?.paint).not.toBe(true)
    }
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return
      const positions = object.geometry.attributes.position
      for (let i = 0; i < positions.count; i++)
        expect(
          [positions.getX(i), positions.getY(i), positions.getZ(i)].every(Number.isFinite),
        ).toBe(true)
    })
  })
})
