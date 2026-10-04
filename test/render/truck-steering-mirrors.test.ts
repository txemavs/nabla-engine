import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Group, Mesh, Quaternion, Vector3 } from 'three'
import { Reflector } from 'three/addons/objects/Reflector.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { stockVehiclePresentation } from '../../src/catalog/presentation/road-vehicles.js'
import { CarMirrors } from '../../src/render/entity/car-mirrors.js'
import {
  poseSteeringWheel,
  steeringAxis,
  steeringFullLockSteer,
  steeringWheelAngle,
  steeringWheelLock,
} from '../../src/render/entity/steering-wheel.js'
import { authoredMirrorLenses } from '../../src/render/vehicle-presentation/mirror-lenses.js'
import { vehicleField } from '../../src/entity/vehicle/field.js'

const assets = 'assets/studio/trucks/white-truck-studio/assets/'

/** Vertex positions of every primitive of a mesh in a GLB, in the mesh's own space. */
function glbMeshVertices(file: string, meshName: string): Vector3[] {
  const bytes = fs.readFileSync(file)
  const jsonLength = bytes.readUInt32LE(12)
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
  const binary = 20 + jsonLength + 8
  const out: Vector3[] = []
  for (const mesh of json.meshes.filter((m: { name: string }) => m.name === meshName))
    for (const primitive of mesh.primitives) {
      const accessor = json.accessors[primitive.attributes.POSITION]
      const view = json.bufferViews[accessor.bufferView]
      const start = binary + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
      const stride = view.byteStride ?? 12
      for (let i = 0; i < accessor.count; i++)
        out.push(
          new Vector3(
            bytes.readFloatLE(start + i * stride),
            bytes.readFloatLE(start + i * stride + 4),
            bytes.readFloatLE(start + i * stride + 8),
          ),
        )
    }
  return out
}

/** Thin axis of a flat ring: the eigenvector of the smallest covariance eigenvalue. */
function ringNormal(points: Vector3[]): Vector3 {
  const centre = points.reduce((s, p) => s.add(p), new Vector3()).divideScalar(points.length)
  const c = [0, 0, 0, 0, 0, 0] // xx xy xz yy yz zz
  for (const p of points) {
    const d = p.clone().sub(centre)
    c[0] += d.x * d.x
    c[1] += d.x * d.y
    c[2] += d.x * d.z
    c[3] += d.y * d.y
    c[4] += d.y * d.z
    c[5] += d.z * d.z
  }
  const mul = (v: Vector3) =>
    new Vector3(
      c[0] * v.x + c[1] * v.y + c[2] * v.z,
      c[1] * v.x + c[3] * v.y + c[4] * v.z,
      c[2] * v.x + c[4] * v.y + c[5] * v.z,
    )
  let a = new Vector3(1, 0.3, 0.2).normalize()
  for (let i = 0; i < 300; i++) a = mul(a).normalize()
  let b = new Vector3(0.1, 1, 0.5)
  for (let i = 0; i < 300; i++) b = mul(b).addScaledVector(a, -mul(b).dot(a)).normalize()
  return new Vector3().crossVectors(a, b).normalize()
}

const truck = () => presetVehicle('white-truck', 'truck')
const car = () => presetVehicle('car', 's3')
const angleBetween = (a: Vector3, b: Vector3) =>
  (Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180) / Math.PI

describe('truck steering wheel', () => {
  const axisOf = () => steeringAxis(truck().visual!.steering!.axis)
  const rimNormal = () => ringNormal(glbMeshVertices(assets + 'steering.glb', 'original_rim'))

  it('spins about the real rim axis, which is tilted inside the GLB', () => {
    const rim = rimNormal()
    // The rim is not authored on +Z: spinning about Z (the old behaviour) would wobble it.
    expect(angleBetween(rim, new Vector3(0, 0, 1))).toBeGreaterThan(40)
    expect(angleBetween(rim, axisOf())).toBeLessThan(0.02)
    // Away from the driver: forward (-Z) and down, like the S3 column.
    expect(axisOf().z).toBeLessThan(0)
    expect(axisOf().y).toBeLessThan(0)
  })

  it('keeps the rim plane and centre fixed at every steering angle', () => {
    const rim = rimNormal()
    const spin = new Group()
    for (const steer of [-0.45, -0.3, -0.05, 0, 0.1, 0.3, 0.45, 0.9]) {
      poseSteeringWheel(spin, axisOf(), steer)
      const turned = rim.clone().applyQuaternion(spin.quaternion)
      expect(angleBetween(turned, rim)).toBeLessThan(0.02)
      // The pivot (mesh origin = rim centre) does not move.
      expect(spin.position.length()).toBe(0)
    }
    const centre = glbMeshVertices(assets + 'steering.glb', 'original_rim')
      .reduce((s, p) => s.add(p), new Vector3())
      .divideScalar(glbMeshVertices(assets + 'steering.glb', 'original_rim').length)
    expect(centre.length()).toBeLessThan(0.01)
  })

  it('old Z-axis spin tilted the rim by tens of degrees', () => {
    const rim = rimNormal()
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -Math.PI / 2)
    expect(angleBetween(rim.clone().applyQuaternion(q), rim)).toBeGreaterThan(30)
  })

  it('locks at 90 degrees each side and turns the top of the rim to the side of the turn', () => {
    expect(steeringWheelAngle(0)).toBe(-0)
    expect(steeringWheelAngle(steeringFullLockSteer)).toBeCloseTo(-steeringWheelLock, 10)
    expect(steeringWheelAngle(-steeringFullLockSteer)).toBeCloseTo(steeringWheelLock, 10)
    expect(steeringWheelAngle(5)).toBeCloseTo(-steeringWheelLock, 10)
    const cases: [string, Vector3, Quaternion][] = [
      ['truck', axisOf(), new Quaternion()],
      [
        'car',
        steeringAxis(car().visual!.steering!.axis),
        new Quaternion(...car().visual!.steering!.transform.rotation),
      ],
    ]
    for (const [name, axis, mount] of cases) {
      const column = axis.clone().applyQuaternion(mount)
      const up = new Vector3(0, 1, 0)
      const top = up.addScaledVector(column, -up.dot(column)).normalize()
      const spin = new Group()
      for (const [steer, side] of [
        [0.45, -1], // positive steer is a left turn (physics): top of the rim goes to -x
        [-0.45, 1],
      ] as const) {
        poseSteeringWheel(spin, axis, steer)
        const turned = top
          .clone()
          .applyQuaternion(new Quaternion().setFromAxisAngle(column, steeringWheelAngle(steer)))
        // Quarter turn at full lock, towards the turn, as seen by the driver looking along -Z.
        expect(turned.x * side).toBeGreaterThan(0.5)
        expect(name).toBeTruthy()
      }
    }
  })
})

