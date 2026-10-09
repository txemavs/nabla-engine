import fs from 'node:fs/promises'
import { expect, it, vi } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, Vector3 } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RetractableMount } from '../../src/render/vehicle-presentation/retractable.js'
import { CarLights } from '../../src/render/entity/car-lights.js'
import { CarMirrors } from '../../src/render/entity/car-mirrors.js'
import { driverHeadPose } from '../../src/render/entity/driving-camera.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { createA3Mounts } from '../../src/catalog/presentation/a3-mounts.js'
import {
  stockVehiclePresentation,
  s3Presentation,
} from '../../src/catalog/presentation/road-vehicles.js'
import { createEntity } from '../../src/entity/schema.js'
import { parseScene } from '../../src/scene/document.js'
import { hasLocalPreset } from '../local-presets.js'

it('moves any support relative to its authored pose and reverses continuously between frames', () => {
  const root = new Group()
  root.position.set(2, 3, 4)
  const mount = new RetractableMount(root, [0, -2, 0], 2000)
  expect(root.position.toArray()).toEqual([2, 1, 4])
  expect(root.visible).toBe(false)
  mount.toggle(0)
  mount.update(1000)
  expect(root.position.y).toBe(2)
  mount.toggle(1500)
  const before = root.position.y
  mount.update(1500)
  expect(root.position.y).toBe(before)
  mount.update(3500)
  expect(root.position.y).toBe(1)
  expect(root.visible).toBe(false)
  mount.reset()
  expect(mount.open).toBe(false)
})
it('controls unrelated lamp materials from bindings, without model names or vehicle state', () => {
  const brake = new MeshStandardMaterial(),
    signal = new MeshStandardMaterial()
  const lights = new CarLights([
    { material: brake, kind: 'brake', side: 0 },
    { material: signal, kind: 'signal', side: -1 },
  ])
  lights.toggle(-1)
  lights.update({ powered: true, braking: true, reversing: false }, 0)
  expect(brake.emissiveIntensity).toBe(3)
  expect(signal.emissiveIntensity).toBe(2)
  lights.update({ powered: true, braking: false, reversing: false }, 450)
  expect(signal.emissiveIntensity).toBe(0)
  lights.update({ powered: false, braking: true, reversing: false }, 900)
  expect(brake.emissiveIntensity).toBe(0)
  brake.dispose()
  signal.dispose()
})
it('camera and avatar accept the same driver-local mount under body rotation', () => {
  const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2)
  const head = driverHeadPose([1, 2, 3], q.toArray(), false, 0, 0, [0, 0.25, -0.5])
  expect(head.position.distanceTo(new Vector3(0.5, 2.25, 3))).toBeLessThan(1e-8)
})
it('switches driving lamps independently from braking and reverse lamps', () => {
  const front = new MeshStandardMaterial(),
    position = new MeshStandardMaterial(),
    brake = new MeshStandardMaterial(),
    reverse = new MeshStandardMaterial()
  const lights = new CarLights([
    { material: front, kind: 'front-signal', side: -1 },
    { material: position, kind: 'position', side: 0 },
    { material: brake, kind: 'brake', side: 0 },
    { material: reverse, kind: 'reverse', side: 0 },
  ])
  const state = { powered: true, braking: true, reversing: true }
  lights.update(state, 0)
  expect(front.emissiveIntensity).toBe(0)
  expect(position.emissiveIntensity).toBe(0)
  // H: position, then dipped (the same lamps stay lit), then off.
  expect(lights.toggleHeadlights()).toBe(true)
  lights.update(state, 0)
  expect(front.emissiveIntensity).toBe(0.65)
  expect(position.emissiveIntensity).toBe(0.65)
  expect(lights.toggleHeadlights()).toBe(true)
  lights.update(state, 0)
  expect(position.emissiveIntensity).toBe(0.65)
  expect(lights.toggleHeadlights()).toBe(false)
  lights.update(state, 0)
  expect(position.emissiveIntensity).toBe(0)
  expect(brake.emissiveIntensity).toBe(3)
  expect(reverse.emissiveIntensity).toBe(2)
  for (const material of [front, position, brake, reverse]) material.dispose()
})
it.skipIf(!['jeep', 'police'].every(hasLocalPreset))(
  'resolves explicit IDs independent of filenames, requires IDs and preserves authored properties',
  () => {
    for (const catalogId of ['car', 'jeep', 'police'] as const) {
      const entity = presetVehicle(catalogId, 'car')
      entity.vehicle!.mirrorTilt = 5
      entity.vehicle!.headOffset = [0.1, 0.2, -0.4]
      delete entity.visual!.presentation
      expect(stockVehiclePresentation(entity)).toBeUndefined()
      const parsed = parseScene({
        version: 1,
        name: 'Current',
        entities: [entity, createEntity('spawn', 'spawn')],
      }).entities[0]
      expect(parsed.vehicle!.mirrorTilt).toBe(5)
      expect(parsed.vehicle!.headOffset).toEqual([0.1, 0.2, -0.4])
    }
    const car = presetVehicle('car', 'car')
    car.visual!.body.url = '/world/renamed.glb'
    expect(stockVehiclePresentation(car)).toBe(s3Presentation)
    car.visual!.presentation = 'custom.other'
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(stockVehiclePresentation(car)).toBeUndefined()
    expect(warning).toHaveBeenCalledWith('Unknown vehicle presentation: custom.other')
    warning.mockRestore()
  },
)
it('detaches owned mirror targets once and retains shared source geometry', () => {
  const parent = new Group()
  const geometry = new PlaneGeometry(1, 0.5)
  const original = new Mesh(geometry, new MeshStandardMaterial())
  original.position.set(1, 2, 3)
  parent.add(original)
  const sharedDisposed = vi.fn()
  geometry.addEventListener('dispose', sharedDisposed)
  const mirrors = new CarMirrors([original])
  expect(parent.children).toHaveLength(2)
  const mirror = parent.children[1] as Mesh
  expect(mirror.position.distanceTo(new Vector3(1, 2, 3.003))).toBeLessThan(1e-6)
  const ownedDisposed = vi.fn()
  mirror.geometry.addEventListener('dispose', ownedDisposed)
  mirrors.setTilt(4)
  mirrors.dispose()
  mirrors.dispose()
  expect(parent.children).toEqual([original])
  expect(ownedDisposed).toHaveBeenCalledTimes(1)
  expect(sharedDisposed).not.toHaveBeenCalled()
  geometry.dispose()
  original.material.dispose()
})
it('reports a missing optional stock mount and leaves the asset intact', () => {
  const model = new Group()
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  expect(createA3Mounts(model)).toBeUndefined()
  expect(model.children).toHaveLength(0)
  expect(warning).toHaveBeenCalledWith('S3 instruments omitted: missing Interior mount')
  warning.mockRestore()
})

