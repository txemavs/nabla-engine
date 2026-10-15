import { expect, it } from 'vitest'
import { XRScaledVehicles } from '../../src/runtime/xr-scaled-vehicles.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import * as THREE from 'three'

it('keeps real engine trajectories and speeds identical at 1:100, 1:8 and 1:1', async () => {
  const entity = presetVehicle('car', 'car', [0, 0.62, 0])
  const runs = await Promise.all(
    [0.01, 0.125, 1].map((scale) =>
      XRScaledVehicles.create([structuredClone(entity)], scale, {
        ignition: false,
        vehicleDamage: false,
      }),
    ),
  )
  for (const run of runs) run.updateSurfaces([])
  for (let i = 0; i < 600; i++)
    for (const run of runs) run.step(1 / 60, { throttle: 1, steering: 0, brake: 0 })
  const distance = runs[2].pose('car').position[2]
  expect(Math.abs(distance)).toBeGreaterThan(20)
  for (const run of runs) {
    expect(run.pose('car').position[2] / run.scale).toBeCloseTo(distance, 5)
    expect(run.simulation.player.speed).toBeCloseTo(runs[2].simulation.player.speed, 5)
  }
  for (const run of runs) run.dispose()
})

it('keeps the original truck hitch stable and transforms scanned furniture into native metres', async () => {
  const truck = presetVehicle('white-truck', 'truck', [0, 1.6, 0])
  const trailer = presetVehicle('white-trailer', 'trailer')
  const hitch = truck.vehicle!.hitch!,
    anchor = trailer.vehicle!.towAnchor!
  trailer.vehicle!.tow = { vehicleId: truck.id, hitch, anchor }
  trailer.transform.position = new THREE.Vector3(...truck.transform.position)
    .add(new THREE.Vector3(...hitch))
    .sub(new THREE.Vector3(...anchor))
    .toArray()
  const run = await XRScaledVehicles.create([truck, trailer], 0.01, {
    ignition: false,
    vehicleDamage: false,
  })
  run.updateSurfaces([])
  for (let i = 0; i < 600; i++)
    run.step(1 / 60, { throttle: 0.5, steering: i > 300 ? 0.15 : 0, brake: 0 })
  const a = run.simulation.entityTransform('truck'),
    b = run.simulation.entityTransform('trailer')
  const hp = new THREE.Vector3(...hitch)
    .applyQuaternion(new THREE.Quaternion(...a.rotation))
    .add(new THREE.Vector3(...a.position))
  const ap = new THREE.Vector3(...anchor)
    .applyQuaternion(new THREE.Quaternion(...b.rotation))
    .add(new THREE.Vector3(...b.position))
  expect(hp.distanceTo(ap)).toBeLessThan(0.15)
  expect(a.position.every(Number.isFinite)).toBe(true)
  expect(Math.abs(a.position[0])).toBeLessThan(300)
  run.moveAssembly('truck', new THREE.Vector3(0, 0.5, 0), new THREE.Quaternion())
  const table = new THREE.Mesh(new THREE.PlaneGeometry(10, 10))
  table.rotation.x = -Math.PI / 2
  table.position.y = 0.4
  table.updateMatrixWorld(true)
  run.updateSurfaces([table])
  for (let i = 0; i < 240; i++) run.step(1 / 60, { throttle: 0, steering: 0, brake: 1 })
  expect(run.pose('truck').position[1]).toBeGreaterThan(0.4)
  run.dispose()
})

it('brakes forward motion then reverses using the same signed input as PC', async () => {
  const car = presetVehicle('car', 'car', [0, 0.62, 0])
  const run = await XRScaledVehicles.create([car], 0.01, { ignition: false, vehicleDamage: false })
  run.updateSurfaces([])
  for (let i = 0; i < 180; i++) run.step(1 / 60, { throttle: 0.5, steering: 0, brake: 0 })
  const forward = run.pose('car').position[2]
  for (let i = 0; i < 900; i++) run.step(1 / 60, { throttle: -0.7, steering: 0, brake: 0 })
  expect(run.simulation.vehicleInfo('car').reversing).toBe(true)
  expect(run.pose('car').position[2]).toBeGreaterThan(forward)
  run.dispose()
})

it('keeps a repeatedly held/rotated assembly rigid and finite, then resumes driving', async () => {
  const car = presetVehicle('car', 'car', [0, 0.62, 0])
  const run = await XRScaledVehicles.create([car], 0.01, { ignition: false, vehicleDamage: false })
  run.updateSurfaces([])
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.23, 0.71, -0.12))
  const target = new THREE.Vector3(0.1, 0.4, -0.5)
  try {
    for (let i = 0; i < 2000; i++) {
      q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.001))
      run.moveAssembly('car', target, q)
      const pose = run.pose('car')
      expect(Math.hypot(...pose.rotation)).toBeCloseTo(1, 12)
      expect(new THREE.Vector3(...pose.position).distanceTo(target)).toBeLessThan(1e-8)
    }
    for (let i = 0; i < 240; i++) run.step(1 / 60, { throttle: 0.5, steering: 0, brake: 0 })
    expect(run.pose('car').position.every(Number.isFinite)).toBe(true)
    expect(run.simulation.vehicleInfo('car').rpm).toBeGreaterThan(0)
  } finally {
    run.dispose()
  }
})

