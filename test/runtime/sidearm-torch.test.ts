import { expect, it } from 'vitest'
import { Group, Vector3 } from 'three'
import { Sidearm } from '../../src/runtime/sidearm.js'

for (const tracked of [false, true])
  it.each(['TorchSocket', 'RedLaserSocket'] as const)(
    'keeps %s attached while the weapon turns',
    (socketName) => {
      const weapon = new Group(),
        socket = new Group()
      socket.name = socketName
      socket.position.set(0.01, -0.04, -0.12)
      weapon.add(socket)
      const sidearm = Object.assign(Object.create(Sidearm.prototype), {
        worldPresentation: tracked ? null : weapon,
        model: weapon,
        trackedGrip: tracked,
      }) as Sidearm
      for (const yaw of [0, 1.2, -2]) {
        weapon.position.set(10, 3, -7)
        weapon.rotation.set(0.7, yaw, 0.4)
        const ray = Sidearm.prototype.accessoryRay.call(sidearm, 0, false, 70, socketName)!
        expect(ray.origin.distanceTo(socket.getWorldPosition(new Vector3()))).toBeLessThan(1e-8)
        const expected = new Vector3(0, 0, -1).transformDirection(socket.matrixWorld)
        expect(ray.target.sub(ray.origin).normalize().dot(expected)).toBeCloseTo(1)
      }
    },
  )
