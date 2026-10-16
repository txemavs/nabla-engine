import { expect, it } from 'vitest'
import * as T from 'three'
import { XRScaledVehicles } from '../../src/runtime/xr-scaled-vehicles.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { palletEntity } from '../../src/catalog/props/pallet.js'
import { ARRCControls } from '../../src/runtime/xr-rc-controls.js'

it.each([false, true])(
  'raises a %s boxed pallet with native fork contacts at AR scale',
  async (boxed) => {
    const run = await XRScaledVehicles.create([presetVehicle('forklift-rc', 'toro')], 0.01, {
      ignition: false,
      vehicleDamage: false,
    })
    try {
      run.updateSurfaces([])
      const pallet = palletEntity('load', boxed, [0, 0.12, -1.85])
      run.simulation.addPlaced([pallet])
      run.entities.push(pallet)
      for (let i = 0; i < 120; i++) run.step(1 / 60, { throttle: 0, steering: 0, brake: 0 })
      const before = run.simulation.entityTransform('load').position[1]
      for (let i = 0; i < 120; i++)
        run.step(1 / 60, { throttle: 0, steering: 0, brake: 0, forklift: [1, 0, 0] })
      expect(run.simulation.forkliftPose('toro')!.lift).toBeGreaterThan(1)
      expect(run.simulation.entityTransform('load').position[1]).toBeGreaterThan(before + 0.5)
      run.moveAssembly('load', new T.Vector3(0.1, 0.2, -0.1), new T.Quaternion())
      expect(run.pose('load').position).toEqual([0.1, 0.2, -0.1])
      const truck = run.pose('toro')
      run.releaseAssembly('load', new T.Vector3(0.2, 0, 0), new T.Vector3(0, 1, 0))
      expect(run.pose('toro')).toEqual(truck)
      run.simulation.removePlaced(['load'])
      expect(run.simulation.entityCollisionParts('load')).toEqual([])
    } finally {
      run.dispose()
    }
  },
)

it('defaults to real controls and routes each grabbed lever to the shared hydraulic axes', () => {
  const controls = new ARRCControls(new T.Scene())
  expect(controls.enabled).toBe(true)
  controls.kind = 'forklift'
  controls.place(new T.PerspectiveCamera())
  // The wheel faces the driver; the independent hydraulic console keeps its authored pose.
  expect(new T.Vector3(0, 0, 1).applyQuaternion(controls.root.quaternion).z).toBeCloseTo(-1)
  expect(new T.Vector3(0, 0, 1).applyQuaternion(controls.equipment.quaternion).z).toBeCloseTo(1)
  const hand = (i: number) => {
    const lever = new T.Group()
    lever.name = 'forklift-lever-' + i
    lever.position.set(0.4 + i * 0.1, 0, 0)
    controls.equipment.add(lever)
    const grip = new T.Group()
    grip.position.copy(lever.getWorldPosition(new T.Vector3())).y += 0.19
    const source = {
      handedness: 'right',
      gamepad: { buttons: [{ value: 0 }, { pressed: true, value: 1 }] },
    } as unknown as XRInputSource
    return { grip, source }
  }
  const h = hand(0)
  controls.update([h], 1 / 60)
  h.grip.position.z += 0.08
  const value = controls.update([h], 1 / 60)
  expect(value.forklift).toEqual([1, 0, 0])
  expect(value.throttle).toBe(0)
  expect(controls.owns(h.grip, h.source)).toBe(true)
  expect(controls.update([], 1 / 60).forklift).toEqual([0, 0, 0])
  controls.dispose()
})
