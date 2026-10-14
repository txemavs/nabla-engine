import { expect, it } from 'vitest'
import * as THREE from 'three'
import { pickQuestTarget, questHand } from '../../game/xr-pointer.js'

it('picks a child mesh by its target root and refuses to select through a blocker', () => {
  const scene = new THREE.Scene()
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())
  root.add(mesh)
  root.position.z = -5
  const blocker = mesh.clone()
  blocker.position.z = -2
  scene.add(root, blocker)
  scene.updateMatrixWorld(true)
  const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, 0, -1))
  const target = { root, label: 'Known object' }
  expect(pickQuestTarget(ray, [target], [])?.target).toBe(target)
  expect(pickQuestTarget(ray, [target], [blocker])).toBeNull()
  blocker.visible = false
  expect(pickQuestTarget(ray, [target], [blocker])?.distance).toBeCloseTo(4.5)
  root.visible = false
  expect(pickQuestTarget(ray, [target], [blocker])).toBeNull()
  mesh.geometry.dispose()
  mesh.material.dispose()
})

it('uses handedness and excludes gaze and bare hands from controller actions', () => {
  const controller = { handedness: 'right', targetRayMode: 'tracked-pointer' } as XRInputSource
  expect(questHand(controller)).toBe('right')
  expect(questHand({ ...controller, handedness: 'left' })).toBe('left')
  expect(questHand({ ...controller, targetRayMode: 'gaze' })).toBeNull()
  expect(questHand({ ...controller, hand: {} as XRHand })).toBeNull()
  expect(questHand({ ...controller, handedness: 'none' })).toBeNull()
})
