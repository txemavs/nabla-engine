/**
 * The measured exhaust mounts moved from code to the vehicle JSON (`vehicle.exhaust`). These are
 * the positions the code produced before the move (chassis space, metres, model at rest); the JSON
 * must put every outlet at the same place.
 */
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { expect, it } from 'vitest'
import { vehicleExhaustField } from '../../src/entity/vehicle/field.js'
import { exhaustOutlets } from '../../src/render/vehicle-presentation/exhaust.js'

const exhaust = (path: string) =>
  vehicleExhaustField.parse(
    JSON.parse(readFileSync(`assets/library/${path}.json`, 'utf8')).vehicle.exhaust,
  )

/** World positions of the outlets with the data's fixed offset, as the view applies it. */
function placed(model: THREE.Object3D, data: ReturnType<typeof exhaust>): number[][] {
  const outlets = exhaustOutlets(model, data)
  const [x, y, z] = data.offset ?? [0, 0, 0]
  model.updateWorldMatrix(true, true)
  return outlets.map((outlet) => {
    outlet.position.add(new THREE.Vector3(x, y, z))
    outlet.updateWorldMatrix(true, false)
    return outlet.getWorldPosition(new THREE.Vector3()).toArray()
  })
}

const close = (actual: number[][], expected: number[][]) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((point, i) => point.forEach((v, k) => expect(v).toBeCloseTo(expected[i][k], 6)))
}

it('keeps the S3 two outlets where the code put them (sockets + the old S3 nudge)', () => {
  // Before: sockets [0.535, 0.27, -2.16] and [0.645, 0.27, -2.16], nudged [0.088, -0.015, -0.025].
  close(placed(new THREE.Group(), exhaust('cars/a3/s3')), [
    [0.623, 0.255, -2.185],
    [0.733, 0.255, -2.185],
  ])
})

it('keeps the truck outlet (socket, no fixed nudge; the live panel offset is separate)', () => {
  close(placed(new THREE.Group(), exhaust('cars/white-truck/white-truck')), [[-1.08, 1.86, -0.72]])
})

it('keeps the VFR outlet on its anchored node with the old motorcycle nudge', () => {
  for (const path of [
    'motorcycles/vfr800fi-1999/vfr800',
    'motorcycles/vfr800fi-1999/vfr800-quest',
  ]) {
    const model = new THREE.Group()
    const node = new THREE.Object3D()
    node.position.set(0.21, 0.4, 0.95)
    node.userData.nabla = { anchor: 'exhaust' }
    model.add(node)
    // Before: the anchored socket nudged by [0, -0.05, -0.05].
    close(placed(model, exhaust(path)), [[0.21, 0.35, 0.9]])
  }
})
