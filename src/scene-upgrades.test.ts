import { expect, it } from 'vitest'
import { upgradeReferenceScene } from '../playground/scene-upgrades.js'
import { createSampleScene } from './sample.js'
import { createA3 } from './presets.js'
import { rotationDegrees } from './scene.js'
import { createGallery } from '../playground/gallery.js'

it('repairs legacy steering mounts while retaining custom placements and remaining idempotent', () => {
  const doc = createSampleScene(),
    car = doc.entities.find((e) => e.id === 'car-a')!
  car.visual!.steering!.transform = {
    position: [-0.356, 0.274, -0.311],
    rotation: rotationDegrees(25, 180, 0),
  }
  expect(
    upgradeReferenceScene(doc).entities.find((e) => e.id === car.id)!.visual!.steering!.transform,
  ).toEqual(createA3('a').visual!.steering!.transform)
  car.visual!.steering!.transform.position[0] = -0.4
  expect(
    upgradeReferenceScene(doc).entities.find((e) => e.id === car.id)!.visual!.steering!.transform,
  ).toEqual(car.visual!.steering!.transform)
  expect(upgradeReferenceScene(upgradeReferenceScene(doc))).toEqual(upgradeReferenceScene(doc))
})
it('keeps gallery targets behind the near trees and upgrades the original coplanar layout', () => {
  const doc = createSampleScene(),
    gallery = createGallery('g')
  doc.entities.push(...gallery)
  const target = doc.entities.find((e) => e.id === 'g-target-0')!
  target.transform.position[2] = -7
  const upgraded = upgradeReferenceScene(doc)
  expect(upgraded.entities.find((e) => e.id === target.id)!.transform.position[2]).toBe(-11)
  for (const e of gallery.filter((e) => e.sprite?.target)) {
    const z = e.id === target.id ? -11 : e.transform.position[2]
    expect(z).toBeLessThan(-7)
    expect(z).toBeGreaterThan(-20)
  }
})

it('raises only the recognized old A3 suspension and does not accumulate lifts', () => {
  const doc = createSampleScene()
  const car = doc.entities.find((e) => e.visual?.body.url === '/world/car.audi.a3.cabrio.glb')!
  car.vehicle!.suspensionRest = 0.16
  for (const hub of car.vehicle!.hubs) hub[1] += 0.05
  const upgraded = upgradeReferenceScene(doc)
  expect(upgraded.entities.find((e) => e.id === car.id)!.vehicle!.suspensionRest).toBe(0.21)
  expect(upgradeReferenceScene(upgraded)).toEqual(upgraded)
  car.vehicle!.hubs[0][1] += 0.02
  expect(upgradeReferenceScene(doc).entities.find((e) => e.id === car.id)!.vehicle).toEqual(
    car.vehicle,
  )
})
