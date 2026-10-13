import { expect, it } from 'vitest'
import { Group, Quaternion, Vector3 } from 'three'
import { extendedWeaponPose } from '../../src/runtime/world-weapon-pose.js'
import { weaponViewTuning } from '../../src/config/gameplay-tuning.js'

it('extends from the shoulder and aims at elevated and lateral targets under a rotated avatar', () => {
  const avatar = new Group(),
    weapon = new Group()
  avatar.position.set(120, 40, -70)
  avatar.rotation.set(0.2, 1.3, -0.1)
  avatar.add(weapon)
  for (const offset of [
    [10, 8, -20],
    [-12, -5, 9],
    [0, 15, -1],
  ]) {
    const target = avatar.position.clone().add(new Vector3(...offset))
    extendedWeaponPose(weapon, avatar, target, new Vector3(0, 1, 0))
    const hand = weapon.getWorldPosition(new Vector3())
    const shoulder = avatar.localToWorld(new Vector3(...weaponViewTuning.thirdPerson.shoulder))
    expect(hand.distanceTo(shoulder)).toBeCloseTo(weaponViewTuning.thirdPerson.reachMetres)
    const barrel = new Vector3(0, 0, -1).applyQuaternion(
      weapon.getWorldQuaternion(new Quaternion()),
    )
    expect(barrel.dot(target.clone().sub(hand).normalize())).toBeCloseTo(1)
  }
})
