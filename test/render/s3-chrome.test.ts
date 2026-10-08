/**
 * The S3 / A3 chrome trim stays metallic and reflective: the window surrounds, beltline, boot
 * trim, grille and badge take the shared neutral reflection environment; the paint, the mirror
 * housings and the wheels keep their own look.
 */
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { s3ChromeMaterial, s3Presentation } from '../../src/catalog/presentation/road-vehicles.js'
import {
  applyReflectionEnvironment,
  carReflectionOptions,
  reflectionEnvironmentTexture,
} from '../../src/render/vehicle-presentation/reflection-environment.js'

type Gltf = {
  materials: { name: string; pbrMetallicRoughness?: { metallicFactor?: number } }[]
  meshes: { primitives: { material?: number }[] }[]
  nodes: { name?: string; mesh?: number }[]
}

/** The JSON chunk of a GLB (no textures or WebGL needed). */
function gltf(path: string): Gltf {
  const file = readFileSync(path)
  const length = file.readUInt32LE(12)
  return JSON.parse(file.subarray(20, 20 + length).toString('utf8')) as Gltf
}

const standard = (name: string, metalness: number, roughness = 0.22) =>
  new THREE.MeshStandardMaterial({ name, metalness, roughness })

function model(materials: THREE.MeshStandardMaterial[]) {
  const root = new THREE.Group()
  for (const material of materials)
    root.add(new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), material))
  return root
}

describe('S3 chrome', () => {
  it('the body GLB still has the chrome trim on the doors, boot, grille and badge', () => {
    const json = gltf('assets/library/cars/a3/a3.cabrio.glb')
    const chromeOn = (node: string) =>
      json.nodes
        .filter((n) => n.name === node && n.mesh !== undefined)
        .flatMap((n) =>
          json.meshes[n.mesh!].primitives.map((p) => json.materials[p.material!].name),
        )
        .filter((name) => s3ChromeMaterial.test(name))
    for (const node of ['Puerta Derecha', 'Puerta Izquierda', 'Maletero'])
      expect(chromeOn(node)).toContain('Cromo 3')
    expect(chromeOn('Nabla integrated grille')).toEqual(['Cromo 3.001'])
    expect(chromeOn('Nabla boot badge')).toEqual(['Nabla silver chrome'])
  })

  it('the trim turns into reflective chrome; paint, mirror housings and wheels keep their look', () => {
    const trim = [
      standard('Cromo 3', 1),
      standard('Cromo 3.001', 1),
      standard('Cromo 1', 0, 0.5),
      standard('Nabla silver chrome', 0.85, 0.2),
    ]
    const paint = standard('PinturaPuerta', 0.72, 0.32)
    const housing = standard('Llanta 2', 1)
    const body = model([...trim, paint, housing])
    s3Presentation.preparePart!(body, 'body')
    const wheelChrome = standard('Nabla polished chrome', 1, 0.18)
    const wheel = model([wheelChrome])
    s3Presentation.preparePart!(wheel, 'wheel')

    const reflections = applyReflectionEnvironment(body, carReflectionOptions)
    const wheelReflections = applyReflectionEnvironment(wheel, carReflectionOptions)
    expect(new Set(reflections.materials)).toEqual(new Set(trim))
    for (const material of trim) {
      expect(material.metalness).toBe(1)
      expect(material.roughness).toBeLessThanOrEqual(0.25)
      expect(material.envMap).toBe(reflectionEnvironmentTexture())
      expect(material.envMapIntensity).toBeCloseTo(carReflectionOptions.intensity)
    }
    // Untouched: the paint, the satin mirror housings (also the live mirror lenses), the wheels.
    expect(paint.envMap).toBeNull()
    expect(housing.envMap).toBeNull()
    expect(housing.metalness).toBe(0.35)
    expect(wheelReflections.materials).toEqual([])
    expect(wheelChrome.envMap).toBeNull()
    // Night dims the chrome like the motorcycle's.
    reflections.setLevel(0.15)
    expect(trim[0].envMapIntensity).toBeCloseTo(carReflectionOptions.intensity * 0.15)
  })
})
