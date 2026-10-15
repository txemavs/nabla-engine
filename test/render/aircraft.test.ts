import * as T from 'three'
import { expect, it } from 'vitest'
import { AircraftRig } from '../../src/render/entity/aircraft.js'
it('sweeps mirrored wings, deflects stabilators and brightens both exhausts from engine telemetry', () => {
  const root = new T.Group()
  for (const [name, x] of [
    ['left', -2],
    ['right', 2],
    ['tail-left', -1],
    ['tail-right', 1],
  ] as const) {
    const part = new T.Group()
    part.name = name
    part.position.set(x, 0, 0)
    root.add(part)
  }
  const rig = new AircraftRig(root, {
    controls: [
      { node: 'left', kind: 'sweep', side: -1, pivot: [-2, 0, 0] },
      { node: 'right', kind: 'sweep', side: 1, pivot: [2, 0, 0] },
      { node: 'tail-left', kind: 'stabilator', side: -1, pivot: [-1, 0, 0] },
      { node: 'tail-right', kind: 'stabilator', side: 1, pivot: [1, 0, 0] },
    ],
    exhausts: [
      [-1, 0, 2],
      [1, 0, 2],
    ],
  })
  expect(root.getObjectByName('left')!.getWorldPosition(new T.Vector3()).x).toBe(-2)
  const pose = {
    engine: 1,
    flightSpeedMode: 'fast' as const,
    flightControls: { pitch: 0.5, roll: 0.3, yaw: 0 },
  }
  for (let i = 0; i < 120; i++) rig.update(pose, 1 / 60)
  const a = root.getObjectByName('Aircraft_sweep_-1')!,
    b = root.getObjectByName('Aircraft_sweep_1')!
  expect(a.rotation.y).toBeCloseTo((48 * Math.PI) / 180, 3)
  expect(a.rotation.y).toBeCloseTo(-b.rotation.y, 6)
  expect(root.getObjectByName('Aircraft_stabilator_-1')!.rotation.x).not.toBe(
    root.getObjectByName('Aircraft_stabilator_1')!.rotation.x,
  )
  const lights = root.children.filter((n) => n.name === 'Aircraft_Exhaust') as T.Mesh<
    T.CircleGeometry,
    T.MeshStandardMaterial
  >[]
  expect(lights).toHaveLength(2)
  expect(lights.every((n) => n.material.emissiveIntensity === 5)).toBe(true)
  for (let i = 0; i < 120; i++)
    rig.update(
      {
        ...pose,
        engine: 0,
        flightSpeedMode: 'slow',
        flightControls: { pitch: 0, roll: 0, yaw: 0 },
      },
      1 / 60,
    )
  expect(a.rotation.y).toBeCloseTo(0, 3)
  expect(lights.every((n) => n.material.emissiveIntensity === 0)).toBe(true)
})
