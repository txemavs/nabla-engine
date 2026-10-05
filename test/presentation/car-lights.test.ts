import { expect, it } from 'vitest'
import * as THREE from 'three'
import { createA3Lights } from '../../src/catalog/presentation/a3-lamps.js'
import { AuthoredVehicleLights } from '../../src/render/vehicle-presentation/authored-lights.js'
import { lightingDefaults } from '../../src/config/lighting.js'

it('switches off all lamps when unoccupied and separates braking from reversing', () => {
  const model = new THREE.Group()
  const lens = (parentName: string, materialName: string) => {
    const parent = new THREE.Group()
    parent.name = parentName
    const material = new THREE.MeshStandardMaterial()
    material.name = materialName
    parent.add(new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), material))
    model.add(parent)
    return material
  }
  const position = lens('Luz_izquierda', 'PilotoP')
  position.emissive.set('#ff0000')
  position.emissiveIntensity = 2
  const brake = lens('Luz_izquierda', 'Rojo 6')
  const reverse = lens('Luces_Maletero', 'PilotoRojo')
  const lights = createA3Lights(model)
  expect(position.emissiveIntensity).toBe(0)
  lights.toggleHeadlights()
  lights.update({ powered: true, braking: true, reversing: false }, 0)
  expect(position.emissiveIntensity).toBeGreaterThan(0)
  expect(brake.emissiveIntensity).toBeGreaterThan(0)
  expect(reverse.emissiveIntensity).toBe(0)
  lights.update({ powered: true, braking: false, reversing: true }, 0)
  expect(brake.emissiveIntensity).toBe(0)
  expect(reverse.emissiveIntensity).toBeGreaterThan(0)
  lights.update({ powered: false, braking: true, reversing: true }, 0)
  for (const material of [position, brake, reverse]) expect(material.emissiveIntensity).toBe(0)
  const courtesy = model.children.filter((child) => child instanceof THREE.PointLight)
  expect(courtesy).toHaveLength(2)
  expect(courtesy.every((lamp) => lamp.visible === false)).toBe(true)
  lights.update({ powered: true, braking: false, reversing: false }, 0, false)
  for (const lamp of courtesy) expect(lamp.intensity).toBe(0)
  lights.update({ powered: true, braking: false, reversing: false }, 0, true)
  for (const lamp of courtesy) expect(lamp.intensity).toBeGreaterThan(0)
  lights.update({ powered: false, braking: false, reversing: false }, 0, true)
  for (const lamp of courtesy) expect(lamp.intensity).toBe(0)
})

it('builds focused, forward-only low and high beams at the S3 lamp units like the truck', () => {
  const model = new THREE.Group()
  for (const [name, x] of [
    ['Foco_Izquierdo', 0.7],
    ['Foco_Derecho', -0.7],
  ] as const) {
    const material = new THREE.MeshStandardMaterial()
    material.name = 'FocoC'
    const unit = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), material)
    unit.name = name
    unit.position.set(x, 0.16, 2.15)
    model.add(unit)
  }
  const lights = createA3Lights(model)
  const beams = model.children.filter((child) => child.userData.role === 'vehicle-light')
  expect(beams.map((owner) => owner.userData.channel).sort()).toEqual([
    'HighBeam',
    'HighBeam',
    'LowBeam',
    'LowBeam',
  ])
  const spots = beams.map((owner) => owner.children[0] as THREE.SpotLight)
  model.updateWorldMatrix(true, true)
  for (const spot of spots) {
    expect(spot.castShadow).toBe(false)
    const from = spot.getWorldPosition(new THREE.Vector3())
    const to = spot.target.getWorldPosition(new THREE.Vector3())
    // At the nose, aimed forward (+Z here) and slightly down: no sideways or upward flood.
    expect(from.z).toBeGreaterThan(2.15)
    expect(to.z).toBeGreaterThan(from.z)
    expect(to.y).toBeLessThan(from.y)
    expect(Math.abs(to.x - from.x)).toBeLessThan(1e-6)
  }
  const low = spots.find((spot) => spot.parent!.userData.channel === 'LowBeam')!
  expect(low.angle).toBe(lightingDefaults.lowBeamOuterCone)
  expect(low.distance).toBe(lightingDefaults.lowBeamRange)
  // Switched by the car's own controller through the authored-light path, with the cut-off mask.
  const authored = new AuthoredVehicleLights(model, lights.controller)
  expect(low.map).toBeTruthy()
  lights.toggleHeadlights()
  authored.apply({ powered: true, braking: false, reversing: false }, 0)
  expect(low.intensity).toBeCloseTo(
    lightingDefaults.lowBeamIntensity * lightingDefaults.headlightIntensityScale,
  )
  authored.apply({ powered: false, braking: false, reversing: false }, 0)
  expect(low.intensity).toBe(0)
  authored.dispose()
})
