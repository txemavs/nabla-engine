import { afterEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { ARRoom } from '../../src/runtime/ar/room.js'

afterEach(() => vi.unstubAllGlobals())
function setup() {
  vi.stubGlobal('document', {
    createElement: () => ({ getContext: () => ({ fillRect() {}, fillText() {} }) }),
  })
  return new ARRoom(new THREE.Scene())
}
it('tracks room geometry, replaces changed surfaces, hides lost poses and removes stale surfaces', () => {
  const room = setup()
  const plane = {
    planeSpace: {},
    lastChangedTime: 1,
    polygon: [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
    ],
  }
  const frame = {
    detectedPlanes: new Set([plane]),
    getPose: vi.fn(() => ({
      transform: { matrix: new THREE.Matrix4().makeTranslation(2, 0, 3).elements },
    })),
  }
  const tick = () => room.update(frame as unknown as XRFrame, {} as XRReferenceSpace, true)
  tick()
  const mesh = room.root.children[0] as THREE.Mesh
  expect(mesh.geometry.index!.count).toBe(6)
  expect(mesh.matrix.elements[12]).toBe(2)
  const original = mesh.geometry
  const dispose = vi.spyOn(original, 'dispose')
  tick()
  expect(mesh.geometry).toBe(original)
  plane.lastChangedTime = 2
  tick()
  expect(dispose).toHaveBeenCalledOnce()
  frame.getPose.mockReturnValueOnce(null as never)
  tick()
  expect(mesh.visible).toBe(false)
  frame.detectedPlanes.clear()
  tick()
  expect(room.root.children).toHaveLength(0)
  room.dispose()
})
it('requests capture once per session and can hide surfaces independently', async () => {
  const room = setup()
  const initiateRoomCapture = vi.fn().mockResolvedValue(undefined)
  const session = { initiateRoomCapture } as unknown as XRSession
  room.capture(session)
  room.capture(session)
  expect(initiateRoomCapture).toHaveBeenCalledOnce()
  room.toggleSurfaces()
  expect(room.surfacesVisible).toBe(true)
  room.reset()
  room.capture(session)
  expect(initiateRoomCapture).toHaveBeenCalledTimes(2)
  await Promise.resolve()
  room.dispose()
})

it('keeps hidden room surfaces raycastable and excludes surfaces with lost tracking', () => {
  const room = setup()
  const plane = {
    planeSpace: {},
    lastChangedTime: 1,
    polygon: [
      { x: -1, y: 0, z: -1 },
      { x: 1, y: 0, z: -1 },
      { x: 1, y: 0, z: 1 },
      { x: -1, y: 0, z: 1 },
    ],
  }
  const frame = {
    detectedPlanes: new Set([plane]),
    getPose: vi.fn(() => ({
      transform: { matrix: new THREE.Matrix4().makeTranslation(0, 0.8, 0).elements },
    })),
  }
  const tick = () => room.update(frame as unknown as XRFrame, {} as XRReferenceSpace, true)
  tick()
  const target = room.targets[0]
  expect((target.material as THREE.Material).visible).toBe(false)
  expect(room.ground(new THREE.Vector3(0, 1, 0), 0.3)?.y).toBeCloseTo(0.8)
  expect(room.ground(new THREE.Vector3(0, 1, 0), 0.1)).toBeNull()
  frame.getPose.mockReturnValueOnce(null as never)
  tick()
  expect(room.targets).toHaveLength(0)
  room.dispose()
})
it('creates only tracking geometry, without a menu or document dependency', () => {
  const scene = new THREE.Scene()
  vi.stubGlobal('document', undefined)
  const room = new ARRoom(scene)
  expect(scene.children).toEqual([room.root])
  expect(room.root.children).toHaveLength(0)
  expect(room.surfacesVisible).toBe(false)
  room.dispose()
  expect(scene.children).toHaveLength(0)
})

it('prefers tracked mesh over simplified planes and applies source selection to collision targets', () => {
  const room = setup()
  const plane = {
    planeSpace: {},
    lastChangedTime: 1,
    polygon: [
      { x: -20, y: 0, z: -20 },
      { x: 20, y: 0, z: -20 },
      { x: 20, y: 0, z: 20 },
      { x: -20, y: 0, z: 20 },
    ],
  }
  const mesh = {
    meshSpace: {},
    lastChangedTime: 1,
    vertices: new Float32Array([-1, 0, -1, 1, 0, -1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
  }
  let meshTracked = true
  const frame = {
    detectedPlanes: new Set([plane]),
    detectedMeshes: new Set([mesh]),
    getPose: (space: unknown) =>
      space === mesh.meshSpace && !meshTracked
        ? null
        : { transform: { matrix: new THREE.Matrix4().elements } },
  }
  const tick = () => room.update(frame as unknown as XRFrame, {} as XRReferenceSpace, true)
  tick()
  expect(room.surfaceCounts).toEqual({ mesh: 1, planes: 1, active: 1 })
  expect(room.targets[0].geometry.getAttribute('position').count).toBe(3)
  room.setSource('planes')
  expect(room.targets[0].geometry.getAttribute('position').count).toBe(4)
  room.setSource('mesh')
  meshTracked = false
  tick()
  expect(room.targets).toHaveLength(0) // Explicit mesh mode never restores a rejected plane.
  room.setSource('auto')
  expect(room.targets).toHaveLength(1)
  meshTracked = true
  tick()
  expect(room.targets[0].geometry.getAttribute('position').count).toBe(3)
  room.dispose()
})

it('keeps distinct surface colors through geometry updates and disposes their materials', () => {
  const room = setup()
  const polygon = [
    { x: 0, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
  ]
  const first = { planeSpace: {}, lastChangedTime: 1, polygon }
  const second = { planeSpace: {}, lastChangedTime: 1, polygon }
  const frame = {
    detectedPlanes: new Set([first, second]),
    getPose: () => ({ transform: { matrix: new THREE.Matrix4().elements } }),
  }
  const tick = () => room.update(frame as unknown as XRFrame, {} as XRReferenceSpace, true)
  tick()
  const materials = room.targets.map((mesh) => mesh.material as THREE.MeshBasicMaterial)
  expect(materials[0].color.getHex()).not.toBe(materials[1].color.getHex())
  expect(materials[0].visible).toBe(false)
  room.toggleSurfaces()
  expect(materials.every((material) => material.visible)).toBe(true)
  first.lastChangedTime++
  tick()
  expect(room.targets[0].material).toBe(materials[0])
  const dispose = vi.spyOn(materials[0], 'dispose')
  frame.detectedPlanes.delete(first)
  tick()
  expect(dispose).toHaveBeenCalledOnce()
  room.dispose()
})
