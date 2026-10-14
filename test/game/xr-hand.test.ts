import { expect, it } from 'vitest'
import { XRControllerHand } from '../../src/runtime/xr-hand.js'
it('mirrors gloves and animates trigger/grip; hides lost tracking', () => {
  const hand = new XRControllerHand()
  const source = {
    handedness: 'right',
    gamepad: { buttons: [{ value: 0 }, { value: 0 }] },
  } as unknown as XRInputSource
  hand.update(source, true)
  expect(hand.root.visible).toBe(true)
  const fingers = hand.root.children.slice(2, 6)
  const open = fingers.map((finger) => finger.rotation.x)
  ;(source.gamepad!.buttons[1] as { value: number }).value = 1
  hand.update(source, true)
  expect(fingers[1].rotation.x).toBeLessThan(open[1])
  ;(source.gamepad!.buttons[0] as { value: number }).value = 1
  hand.update(source, true)
  expect(fingers[0].rotation.x).toBeLessThan(open[0])
  hand.update({ ...source, handedness: 'left' }, true)
  expect(hand.root.scale.x).toBe(-1)
  hand.update(source, false)
  expect(hand.root.visible).toBe(false)
  hand.dispose()
})

it('uses articulated GLB bones and its fingertip while preserving calibration', async () => {
  const THREE = await import('three')
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
  const { vi } = await import('vitest')
  const scene = new THREE.Group()
  for (let f = 0; f < 5; f++) {
    let parent: import('three').Object3D = scene
    for (let j = 0; j < 3; j++) {
      const bone = new THREE.Bone()
      bone.name = `finger-${f}-${j}`
      bone.position.z = -0.025
      parent.add(bone)
      parent = bone
    }
    if (f === 0) {
      const tip = new THREE.Object3D()
      tip.name = 'index-tip'
      tip.position.z = -0.02
      parent.add(tip)
    }
  }
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue({ scene } as never)
  const hand = new XRControllerHand()
  hand.root.position.set(0.01, 0.02, 0.03)
  try {
    await hand.loadModel('/host-owned-glove.glb')
    const source = {
      handedness: 'right',
      gamepad: { buttons: [{ value: 0 }, { value: 0 }] },
    } as unknown as XRInputSource
    hand.update(source, true)
    const open = hand.indexTip.getWorldPosition(new THREE.Vector3())
    ;(source.gamepad!.buttons[0] as { value: number }).value = 1
    hand.update(source, true)
    expect(hand.indexTip.getWorldPosition(new THREE.Vector3()).distanceTo(open)).toBeGreaterThan(
      0.02,
    )
    expect(scene.getObjectByName('finger-1-1')!.rotation.x).toBeCloseTo(0)
    expect(hand.root.position.toArray()).toEqual([0.01, 0.02, 0.03])
    load.mockResolvedValue({ scene: new THREE.Group() } as never)
    await expect(hand.loadModel('/invalid.glb')).rejects.toThrow('missing finger')
    expect(scene.parent).toBe(hand.root)
  } finally {
    hand.dispose()
    load.mockRestore()
  }
})

it('interpolates authored local bone poses instead of overwriting their axes', async () => {
  const THREE = await import('three')
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
  const { vi } = await import('vitest')
  const scene = new THREE.Group()
  const open = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.7)
  const closed = open
    .clone()
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1))
  scene.userData.nablaHand = {
    tip: 'tip',
    fingers: Array.from({ length: 5 }, (_, f) =>
      Array.from({ length: f === 0 ? 4 : 3 }, (_, j) => {
        const bone = new THREE.Bone()
        bone.name = `authored-${f}-${j}`
        scene.add(bone)
        return {
          name: bone.name,
          open: open.toArray(),
          closed: closed.toArray(),
          openPosition: [0, 0, 0],
          closedPosition: [0, 0.02, 0],
          openScale: [1, 1, 1],
          closedScale: [0.8, 1, 1],
        }
      }),
    ),
  }
  const tip = new THREE.Object3D()
  tip.name = 'tip'
  scene.getObjectByName('authored-0-2')!.add(tip)
  const load = vi.spyOn(GLTFLoader.prototype, 'loadAsync').mockResolvedValue({ scene } as never)
  const hand = new XRControllerHand()
  try {
    await hand.loadModel('/authored.glb')
    hand.update(
      {
        handedness: 'right',
        gamepad: { buttons: [{ value: 1 }, { value: 0.5 }] },
      } as unknown as XRInputSource,
      true,
    )
    expect(scene.getObjectByName('authored-0-1')!.quaternion.angleTo(closed)).toBeLessThan(1e-6)
    expect(
      scene.getObjectByName('authored-2-1')!.quaternion.angleTo(open.clone().slerp(closed, 0.5)),
    ).toBeLessThan(1e-6)
    expect(hand.indexTip.parent).toBe(tip)
    expect(scene.getObjectByName('authored-0-3')!.quaternion.angleTo(closed)).toBeLessThan(1e-6)
    expect(scene.getObjectByName('authored-2-1')!.position.y).toBeCloseTo(0.01)
    expect(scene.getObjectByName('authored-2-1')!.scale.x).toBeCloseTo(0.9)
  } finally {
    hand.dispose()
    load.mockRestore()
  }
})