it('raises the S3 cluster 10 mm and keeps the dials inside the binnacle', async () => {
  const car = presetVehicle('car', 's3')
  expect(car.vehicle?.clusterOffset).toEqual([0, 0.01, 0])
  ;(globalThis as { self?: unknown }).self ??= globalThis
  const bytes = await fs.readFile('assets/library/cars/a3/a3.cabrio.glb')
  const load = async () => {
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    )
    const chassis = new Group()
    const model = gltf.scene
    model.position.fromArray(car.visual!.body.transform.position)
    model.quaternion.fromArray(car.visual!.body.transform.rotation)
    chassis.add(model)
    return model
  }
  const plain = createA3Mounts(await load())!
  const raisedModel = await load()
  const raised = createA3Mounts(raisedModel, car.vehicle!.clusterOffset)!
  const [dx, dy, dz] = raised.cluster.position.map((n, i) => n - plain.cluster.position[i]!)
  // Chassis up, through the body's yaw, lands on the interior's up.
  expect(dy).toBeCloseTo(0.01, 3)
  expect(Math.hypot(dx, dz)).toBeLessThan(0.001)
  const halfH = 160 * raised.cluster.scale
  const halfW = 320 * raised.cluster.scale
  const [cx, cy] = raised.cluster.position
  const interior = raisedModel.getObjectByName('Interior')!
  const box = { xmin: Infinity, xmax: -Infinity, ymin: Infinity, ymax: -Infinity }
  const point = new Vector3()
  interior.updateWorldMatrix(true, true)
  interior.traverse((node) => {
    if (!(node instanceof Mesh) || !(node.material instanceof MeshStandardMaterial)) return
    if (node.material.name !== 'Llanta 8') return
    const position = node.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(node.matrixWorld)
      point.applyMatrix4(interior.matrixWorld.clone().invert())
      box.xmin = Math.min(box.xmin, point.x)
      box.xmax = Math.max(box.xmax, point.x)
      box.ymin = Math.min(box.ymin, point.y)
      box.ymax = Math.max(box.ymax, point.y)
    }
  })
  expect(box.ymax).toBeGreaterThan(box.ymin)
  // The dials stay inside the binnacle ring: not out the top, and not past either side.
  expect(cy + halfH).toBeLessThanOrEqual(box.ymax + 0.001)
  expect(cx - halfW).toBeGreaterThanOrEqual(box.xmin - 0.001)
  expect(cx + halfW).toBeLessThanOrEqual(box.xmax + 0.001)
  plain.dispose()
  raised.dispose()
})
