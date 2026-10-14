import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { assets } from '../../src/render/entity/assets.js'
import { weaponPreset as stockWeapon } from '../../src/catalog/weapons/library.js'
import { QuestInteraction } from '../../game/xr-interaction.js'

vi.mock('@nabla/engine', async () => ({
  weaponPreset: (await import('../../src/catalog/weapons/library.js')).weaponPreset,
}))
vi.mock('@nabla/engine/runtime', async () => ({
  Sidearm: (await import('../../src/runtime/sidearm.js')).Sidearm,
}))

beforeEach(() => {
  vi.spyOn(assets, 'instantiate').mockImplementation(async () => {
    const model = new THREE.Group()
    for (const name of ['GripSocket', 'MuzzleSocket', 'Slide', 'Trigger', 'Magazine']) {
      const node = new THREE.Group()
      node.name = name
      if (name === 'GripSocket') node.position.set(0, 0.049, 0.015)
      if (name === 'MuzzleSocket') node.position.set(0, 0.113, -0.118)
      model.add(node)
    }
    return model
  })
  vi.stubGlobal('fetch', async () => ({ ok: false }))
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function setup() {
  const aim = [new THREE.Group(), new THREE.Group()]
  const grips = [new THREE.Group(), new THREE.Group()]
  const renderer = {
    domElement: {},
    xr: {
      getController: (i: number) => aim[i],
      getControllerGrip: (i: number) => grips[i],
      getSession: () => ({ visibilityState: 'visible' }),
    },
  } as unknown as THREE.WebGLRenderer
  const scene = new THREE.Scene(),
    rig = new THREE.Group()
  scene.add(rig)
  const target = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshBasicMaterial())
  target.position.z = -4
  scene.add(target)
  scene.updateMatrixWorld(true)
  const recenter = vi.fn()
  const input = new QuestInteraction(
    renderer,
    scene,
    rig,
    [{ root: target, label: 'Block' }],
    [],
    recenter,
  )
  await input.ready
  const dispatch = (i: number, type: string, data?: unknown) =>
    aim[i].dispatchEvent({ type, data } as never)
  // Right connects first: controller indices must not be treated as hands.
  dispatch(0, 'connected', { handedness: 'right', targetRayMode: 'tracked-pointer' })
  dispatch(1, 'connected', { handedness: 'left', targetRayMode: 'tracked-pointer' })
  input.setActive(true)
  input.update(performance.now())
  return { input, aim, grips, dispatch, recenter, target }
}

it('mounts the real Sidearm at its grip, fires from that hand and releases on loss of tracking', async () => {
  const { input, grips, dispatch, recenter, target } = await setup()
  const initial = input.weapon.ammo.total
  expect(initial).toBe(stockWeapon('hk-compact').firearm!.magazineCapacity + 1)
  grips[0].position.set(1, 2, 3)
  grips[0].rotation.set(0.4, -0.6, 0.2)
  input.update(performance.now())
  const socket = input.weapon.model.getObjectByName('GripSocket')!
  expect(
    socket
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(grips[0].getWorldPosition(new THREE.Vector3())),
  ).toBeLessThan(1e-8)
  dispatch(0, 'selectstart')
  expect(input.weapon.ammo.total).toBe(initial - 1)
  expect(recenter).not.toHaveBeenCalled()
  dispatch(0, 'selectstart')
  expect(input.weapon.ammo.total).toBe(initial - 1)
  grips[0].visible = false
  input.update(performance.now() + 200)
  expect(input.weapon.model.visible).toBe(false)
  grips[0].visible = true
  input.update(performance.now() + 300)
  expect(input.weapon.model.visible).toBe(true)
  expect(
    socket
      .getWorldPosition(new THREE.Vector3())
      .distanceTo(grips[0].getWorldPosition(new THREE.Vector3())),
  ).toBeLessThan(1e-8)
  dispatch(0, 'disconnected')
  expect(input.weapon.model.visible).toBe(false)
  input.dispose()
  expect(input.weapon.model.parent).toBeNull()
  target.geometry.dispose()
  target.material.dispose()
})

it('selects with the left hand, recenters only on left squeeze and stops input after exit', async () => {
  const { input, dispatch, recenter, target } = await setup()
  const ammo = input.weapon.ammo.total
  dispatch(1, 'selectstart')
  expect(input.summary).toContain('Seleccionado: Block')
  expect(input.weapon.ammo.total).toBe(ammo)
  dispatch(1, 'squeezestart')
  expect(recenter).toHaveBeenCalledOnce()
  dispatch(0, 'squeezestart')
  expect(input.summary).toContain('Recargando HK')
  expect(recenter).toHaveBeenCalledOnce()
  input.setActive(false)
  dispatch(0, 'selectstart')
  dispatch(1, 'squeezestart')
  expect(input.weapon.ammo.total).toBe(ammo)
  expect(recenter).toHaveBeenCalledOnce()
  input.dispose()
  target.geometry.dispose()
  target.material.dispose()
})
