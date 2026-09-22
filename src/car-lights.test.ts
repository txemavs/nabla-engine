import { expect, it } from 'vitest'
import * as THREE from 'three'
import { CarLights } from '../playground/car-lights.js'

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
  const lights = new CarLights(model)
  expect(position.emissiveIntensity).toBe(0)
  lights.update({ powered: true, braking: true, reversing: false }, 0)
  expect(position.emissiveIntensity).toBeGreaterThan(0)
  expect(brake.emissiveIntensity).toBeGreaterThan(0)
  expect(reverse.emissiveIntensity).toBe(0)
  lights.update({ powered: true, braking: false, reversing: true }, 0)
  expect(brake.emissiveIntensity).toBe(0)
  expect(reverse.emissiveIntensity).toBeGreaterThan(0)
  lights.update({ powered: false, braking: true, reversing: true }, 0)
  for (const material of [position, brake, reverse]) expect(material.emissiveIntensity).toBe(0)
})
