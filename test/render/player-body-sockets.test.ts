import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { PlayerBody, WEAPON_SOCKET } from '../../src/render/entity/player-body.js'

function body(): { body: PlayerBody; holstered: THREE.Object3D; socket: THREE.Object3D } {
  const model = new THREE.Group()
  const hand = new THREE.Object3D()
  hand.position.set(0.3, 1, 0.1)
  const socket = new THREE.Object3D()
  socket.name = WEAPON_SOCKET
  socket.rotation.set(0.3, -0.4, 0.2)
  hand.add(socket)
  const holstered = new THREE.Group()
  holstered.userData.nabla_holstered = true
  model.add(hand, holstered)
  return { body: new PlayerBody(model, []), holstered, socket }
}

describe('player body sockets', () => {
  it('finds the weapon socket and toggles the holstered weapon', () => {
    const { body: b, holstered } = body()
    expect(b.weaponSocket?.name).toBe(WEAPON_SOCKET)
    expect(b.hasHolster).toBe(true)
    b.setHolstered(false)
    expect(holstered.visible).toBe(false)
    b.setHolstered(true)
    expect(holstered.visible).toBe(true)
  })

  it('puts the weapon grip on the hand socket', () => {
    const { body: b, socket } = body()
    const parent = new THREE.Group()
    parent.position.set(2, 0, -1)
    parent.add(b.root)
    const weapon = new THREE.Group()
    const grip = new THREE.Object3D()
    grip.name = 'GripSocket'
    grip.position.set(0, 0.049, 0.015)
    weapon.add(grip)
    parent.add(weapon)
    expect(b.holdAtHand(weapon)).toBe(true)
    parent.updateMatrixWorld(true)
    const at = grip.getWorldPosition(new THREE.Vector3())
    const want = socket.getWorldPosition(new THREE.Vector3())
    expect(at.distanceTo(want)).toBeLessThan(1e-6)
    const q = grip.getWorldQuaternion(new THREE.Quaternion())
    expect(q.angleTo(socket.getWorldQuaternion(new THREE.Quaternion()))).toBeLessThan(1e-6)
  })

  it('keeps the aim when asked and only moves the grip', () => {
    const { body: b, socket } = body()
    const parent = new THREE.Group()
    parent.add(b.root)
    const weapon = new THREE.Group()
    weapon.rotation.y = 0.7
    parent.add(weapon)
    b.holdAtHand(weapon, true)
    expect(weapon.rotation.y).toBeCloseTo(0.7)
    parent.updateMatrixWorld(true)
    expect(
      weapon
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(socket.getWorldPosition(new THREE.Vector3())),
    ).toBeLessThan(1e-6)
  })
})
