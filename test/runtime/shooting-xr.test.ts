import { expect, it, vi } from 'vitest'
import { Group, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three'
import { fireSidearm } from '../../src/runtime/shooting.js'

it('keeps impact rays on the barrel with an asymmetric XR projection and floating origin', () => {
  const camera = new PerspectiveCamera(70, 1.2, 0.1, 1000)
  camera.setViewOffset(2000, 1000, 180, 0, 1000, 1000)
  const root = new Group()
  root.position.set(-1000, 0, 500)
  const origin = new Vector3(1002, 1.5, -501),
    direction = new Vector3(0.2, -0.1, -1).normalize()
  const target = origin.clone().addScaledVector(direction, 10)
  const sidearm = {
    visible: true,
    range: 150,
    impulse: 12,
    simulated: false,
    temperature: { spreadRadians: 0 },
    accessoryRay: () => ({
      origin: origin.clone().add(root.position),
      target: target.clone().add(root.position),
    }),
    pull: () => ({ fired: true }),
    impact: vi.fn(),
  }
  let marked: Raycaster | undefined
  const gallery = {
    shoot: vi.fn((_sim, _view, shotCamera) => {
      marked = new Raycaster()
      marked.setFromCamera(new Vector2(), shotCamera)
      return false
    }),
  }
  const sim = { shoot: vi.fn(() => ({ point: target.toArray(), normal: [0, 0, 1] })) }
  fireSidearm(sidearm as any, gallery as any, sim as any, { root } as any, camera, 100, false)
  expect(marked!.ray.origin.distanceTo(origin)).toBeLessThan(1e-8)
  expect(marked!.ray.direction.dot(direction)).toBeCloseTo(1, 10)
  expect(marked!.ray.at(10, new Vector3()).distanceTo(target)).toBeLessThan(1e-8)
})
