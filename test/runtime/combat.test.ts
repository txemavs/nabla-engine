import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { PlayerBody } from '../../src/render/entity/player-body.js'
import { rayCapsule } from '../../src/render/entity/hit-volumes.js'
import { Combat, CHARACTER_HIT_PREFIX, type CombatHitReport } from '../../src/runtime/combat.js'

/** A stick figure on the mixamorig names: hips, spine, neck, head, one arm, one leg. */
function figure(): PlayerBody {
  const model = new THREE.Group()
  const bone = (name: string, parent: THREE.Object3D, y: number, x = 0) => {
    const b = new THREE.Bone()
    b.name = name
    b.position.set(x, y, 0)
    parent.add(b)
    return b
  }
  const hips = bone('mixamorigHips', model, 0.95)
  const spine = bone('mixamorigSpine', hips, 0.1)
  const spine2 = bone('mixamorigSpine2', spine, 0.25)
  const neck = bone('mixamorigNeck', spine2, 0.15)
  const head = bone('mixamorigHead', neck, 0.1)
  bone('mixamorigHeadTop_End', head, 0.2)
  const arm = bone('mixamorigRightArm', spine2, 0.1, -0.2)
  bone('mixamorigRightForeArm', arm, -0.3)
  const leg = bone('mixamorigRightUpLeg', hips, -0.05, -0.1)
  bone('mixamorigRightLeg', leg, -0.45)
  return new PlayerBody(model, [])
}

function setup(online = false) {
  const reports: CombatHitReport[] = []
  let now = 0
  let respawned = 0
  const combat = new Combat({
    now: () => now,
    sceneOffset: () => new THREE.Vector3(),
    respawnLocal: () => respawned++,
  })
  if (online) combat.onHit = (hit) => reports.push(hit)
  const body = figure()
  body.root.position.set(0, 0, -5)
  body.root.updateMatrixWorld(true)
  combat.addTarget('peer', body)
  return { combat, body, reports, tick: (t: number) => (now = t), respawned: () => respawned }
}

describe('combat', () => {
  it('ray-capsule entry distance', () => {
    const d = rayCapsule(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, -1, -5),
      new THREE.Vector3(0, 1, -5),
      0.5,
    )
    expect(d).toBeCloseTo(4.5, 3)
    expect(
      rayCapsule(
        new THREE.Vector3(2, 0, 0),
        new THREE.Vector3(0, 0, -1),
        new THREE.Vector3(0, -1, -5),
        new THREE.Vector3(0, 1, -5),
        0.5,
      ),
    ).toBeNull()
  })

  it('finds the zone a ray hits', () => {
    const { combat } = setup()
    expect(combat.raycast([0, 1.6, 0], [0, 0, -1], 50)?.zone).toBe('head')
    expect(combat.raycast([0, 1.42, 0], [0, 0, -1], 50)?.zone).toBe('neck')
    expect(combat.raycast([0, 1.15, 0], [0, 0, -1], 50)?.zone).toBe('torso')
    expect(combat.raycast([0.1, 0.6, 0], [0, 0, -1], 50)?.zone).toBe('leg')
    expect(combat.raycast([1, 1.6, 0], [0, 0, -1], 50)).toBeNull()
    // A wall in front stops the shot first.
    expect(combat.raycast([0, 1.6, 0], [0, 0, -1], 3)).toBeNull()
  })

  it('offline: applies damage, dies, respawns after 5 s', () => {
    const { combat, body, tick } = setup()
    const query = combat.shotQuery(() => null, 'hk-compact', 25)
    const hit = query([0, 1.6, 0], [0, 0, -1], 100)
    expect(hit?.entityId).toBe(CHARACTER_HIT_PREFIX + 'peer')
    expect(combat.health('peer')).toBe(0)
    expect(combat.isDead('peer')).toBe(true)
    expect(body.collapsed).toBe(true)
    // The dead are not hit again.
    expect(combat.raycast([0, 1.6, 0], [0, 0, -1], 50)).toBeNull()
    tick(5)
    combat.update()
    expect(combat.health('peer')).toBe(100)
    expect(body.collapsed).toBe(false)
  })

  it('online: reports the hit, health comes from the relay', () => {
    const { combat, reports } = setup(true)
    combat.shotQuery(() => null, 'hk-compact', 25)([0, 1.15, 0], [0, 0, -1], 100)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      targetId: 'peer',
      zone: 'torso',
      weapon: 'hk-compact',
      damage: 25,
    })
    expect(combat.health('peer')).toBe(100)
    combat.applyHealth('peer', 75)
    expect(combat.health('peer')).toBe(75)
    combat.applyDeath('peer')
    expect(combat.isDead('peer')).toBe(true)
    combat.applyRespawn('peer', [1, 0, 1])
    expect(combat.health('peer')).toBe(100)
  })

  it('a world hit nearer than the body wins', () => {
    const { combat } = setup()
    const wall = {
      point: [0, 1.6, -2] as [number, number, number],
      normal: [0, 0, 1] as [number, number, number],
      entityId: null,
    }
    const hit = combat.shotQuery(() => wall, 'hk-compact', 25)([0, 1.6, 0], [0, 0, -1], 100)
    expect(hit).toBe(wall)
    expect(combat.health('peer')).toBe(100)
  })
})
