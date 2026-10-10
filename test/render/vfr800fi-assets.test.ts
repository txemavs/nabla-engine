import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Box3, Vector3, type BufferAttribute, type Mesh } from 'three'
import { loadTexturedGlb } from '../helpers/load-textured-glb.js'
import { expect, it } from 'vitest'
import {
  bindMotorcycleRig,
  motorcycleRigFromJson,
  motorcycleRigFromModel,
} from '../../src/render/vehicle-presentation/motorcycle-rig.js'

const directory = 'assets/library/motorcycles/vfr800fi-1999'
const readJson = (name: string) => JSON.parse(readFileSync(`${directory}/${name}`, 'utf8'))
const bytes = readFileSync(`${directory}/vfr800fi-1999.glb`)

it('ships the approved complete motorcycle asset with matching rig and phase-1 runtime status', () => {
  const manifest = readJson('asset.json')
  const rig = readJson(manifest.rigFile)
  const glb = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString())
  expect(bytes.readUInt32LE(8)).toBe(bytes.length)
  expect(manifest.bytes).toBe(bytes.length)
  const triangles = glb.meshes.reduce(
    (sum: number, mesh: { primitives: { indices: number }[] }) =>
      sum + mesh.primitives.reduce((n, p) => n + glb.accessors[p.indices].count / 3, 0),
    0,
  )
  expect(triangles).toBe(manifest.triangles)
  expect(glb.images).toHaveLength(1)
  const image = glb.bufferViews[glb.images[0].bufferView]
  const png = bytes.subarray(28 + bytes.readUInt32LE(12) + (image.byteOffset ?? 0))
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  expect(png.readUInt32BE(16)).toBe(256)
  expect(png.readUInt32BE(20)).toBe(256)
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.sha256)
  expect(manifest.drivable).toBe(true)
  expect(manifest.integrationStatus).toBe('phase-1')
  // Provenance as stated by Txema Vicente: reworked from a low-quality base mesh.
  expect(manifest.provenance.reworkedBy).toMatch(/Txema Vicente/)
  expect(manifest.provenance.source).toMatch(/almost none of the original geometry remains/)
  expect(readJson(manifest.preset).id).toBe('vfr800')
  expect(rig.kind).toBe('motorcycle')
  expect(rig.physics.status).toBe('phase-1')
  for (const name of [
    'Steering_Pivot',
    'Fork_Slider',
    'Wheel_Front',
    'Wheel_Rear',
    'Swingarm_Pivot',
    'Chain',
  ]) {
    expect(glb.nodes[rig.nodes[name]].name).toBe(name)
  }
  expect(Math.abs(rig.front.hub[2] - rig.rear.hub[2])).toBeCloseTo(1.44, 6)
})

