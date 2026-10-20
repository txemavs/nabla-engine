import { expect, it } from 'vitest'
import * as THREE from 'three'
import { TireMarks, TIRE_MARK_SEGMENT_BYTES } from '../../src/render/entity/tire-marks.js'
import {
  boundsVisible,
  cullOffscreen,
  SpawnBounds,
} from '../../src/render/entity/effect-culling.js'
import {
  FLAME_TONGUES,
  mergedFlameGeometry,
  tongueLayout,
  tongueSway,
  WreckFlames,
} from '../../src/render/entity/wreck-flames.js'
import { VehicleDestruction } from '../../src/render/entity/vehicle-destruction.js'

const ranges = (attribute: THREE.BufferAttribute) =>
  attribute.updateRanges.map(({ start, count }) => [start, count])

/** Drive straight along +x with all four wheels slipping; one segment per wheel per tick. */
function drift(marks: TireMarks, ticks: number, from = 0): number {
  const origin = new THREE.Vector3()
  for (let t = 0; t < ticks; t++) {
    const x = (from + t) * 0.5
    marks.update(
      0.06,
      'car',
      [0, 1, 2, 3].map((w) => ({
        contactPoint: [x, 0, w] as [number, number, number],
        contactNormal: [0, 1, 0] as [number, number, number],
        slip: 1,
      })),
      origin,
    )
  }
  return from + ticks
}

it('uploads only the tyre-mark segments written this tick, split across the ring wrap', () => {
  const marks = new TireMarks(6, 20)
  const position = marks.root.geometry.attributes.position as THREE.BufferAttribute
  const born = marks.root.geometry.attributes.born as THREE.BufferAttribute
  let tick = drift(marks, 1)
  // The first tick only remembers each wheel.
  expect(position.updateRanges).toHaveLength(0)
  tick = drift(marks, 1, tick)
  // Four wheels: slots 0–3 in one range of 4 segments.
  expect(ranges(position)).toEqual([[0, 4 * 18]])
  expect(ranges(born)).toEqual([[0, 4 * 6]])
  position.clearUpdateRanges()
  born.clearUpdateRanges()
  drift(marks, 1, tick)
  // Slots 4, 5 then wrap to 0, 1: two ranges.
  expect(ranges(position)).toEqual([
    [4 * 18, 2 * 18],
    [0, 2 * 18],
  ])
  expect(ranges(born)).toEqual([
    [4 * 6, 2 * 6],
    [0, 2 * 6],
  ])
  // Four segments a tick is 768 bytes, versus the whole default ring (2048 × 192 B ≈ 384 KiB).
  expect(4 * TIRE_MARK_SEGMENT_BYTES).toBe(768)
  marks.dispose()
})

it('keeps every live tyre mark inside the culling bounds', () => {
  const marks = new TireMarks(64, 20)
  drift(marks, 10)
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  camera.position.set(2, 3, 10)
  camera.lookAt(2, 0, 1.5)
  camera.updateMatrixWorld(true)
  marks.root.updateMatrixWorld(true)
  let saw = 0
  const geometry = marks.root.geometry
  marks.root.onBeforeRender(
    {} as THREE.WebGLRenderer,
    new THREE.Scene(),
    camera,
    geometry,
    marks.root.material,
    null as unknown as THREE.Group,
  )
  saw = geometry.drawRange.count
  marks.root.onAfterRender(
    {} as THREE.WebGLRenderer,
    new THREE.Scene(),
    camera,
    geometry,
    marks.root.material,
    null as unknown as THREE.Group,
  )
  expect(saw).toBeGreaterThan(0)
  // Turned away: the draw collapses for that render and is restored afterwards.
  camera.lookAt(2, 0, 40)
  camera.updateMatrixWorld(true)
  const count = geometry.drawRange.count
  marks.root.onBeforeRender(
    {} as THREE.WebGLRenderer,
    new THREE.Scene(),
    camera,
    geometry,
    marks.root.material,
    null as unknown as THREE.Group,
  )
  expect(geometry.drawRange.count).toBe(0)
  marks.root.onAfterRender(
    {} as THREE.WebGLRenderer,
    new THREE.Scene(),
    camera,
    geometry,
    marks.root.material,
    null as unknown as THREE.Group,
  )
  expect(geometry.drawRange.count).toBe(count)
  marks.dispose()
})

it('spawn bounds cover everything younger than the lifetime', () => {
  const bounds = new SpawnBounds(1)
  const box = new THREE.Box3()
  const spawns: { t: number; x: number }[] = []
  for (let k = 0; k < 50; k++) {
    const t = k * 0.1 + (k % 3) * 0.013
    bounds.advance(t)
    bounds.expandSphere(k, 0, 0, 0)
    spawns.push({ t, x: k })
    const live = bounds.unionInto(box.makeEmpty())
    for (const spawn of spawns) {
      if (t - spawn.t < 1) expect(live.containsPoint(new THREE.Vector3(spawn.x, 0, 0))).toBe(true)
      // Nothing older than two lifetimes is kept.
      if (t - spawn.t > 2) expect(live.min.x).toBeGreaterThan(spawn.x)
    }
  }
})

