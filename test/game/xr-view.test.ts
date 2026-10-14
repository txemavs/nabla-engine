import { expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { GameXR } from '../../src/runtime/xr.js'

it('anchors tracked eyes at a seat and restores camera ownership after exit', async () => {
  const scene = new THREE.Scene(),
    parent = new THREE.Group(),
    camera = new THREE.PerspectiveCamera()
  scene.add(parent)
  parent.add(camera)
  camera.position.set(3, 4, 5)
  const floor = new EventTarget()
  const session = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
    inputSources: [],
    requestReferenceSpace: async () => floor,
    end: async () => {
      session.dispatchEvent(new Event('end'))
    },
  })
  const manager = {
    enabled: false,
    setReferenceSpaceType() {},
    setFramebufferScaleFactor() {},
    setFoveation() {},
    setSession: async () => {},
    getSession: () => session,
    getReferenceSpace: () => floor,
    setReferenceSpace() {},
    getControllerGrip: () => new THREE.Group(),
    getController: () => new THREE.Group(),
  }
  const changed: boolean[] = []
  const xr = new GameXR(
    { xr: manager } as unknown as THREE.WebGLRenderer,
    camera,
    scene,
    (active) => changed.push(active),
    () => {},
  )
  await xr.enter({ requestSession: async () => session } as unknown as XRSystem)
  expect(camera.parent).toBe(xr.rig)
  xr.anchor(new THREE.Vector3(10, 2, 20), new THREE.Quaternion())
  expect(xr.rig.position.y).toBeCloseTo(0.35)
  expect(camera.position.toArray()).toEqual([0, 1.65, 0])
  expect(camera.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([10, 2, 20])
  vi.spyOn(xr.session, 'update').mockImplementation(() => {})
  xr.update({
    getViewerPose: () => ({
      transform: { position: { x: 0.1, y: 1.7, z: -0.1 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
    }),
  } as unknown as XRFrame)
  xr.anchor(new THREE.Vector3(10, 2, 20), new THREE.Quaternion())
  expect(camera.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([10.1, 2, 19.9])
  await xr.exit()
  expect(camera.parent).toBe(parent)
  expect(camera.position.toArray()).toEqual([3, 4, 5])
  expect(changed).toEqual([true, false])
  camera.position.set(7, 8, 9)
  manager.setSession = async () => {
    throw new Error('XR setup failed')
  }
  await expect(
    xr.enter({ requestSession: async () => session } as unknown as XRSystem),
  ).rejects.toThrow('XR setup failed')
  expect(camera.parent).toBe(parent)
  expect(camera.position.toArray()).toEqual([7, 8, 9])
  xr.dispose()
})