it('animates actual GLB suspension and wheel hierarchy without changing the authored rest pose', async () => {
  const rig = readJson('vfr800fi-1999.rig.json')
  const gltf = await loadTexturedGlb(bytes)
  const root = gltf.scene
  // The GLB extras alone reproduce the authored rig file.
  const fromModel = motorcycleRigFromModel(root),
    fromJson = motorcycleRigFromJson(rig)
  expect(fromModel.steeringAxis).toEqual(fromJson.steeringAxis)
  expect(fromModel.steerLimit).toBeCloseTo(fromJson.steerLimit, 9)
  expect(fromModel.frontTravel).toBeCloseTo(fromJson.frontTravel, 9)
  expect(fromModel.rearTravel).toBeCloseTo(fromJson.rearTravel, 9)
  expect(Math.abs(fromModel.chain!.frontZ - fromJson.chain!.frontZ)).toBeLessThan(0.02)
  expect(Math.abs(fromModel.chain!.rearZ - fromJson.chain!.rearZ)).toBeLessThan(0.002)
  const shared = (root.getObjectByName('Chain') as Mesh).geometry
  const visual = bindMotorcycleRig(root, fromJson)
  const rear = root.getObjectByName('Wheel_Rear')!
  const arm = root.getObjectByName('Swingarm_Pivot')!
  const fork = root.getObjectByName('Fork_Slider')!
  const rest = rear.position.clone()
  const forkRest = fork.position.clone()
  const radius = rest.length()
  for (const steeringAngle of [-0.6, 0, 0.6]) {
    for (const compression of [0, 0.05, 0.1]) {
      visual.update({
        steeringAngle,
        frontCompression: compression,
        rearCompression: compression,
        frontRoll: 1.7,
        rearRoll: -0.9,
      })
      expect(rear.parent).toBe(arm)
      expect(rear.position.distanceTo(rest)).toBeLessThan(1e-8)
      expect(rest.clone().applyQuaternion(arm.quaternion).length()).toBeCloseTo(radius, 8)
      expect(fork.position.distanceTo(forkRest)).toBeCloseTo(compression, 7)
      expect(root.getObjectByName('Wheel_Front')!.quaternion.x).not.toBe(0)
    }
  }
  // The handlebar turns the fork about the head axis: a positive (left) angle swings the
  // front axle's +X end forward (towards −Z).
  const axle = () =>
    new Vector3(1, 0, 0).transformDirection(root.getObjectByName('Wheel_Front')!.matrixWorld)
  visual.update({ steeringAngle: 0 })
  expect(axle().z).toBeCloseTo(0, 6)
  visual.update({ steeringAngle: 0.5 })
  expect(axle().z).toBeLessThan(-0.2)
  // The chain's rear end follows the swingarm; the front sprocket end stays put.
  const chain = root.getObjectByName('Chain') as Mesh
  const span = () => {
    const box = new Box3().setFromBufferAttribute(
      chain.geometry.getAttribute('position') as BufferAttribute,
    )
    return [box.min.z, box.max.y]
  }
  visual.update({ rearCompression: 0 })
  const [front, high] = span()
  visual.update({ rearCompression: 0.1 })
  expect(chain.geometry).not.toBe(shared)
  expect(span()[0]).toBeCloseTo(front, 6)
  expect(span()[1]).toBeGreaterThan(high + 0.02)
  visual.update()
  expect(arm.quaternion.angleTo(root.getObjectByName('Wheel_Rear')!.quaternion)).toBeCloseTo(0, 8)
  expect(fork.position.distanceTo(forkRest)).toBeLessThan(1e-8)
  visual.dispose()
  expect(chain.geometry).toBe(shared)
})

it('keeps the estimated crankshaft power curve physically consistent and preserves exact transmission ratios', () => {
  const specs = readJson('vfr800fi-1999.specs.json')
  const transmission = specs.transmission
  expect(transmission.gears).toHaveLength(6)
  expect(transmission.reverseGear).toBe(false)
  expect(transmission.primary.ratio).toBeCloseTo(64 / 33, 12)
  expect(transmission.finalDrive.ratio).toBeCloseTo(43 / 17, 12)
  const teeth = [
    [37, 13],
    [33, 16],
    [31, 19],
    [28, 21],
    [30, 26],
    [29, 28],
  ]
  teeth.forEach(([driven, driving], i) =>
    expect(transmission.gears[i].ratio).toBeCloseTo(driven / driving, 12),
  )
  const curve = specs.fullThrottleCurve
  expect(curve.status).toBe('estimated-for-simulation')
  const rows = readFileSync(`${directory}/vfr800fi-1999-power.csv`, 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((row) => row.split(',').map(Number))
  expect(rows).toHaveLength(curve.samples.length)
  for (let i = 0; i < rows.length; i++) {
    const [rpm, torque, power] = rows[i]
    expect(power).toBeCloseTo((torque * rpm * Math.PI) / 30, 6)
    expect([rpm, torque, power]).toEqual([
      curve.samples[i].rpm,
      curve.samples[i].torqueNm,
      curve.samples[i].powerW,
    ])
    if (i) expect(rpm).toBeGreaterThan(rows[i - 1][0])
  }
  expect(Math.max(...rows.map((row) => row[2]))).toBeCloseTo(81000, 6)
  expect(Math.max(...rows.map((row) => row[1]))).toBe(82)
  expect(specs.unmeasuredSimulationParameters.revLimiterRpm).toBeNull()
})