describe('truck mirrors', () => {
  it('declares two mirror lenses and a valid schema', () => {
    const vehicle = truck().vehicle!
    expect(vehicle.mirrors).toHaveLength(2)
    expect(vehicleField.safeParse(vehicle).success).toBe(true)
    expect(vehicleField.safeParse({ ...vehicle, mirrors: [{ position: [0, 0, 0] }] }).success).toBe(
      false,
    )
    const visual = truck().visual!
    expect(
      vehicleField.safeParse({ ...vehicle }).success &&
        'axis' in (visual.steering as object) &&
        visual.steering!.axis!.length === 3,
    ).toBe(true)
  })

  it('places each lens on the rear face of the authored door housing, facing the driver', () => {
    const entity = truck()
    for (const [meshName, side] of [
      ['drzwi01_color [spec]_0_3', -1],
      ['drzwi_color [spec]_0_3', 1],
    ] as const) {
      const housing = glbMeshVertices(assets + 'tractor.modern.glb', meshName).filter(
        (p) => Math.abs(p.x) > 1.3,
      )
      const lens = entity.vehicle!.mirrors!.find((m) => Math.sign(m.position[0]) === side)!
      const xs = housing.map((p) => p.x)
      const ys = housing.map((p) => p.y)
      const rear = Math.max(...housing.map((p) => p.z))
      expect(lens.position[0]).toBeGreaterThan(Math.min(...xs))
      expect(lens.position[0]).toBeLessThan(Math.max(...xs))
      expect(lens.position[1] - lens.height / 2).toBeGreaterThanOrEqual(Math.min(...ys) - 0.05)
      expect(lens.position[1] + lens.height / 2).toBeLessThanOrEqual(Math.max(...ys) + 0.05)
      // Just behind the rearmost surface of the housing, never inside it.
      expect(lens.position[2] - rear).toBeGreaterThan(0)
      expect(lens.position[2] - rear).toBeLessThan(0.02)
      // The glass faces the driver's eye.
      const eye = new Vector3(...entity.vehicle!.driver!)
      const toEye = eye.sub(new Vector3(...lens.position))
      expect(toEye.dot(new Vector3(...lens.normal).normalize())).toBeGreaterThan(0)
    }
  })

  it('the nabla.truck presentation builds a live mirror per lens like the S3', () => {
    const entity = truck()
    const adapter = stockVehiclePresentation(entity)!
    const model = new Group()
    const equipment = adapter.mount(model, entity, null)
    expect(equipment.mirrors).toBeInstanceOf(CarMirrors)
    const lenses = model.children.filter(
      (c): c is Mesh => c instanceof Mesh && !(c instanceof Reflector),
    )
    const reflectors = model.children.filter((c) => c instanceof Reflector)
    expect(lenses.map((l) => l.name)).toEqual(['nabla.mirror.0', 'nabla.mirror.1'])
    expect(reflectors).toHaveLength(2)
    for (const mirror of reflectors) {
      const normal = new Vector3(0, 0, 1).applyQuaternion(mirror.quaternion)
      expect(normal.z).toBeGreaterThan(0.99)
    }
    equipment.mirrors!.dispose()
  })

  it('creates no mirror for a truck without authored lenses and rejects a zero normal', () => {
    const entity = truck()
    expect(authoredMirrorLenses(new Group(), undefined)).toEqual([])
    expect(() =>
      authoredMirrorLenses(new Group(), [
        { position: [0, 0, 0], normal: [0, 0, 0], width: 1, height: 1 },
      ]),
    ).toThrow('zero normal')
    entity.vehicle!.mirrors = undefined
    expect(stockVehiclePresentation(entity)!.mount(new Group(), entity, null).mirrors).toBe(
      undefined,
    )
  })
})
