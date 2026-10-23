import { describe, expect, it } from 'vitest'
import {
  HIT_ZONES,
  HealthLedger,
  MAX_HEALTH,
  boneBaseName,
  weaponBaseDamage,
  zoneDamage,
  zoneOfBone,
} from '../../src/simulation/combat/damage.js'

describe('combat damage rules', () => {
  it('has the spec multipliers', () => {
    expect(Object.fromEntries(HIT_ZONES.map((z) => [z.id, z.multiplier]))).toEqual({
      head: 4,
      neck: 2.5,
      torso: 1,
      arm: 0.6,
      leg: 0.75,
    })
    expect(zoneDamage(25, 'head')).toBe(100)
    expect(zoneDamage(25, 'neck')).toBe(63)
    expect(zoneDamage(25, 'torso')).toBe(25)
    expect(zoneDamage(25, 'arm')).toBe(15)
    expect(zoneDamage(25, 'leg')).toBe(19)
  })

  it('maps mixamorig bones to zones whatever the prefix', () => {
    expect(boneBaseName('mixamorig:Head')).toBe('Head')
    expect(boneBaseName('mixamorigHead')).toBe('Head')
    expect(zoneOfBone('mixamorigNeck')?.id).toBe('neck')
    expect(zoneOfBone('mixamorig:Spine2')?.id).toBe('torso')
    expect(zoneOfBone('mixamorigLeftForeArm')?.id).toBe('arm')
    expect(zoneOfBone('mixamorigRightUpLeg')?.id).toBe('leg')
    expect(zoneOfBone('mixamorigRightHandIndex1')).toBeNull()
    expect(zoneOfBone('mixamorigHeadTop_End')).toBeNull()
  })

  it('takes base damage from the preset, else the kind default', () => {
    expect(weaponBaseDamage({ damage: 25 })).toBe(25)
    expect(weaponBaseDamage({})).toBe(20)
    expect(weaponBaseDamage({ kind: 'bow' })).toBe(35)
    expect(weaponBaseDamage({ kind: 'melee' })).toBe(30)
    expect(weaponBaseDamage({ kind: 'placeholder' })).toBe(0)
  })

  it('kills at 0, ignores hits on the dead and respawns after 5 s', () => {
    const ledger = new HealthLedger()
    expect(ledger.get('a').health).toBe(MAX_HEALTH)
    expect(ledger.damage('a', 63, 1)).toEqual({ health: 37, died: false, dealt: 63 })
    expect(ledger.damage('a', 100, 2)).toEqual({ health: 0, died: true, dealt: 37 })
    expect(ledger.damage('a', 10, 3).dealt).toBe(0)
    expect(ledger.due(6.9)).toEqual([])
    expect(ledger.due(7)).toEqual(['a'])
    expect(ledger.respawn('a').health).toBe(100)
    expect(ledger.snapshot()).toEqual({ a: 100 })
  })
})
