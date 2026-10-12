import { expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { WreckDebris } from '../../src/render/entity/wreck-debris.js'

it('detaches visible parts radially, chars private materials and restores sources on reset', () => {
  const space = new Group(),
    vehicle = new Group()
  space.position.set(-100, 0, 20)
  space.add(vehicle)
  vehicle.position.set(110, 3, -15)
  const material = new MeshStandardMaterial({ color: '#dd3322' })
  for (const x of [-1, 1]) {
    const wheel = new Mesh(new BoxGeometry(0.4, 0.4, 0.4), material)
    wheel.position.x = x
    vehicle.add(wheel)
  }
  const debris = new WreckDebris(space)
  debris.explode(vehicle, 'bike')
  expect(debris.pieces).toHaveLength(2)
  expect(vehicle.children.every((p) => !p.visible)).toBe(true)
  expect(debris.pieces[0].velocity.x).toBeLessThan(0)
  expect(debris.pieces[1].velocity.x).toBeGreaterThan(0)
  expect(debris.pieces[0].pivot.position.x).toBeCloseTo(109)
  let excluded: string | undefined
  for (let i = 0; i < 30; i++)
    debris.update(0.1, (from, dir, length, id) => {
      excluded = id
      return null
    })
  expect(excluded).toBe('bike')
  expect(debris.pieces[0].materials[0].material.color.getHexString()).toBe('171717')
  expect(material.color.getHexString()).toBe('dd3322')
  debris.clear()
  expect(vehicle.children.every((p) => p.visible)).toBe(true)
  expect(debris.pieces).toHaveLength(0)
  debris.dispose()
})
