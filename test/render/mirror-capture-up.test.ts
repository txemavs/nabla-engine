/**
 * The mirror capture camera stays upright with the vehicle, whatever roll the lens node was
 * authored with. The S3 right-door lens sits under a node rotated 180° about X; taking the lens's
 * own +Y as the camera up rolled that capture upside down.
 */
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { CarMirrors, fitMirrorCamera } from '../../src/render/entity/car-mirrors.js'

type Entry = {
  side: string
  mirror: THREE.Mesh
  capture: THREE.PerspectiveCamera
  render: (...args: unknown[]) => void
}

/** A vehicle with an upright left door and a right door authored rotated 180° about X. */
function vehicle(roll = 0) {
  const scene = new THREE.Scene()
  const root = new THREE.Group()
  root.rotation.set(0, 0.4, roll, 'YXZ')
  scene.add(root)
  const door = (name: string, x: number, flipped: boolean) => {
    const node = new THREE.Group()
    node.name = name
    node.position.set(x, 1.1, -0.5)
    if (flipped) node.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI)
    root.add(node)
    const geometry = new THREE.PlaneGeometry(0.16, 0.1)
    // Face the rider (+Z, behind the glass) in world space either way.
    if (flipped) geometry.rotateY(Math.PI)
    const lens = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
    node.add(lens)
    return lens
  }
  const lenses = [door('Puerta Izquierda', -0.4, false), door('Puerta Derecha', 0.4, true)]
  const eye = new THREE.PerspectiveCamera(70, 1.5, 0.05, 1000)
  eye.position.set(0, 1.3, 0.3)
  root.add(eye)
  scene.updateMatrixWorld(true)
  return { scene, root, lenses, eye }
}

/** Run one capture pass with a stub renderer and return each side's camera up and the vehicle up. */
function captureUps(roll = 0) {
  const { scene, root, lenses, eye } = vehicle(roll)
  // The vehicle up in world at build time, as the presentation adapters pass it.
  const carUp = new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion)
  const mirrors = new CarMirrors(lenses, carUp, 0, {}, root)
  const entries = (mirrors as unknown as { entries: Entry[] }).entries
  // Then the vehicle moves on (turns and leans the other way): the capture follows it.
  root.rotation.set(0, -1.1, -roll * 0.5, 'YXZ')
  scene.updateMatrixWorld(true)
  const ups: Record<string, THREE.Vector3> = {}
  const views: Record<string, THREE.Vector3> = {}
  for (const e of entries)
    e.render = () => {
      ups[e.side] = new THREE.Vector3(0, 1, 0).transformDirection(e.capture.matrixWorld)
      views[e.side] = new THREE.Vector3(0, 0, -1).transformDirection(e.capture.matrixWorld)
    }
  const renderer = { domElement: { dataset: {} }, autoClear: true }
  const camera = new THREE.PerspectiveCamera(70, 1.5, 0.05, 1000)
  eye.updateMatrixWorld(true)
  camera.matrix.copy(eye.matrixWorld)
  camera.matrix.decompose(camera.position, camera.quaternion, camera.scale)
  camera.updateMatrixWorld(true)
  mirrors.render(renderer as unknown as THREE.WebGLRenderer, scene, camera, true, 0)
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(root.quaternion)
  mirrors.dispose()
  return { ups, views, up }
}

describe('mirror capture camera up', () => {
  it('the lens +Y of a door authored rotated 180° about X points down (the old camera up)', () => {
    const { lenses, eye } = vehicle()
    const mirrors = new CarMirrors(lenses, new THREE.Vector3(0, 1, 0), 0, {}, undefined)
    const entries = (mirrors as unknown as { entries: Entry[] }).entries
    const right = entries.find((e) => e.mirror.parent?.name === 'Puerta Derecha')!
    right.mirror.updateMatrixWorld(true)
    const capture = new THREE.PerspectiveCamera()
    fitMirrorCamera(capture, eye, right.mirror)
    const up = new THREE.Vector3(0, 1, 0).transformDirection(capture.matrixWorld)
    expect(up.y).toBeLessThan(-0.5)
    mirrors.dispose()
  })

  it('both sides capture upright with the vehicle, also leaned over', () => {
    for (const roll of [0, 0.6, -0.6]) {
      const { ups, views, up } = captureUps(roll)
      expect(Object.keys(ups).sort()).toEqual(['left', 'right'])
      for (const side of ['left', 'right']) {
        // The vehicle up, square to the view: what an upright camera's up must be.
        const square = up.clone().addScaledVector(views[side], -up.dot(views[side])).normalize()
        expect(ups[side].dot(square)).toBeGreaterThan(0.999)
      }
    }
  })

  it('falls back to the lens +Y when the view runs along the requested up', () => {
    const { lenses, eye } = vehicle()
    const mirrors = new CarMirrors(lenses, new THREE.Vector3(0, 1, 0), 0)
    const entries = (mirrors as unknown as { entries: Entry[] }).entries
    const left = entries[0].mirror
    left.updateMatrixWorld(true)
    const view = left
      .getWorldPosition(new THREE.Vector3())
      .sub(eye.getWorldPosition(new THREE.Vector3()))
    const capture = new THREE.PerspectiveCamera()
    fitMirrorCamera(capture, eye, left, 1.5, view)
    const up = new THREE.Vector3(0, 1, 0).transformDirection(capture.matrixWorld)
    expect(Number.isFinite(up.x + up.y + up.z)).toBe(true)
    expect(up.y).toBeGreaterThan(0.5)
    mirrors.dispose()
  })
})
