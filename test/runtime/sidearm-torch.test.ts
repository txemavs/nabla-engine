import { expect, it } from 'vitest'
import { Group, Vector3 } from 'three'
import { Sidearm } from '../../src/runtime/sidearm.js'

it('keeps the torch origin and direction attached while the world weapon turns', () => {
  const weapon = new Group(),
    socket = new Group()
  socket.name = 'TorchSocket'
  socket.position.set(0.01, -0.04, -0.12)
  weapon.add(socket)
  const sidearm = { worldPresentation: weapon } as unknown as Sidearm
  for (const yaw of [0, 1.2, -2]) {
    weapon.position.set(10, 3, -7)
    weapon.rotation.set(0.7, yaw, 0.4)
    const ray = Sidearm.prototype.torchRay.call(sidearm, 0, false, 70)!
    expect(ray.origin.distanceTo(socket.getWorldPosition(new Vector3()))).toBeLessThan(1e-8)
    const expected = new Vector3(0, 0, -1).transformDirection(socket.matrixWorld)
    expect(ray.target.sub(ray.origin).normalize().dot(expected)).toBeCloseTo(1)
  }
})
