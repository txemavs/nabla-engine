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
    wheel.name = x < 0 ? 'Wheel_Left' : 'Wheel_Right'
    wheel.position.x = x
    vehicle.add(wheel)
  }
  const chassis = new Mesh(new BoxGeometry(), material)
  chassis.name = 'Chassis'
  vehicle.add(chassis)
  const debris = new WreckDebris(space)
  debris.explode(vehicle, 'bike')
  expect(debris.pieces).toHaveLength(2)
  expect(vehicle.children.filter((p) => p !== chassis).every((p) => !p.visible)).toBe(true)
  expect(chassis.visible).toBe(true)
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

it('detaches a complete Spanish-named door without splitting its nested articulated parts', () => {
  const space = new Group(),
    car = new Group(),
    door = new Group(),
    nested = new Group()
  door.name = 'Puerta Derecha'
  nested.name = 'Door_Handle'
  nested.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial()))
  door.add(nested)
  car.add(door)
  space.add(car)
  const debris = new WreckDebris(space)
  debris.prepare(car)
  debris.explode(car, 'car')
  expect(debris.pieces).toHaveLength(1)
  expect(debris.pieces[0].pivot.getObjectByName('Door_Handle')).toBeDefined()
  expect(door.visible).toBe(false)
  debris.dispose()
})

it('supports a large rotating component above the floor instead of burying its lower half', () => {
  const space = new Group(),
    car = new Group(),
    part = new Mesh(new BoxGeometry(1, 2, 0.3), new MeshStandardMaterial())
  part.name = 'Puerta Derecha'
  car.add(part)
  car.position.y = 3
  space.add(car)
  const debris = new WreckDebris(space)
  debris.explode(car, 'car')
  for (let i = 0; i < 240; i++) {
    debris.update(1 / 60, (from, dir, length) => {
      if (dir.y >= 0) return null
      const t = -from.y / dir.y
      return t >= 0 && t <= length
        ? { point: from.clone().addScaledVector(dir, t), normal: new Vector3(0, 1, 0) }
        : null
    })
    const piece = debris.pieces[0]
    const n = new Vector3(0, 1, 0).applyQuaternion(piece.pivot.quaternion.clone().invert())
    const extent =
      Math.abs(n.x) * piece.halfSize.x +
      Math.abs(n.y) * piece.halfSize.y +
      Math.abs(n.z) * piece.halfSize.z
    expect(piece.pivot.position.y - extent).toBeGreaterThanOrEqual(-0.001)
  }
  debris.dispose()
})