it('keeps hitch offsets rigid through repeated hand rotations, including grabbing the trailer', async () => {
  const truck = presetVehicle('white-truck', 'truck', [0, 1.6, 0])
  const trailer = presetVehicle('white-trailer', 'trailer')
  const hitch = truck.vehicle!.hitch!,
    anchor = trailer.vehicle!.towAnchor!
  trailer.vehicle!.tow = { vehicleId: truck.id, hitch, anchor }
  trailer.transform.position = new THREE.Vector3(...truck.transform.position)
    .add(new THREE.Vector3(...hitch))
    .sub(new THREE.Vector3(...anchor))
    .toArray()
  const run = await XRScaledVehicles.create([truck, trailer], 0.01, {
    ignition: false,
    vehicleDamage: false,
  })
  try {
    for (let i = 0; i < 2000; i++) {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.2 * Math.sin(i * 0.01), i * 0.002, 0.1),
      )
      run.moveAssembly(i < 1000 ? 'truck' : 'trailer', new THREE.Vector3(0.1, 0.4, -0.5), q)
      const a = run.pose('truck'),
        b = run.pose('trailer')
      const hp = new THREE.Vector3(...hitch)
        .multiplyScalar(0.01)
        .applyQuaternion(new THREE.Quaternion(...a.rotation))
        .add(new THREE.Vector3(...a.position))
      const ap = new THREE.Vector3(...anchor)
        .multiplyScalar(0.01)
        .applyQuaternion(new THREE.Quaternion(...b.rotation))
        .add(new THREE.Vector3(...b.position))
      expect(hp.distanceTo(ap)).toBeLessThan(1e-8)
      expect(Math.hypot(...a.rotation)).toBeCloseTo(1, 12)
      expect(Math.hypot(...b.rotation)).toBeCloseTo(1, 12)
    }
  } finally {
    run.dispose()
  }
})

it('normalizes relocation before physics and resets interpolation without partially moving invalid assemblies', async () => {
  const run = await XRScaledVehicles.create([presetVehicle('car', 'car')], 0.01)
  try {
    run.simulation.relocateVehicles([
      { id: 'car', transform: { position: [1, 2, 3], rotation: [0, 0, 0, 1.000001] } },
    ])
    expect(run.simulation.entityTransform('car', true)).toEqual({
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1],
    })
    expect(() =>
      run.simulation.relocateVehicles([
        { id: 'car', transform: { position: [4, 5, 6], rotation: [0, 0, 0, 1] } },
        { id: 'bad', transform: { position: [NaN, 0, 0], rotation: [0, 0, 0, 1] } },
      ]),
    ).toThrow('Invalid vehicle relocation')
    expect(run.simulation.entityTransform('car').position).toEqual([1, 2, 3])
  } finally {
    run.dispose()
  }
})

it('converts room throw velocity to vehicle units without changing angular speed', async () => {
  const run = await XRScaledVehicles.create([presetVehicle('car', 'car')], 0.01, {
    ignition: false,
    vehicleDamage: false,
  })
  try {
    run.moveAssembly('car', new THREE.Vector3(0, 1, 0), new THREE.Quaternion())
    run.releaseAssembly('car', new THREE.Vector3(2, 1, 0), new THREE.Vector3(0, 3, 0))
    run.step(1 / 60, { throttle: 0, steering: 0, brake: 0 })
    expect(run.pose('car').position[0]).toBeGreaterThan(0.01)
    expect(run.pose('car').position[1]).toBeGreaterThan(1)
    expect(Math.abs(run.pose('car').rotation[1])).toBeGreaterThan(0.005)
  } finally {
    run.dispose()
  }
})

it('detaches a picked trailer and leaves its tractor in place', async () => {
  const truck = presetVehicle('white-truck', 'truck', [0, 1.6, 0])
  const trailer = presetVehicle('white-trailer', 'trailer')
  trailer.vehicle!.tow = {
    vehicleId: truck.id,
    hitch: truck.vehicle!.hitch!,
    anchor: trailer.vehicle!.towAnchor!,
  }
  const run = await XRScaledVehicles.create([truck, trailer], 0.01, {
    ignition: false,
    vehicleDamage: false,
  })
  try {
    expect(run.simulation.vehicleList().find((v) => v.id === 'trailer')?.towedBy).toBe('truck')
    const before = run.pose('truck')
    run.beginGrab('trailer')
    expect(run.simulation.vehicleList().find((v) => v.id === 'trailer')?.towedBy).toBeFalsy()
    run.moveAssembly('trailer', new THREE.Vector3(1, 2, 3), new THREE.Quaternion())
    expect(run.pose('trailer').position).toEqual([1, 2, 3])
    expect(run.pose('truck')).toEqual(before)
    run.releaseAssembly('trailer', new THREE.Vector3(1, 0, 0), new THREE.Vector3())
    expect(run.pose('truck')).toEqual(before)
  } finally {
    run.dispose()
  }
})