it('culls by bounds plus a screen-space pad, never an XR array camera', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  camera.updateMatrixWorld(true)
  const object = new THREE.Object3D()
  object.updateMatrixWorld(true)
  const behind = {
    box: (t: THREE.Box3) =>
      t.setFromCenterAndSize(new THREE.Vector3(0, 0, 5), new THREE.Vector3(1, 1, 1)),
  }
  expect(boundsVisible(object, behind, camera, 1000)).toBe(false)
  // Just off the left edge, but a sprite wider than the gap reaches in.
  const edge = {
    box: (t: THREE.Box3) =>
      t.setFromCenterAndSize(new THREE.Vector3(-6.2, 0, -10), new THREE.Vector3(0, 0, 0)),
  }
  expect(boundsVisible(object, edge, camera, 1000)).toBe(false)
  expect(boundsVisible(object, { ...edge, pad: () => 1 }, camera, 1000)).toBe(true)
  const points = new THREE.Points(new THREE.BufferGeometry())
  cullOffscreen(points, behind)
  const array = new THREE.ArrayCamera([camera])
  points.onBeforeRender(
    {} as THREE.WebGLRenderer,
    new THREE.Scene(),
    array,
    points.geometry,
    points.material as THREE.Material,
    null as unknown as THREE.Group,
  )
  expect(points.geometry.drawRange.count).toBe(Infinity)
})

it('lists the merged flame tongues back to front like three sorted the six meshes', () => {
  const tongue = new THREE.PlaneGeometry(1, 1, 1, 16).translate(0, 0.5, 0)
  const merged = mergedFlameGeometry(tongue)
  expect(merged.getAttribute('position').count).toBe(FLAME_TONGUES * 34)
  const clock = { value: 1.37 }
  const flames = new WreckFlames(merged, new THREE.MeshBasicMaterial(), clock, { value: 1 })
  const group = new THREE.Group()
  group.position.set(4, 0.3, -2)
  group.add(flames.mesh)
  // The former six meshes, at the same animated scales.
  const former = Array.from({ length: FLAME_TONGUES }, (_, i) => {
    const mesh = new THREE.Mesh(tongue)
    const layout = tongueLayout(i)
    const sway = tongueSway(i, clock.value)
    mesh.rotation.y = layout.rotationY
    mesh.position.set(layout.x, 0, layout.z)
    mesh.scale.set(sway.scaleX, sway.scaleY, 1)
    group.add(mesh)
    return mesh
  })
  const scene = new THREE.Scene()
  scene.add(group)
  for (const [x, z] of [
    [10, 0],
    [-10, 1],
    [0, 10],
    [3, -9],
    [-7, -7],
  ]) {
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(4 + x, 1.5, -2 + z)
    camera.lookAt(4, 0.8, -2)
    scene.updateMatrixWorld(true)
    camera.updateMatrixWorld(true)
    const projection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    )
    // three's transparent order: depth of the bounding-sphere centre, farthest first, then id.
    tongue.computeBoundingSphere()
    const expected = former
      .map((mesh, i) => ({
        i,
        id: mesh.id,
        z: tongue
          .boundingSphere!.center.clone()
          .applyMatrix4(mesh.matrixWorld)
          .applyMatrix4(projection).z,
      }))
      .sort((a, b) => (a.z !== b.z ? b.z - a.z : a.id - b.id))
      .map((t) => t.i)
    flames.sort(camera)
    const index = flames.mesh.geometry.getIndex()!.array as Uint16Array
    const per = index.length / FLAME_TONGUES
    const got = Array.from({ length: FLAME_TONGUES }, (_, slot) =>
      Math.floor(index[slot * per] / 34),
    )
    expect(got).toEqual(expected)
  }
  flames.dispose()
})

it('moves glass fragments without allocating and culls them by their own bounds', () => {
  const space = new THREE.Group()
  const destruction = new VehicleDestruction(space)
  const random = Math.random
  let seed = 3
  Math.random = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let i = 0; i < 5; i++)
    destruction.glass(new THREE.Vector3(i, 1, 0), new THREE.Vector3(0, 0, 1))
  Math.random = random
  // 5 × 24 fragments, capped at 96 (the oldest dropped).
  expect(destruction.shardsAlive).toBe(96)
  for (let f = 0; f < 10; f++) destruction.update(1 / 60, true)
  expect(destruction.shardsAlive).toBe(96)
  for (let f = 0; f < 90; f++) destruction.update(1 / 60, true)
  expect(destruction.shardsAlive).toBe(0)
  destruction.dispose()
})
