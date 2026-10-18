import * as THREE from 'three'
import { expect, it } from 'vitest'
import { createA3Lights } from '../../src/catalog/presentation/a3-lamps.js'
import { BreakableGlass } from '../../src/render/entity/breakable-glass.js'

it('removes the struck pane only, does not change a shared asset, and restores on reset', () => {
  const glass = new BreakableGlass()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-2, -1, 0, 0, -1, 0, 0, 1, 0, -2, 1, 0, 1, -1, 0, 3, -1, 0, 3, 1, 0, 1, 1, 0],
      3,
    ),
  )
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  material.name = 'Parabrisas'
  const first = new THREE.Mesh(geometry, material)
  const shared = new THREE.Mesh(geometry, material)
  expect(
    glass.hit([first], new THREE.Vector3(-1, 0, 2), new THREE.Vector3(0, 0, -1), 5),
  ).not.toBeNull()
  expect(first.geometry.index!.count).toBe(6)
  expect(shared.geometry.index!.count).toBe(12)
  expect(glass.hit([first], new THREE.Vector3(-1, 0, 2), new THREE.Vector3(0, 0, -1), 5)).toBeNull()
  expect(
    glass.hit([first], new THREE.Vector3(2, 0, 2), new THREE.Vector3(0, 0, -1), 5),
  ).not.toBeNull()
  expect(first.geometry.index!.count).toBe(0)
  glass.clear()
  expect(first.geometry).toBe(geometry)
  expect(geometry.index!.count).toBe(12)
  geometry.dispose()
  material.dispose()
})

it('a body panel before glass prevents the glass breaking', () => {
  const glass = new BreakableGlass()
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial())
  pane.material.name = 'glass'
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial())
  panel.position.z = 1
  expect(
    glass.hit([pane, panel], new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1), 5),
  ).toBeNull()
  expect(pane.geometry.index!.count).toBe(6)
  for (const mesh of [pane, panel]) {
    mesh.geometry.dispose()
    mesh.material.dispose()
  }
})

it('breaks only the S3 outer cover and preserves LEDs, optics and the other headlamp', () => {
  const model = new THREE.Group()
  const geometry = new THREE.PlaneGeometry(0.5, 0.5)
  const covers: THREE.Mesh[] = []
  const interiors: THREE.Mesh[] = []
  for (const [name, x] of [
    ['Foco Derecho', -1],
    ['Foco Izquierdo', 1],
  ] as const) {
    const unit = new THREE.Group()
    unit.name = name
    unit.position.x = x
    model.add(unit)
    const cover = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ name: 'Foco 5', transparent: true, opacity: 0.7 }),
    )
    unit.add(cover)
    covers.push(cover)
    for (const name of ['LED BLANCO NARANJA', 'CORTA', 'Larga']) {
      const inner = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ name }))
      inner.position.z = -0.1
      unit.add(inner)
      interiors.push(inner)
    }
  }
  const lights = createA3Lights(model)
  lights.controller.mode = 'low'
  lights.controller.highBeam = true
  const glass = new BreakableGlass()
  expect(
    glass.hit([model], new THREE.Vector3(-1, 0, 2), new THREE.Vector3(0, 0, -1), 5),
  ).not.toBeNull()
  expect(covers[0].geometry.index!.count).toBe(0)
  expect(covers[1].geometry.index!.count).toBe(6)
  lights.update({ powered: true, braking: false, reversing: false }, 0)
  for (const inner of interiors) {
    expect(inner.geometry.index!.count).toBe(6)
    expect((inner.material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0)
  }
  expect(glass.hit([model], new THREE.Vector3(-1, 0, 2), new THREE.Vector3(0, 0, -1), 5)).toBeNull()
  glass.clear()
  expect(covers[0].geometry).toBe(geometry)
})
