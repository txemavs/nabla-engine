import { expect, it } from 'vitest'
import { Group, PerspectiveCamera, Vector3 } from 'three'
import { sidearmAimRay } from '../../src/runtime/shooting.js'
import type { Sidearm } from '../../src/runtime/sidearm.js'
import type { Simulation } from '../../src/simulation/simulation.js'
import type { SceneView } from '../../src/render/entity/view.js'

it('fires along the mounted barrel rather than the camera centre in first person', () => {
  const camera = new PerspectiveCamera()
  camera.position.set(100, 2, 4)
  camera.rotation.y = 0.8
  const origin = new Vector3(0.2, -0.1, -0.4)
  const direction = new Vector3(-0.3, 0.2, -1).normalize()
  const sidearm = {
    accessoryRay: () => ({ origin: origin.clone(), target: origin.clone().add(direction) }),
  } as unknown as Sidearm
  const shot = sidearmAimRay(sidearm, {} as Simulation, {} as SceneView, camera, true, 123)
  expect(
    shot.origin.distanceTo(origin.applyQuaternion(camera.quaternion).add(camera.position)),
  ).toBeLessThan(1e-8)
  expect(shot.direction.dot(direction.applyQuaternion(camera.quaternion))).toBeCloseTo(1)
})

it('converges from the third-person muzzle to the camera hit after a floating-origin shift', () => {
  const root = new Group()
  root.position.set(-1000, 0, 0)
  const camera = new PerspectiveCamera()
  camera.position.set(1000, 2, 5)
  const target = new Vector3(1000, 2, -10)
  const sidearm = {
    accessoryRay: () => null,
    range: 150,
    worldMuzzle: () => new Vector3(0.5, 1.6, 0),
    aimDirection: () => {
      throw Error('Third person must not inherit bodycam offsets')
    },
  } as unknown as Sidearm
  const sim = {
    renderPlayerPosition: [1000, 2, 0],
    shoot: () => ({ point: target.toArray() }),
  } as unknown as Simulation
  const shot = sidearmAimRay(sidearm, sim, { root } as SceneView, camera, false)
  expect(shot.origin.toArray()).toEqual([1000.5, 1.6, 0])
  expect(shot.direction.dot(target.sub(shot.origin).normalize())).toBeCloseTo(1)
})

it('aligns the neutral barrel while retaining the reviewed gesture rotation', async () => {
  const { Sidearm } = await import('../../src/runtime/sidearm.js')
  const { normalizeWeaponPoses } = await import('../../src/runtime/weapon-pose-tuning.js')
  const { Quaternion, Euler } = await import('three')
  const model = new Group(),
    muzzle = new Group()
  muzzle.name = 'MuzzleSocket'
  muzzle.position.set(0, 0, -0.135)
  model.position.set(0.1, -0.125, -0.34)
  model.add(muzzle)
  const rig = Object.assign(Object.create(Sidearm.prototype), {
    model,
    aimBlend: 0,
    poseTuning: normalizeWeaponPoses(),
    tuning: { height: -0.049, angle: -1.2 },
    bodycamEnabled: false,
    flashAt: [0, 0, -0.135],
  })
  rig.alignViewAim(70)
  const aligned = model.quaternion.clone()
  const direction = new Vector3(0, 0, -1).applyQuaternion(aligned)
  expect(
    direction.dot(new Vector3(0, 0, -25).sub(muzzle.getWorldPosition(new Vector3())).normalize()),
  ).toBeCloseTo(1, 8)
  const gesture = new Quaternion().setFromEuler(new Euler(0.7, -0.4, 0.3))
  model.quaternion.copy(gesture)
  rig.alignViewAim(70)
  expect(aligned.invert().multiply(model.quaternion).angleTo(gesture)).toBeLessThan(1e-6)
})

it.each(['normal', 'aimed'] as const)(
  'keeps all user rotation axes in the %s pose after alignment',
  async (pose) => {
    const { Sidearm } = await import('../../src/runtime/sidearm.js')
    const { normalizeWeaponPoses } = await import('../../src/runtime/weapon-pose-tuning.js')
    const { sidearmTuningDefaults } = await import('../../src/runtime/sidearm-tuning.js')
    const { Euler } = await import('three')
    const model = new Group(),
      muzzle = new Group()
    muzzle.name = 'MuzzleSocket'
    muzzle.position.set(0, 0, -0.135)
    model.add(muzzle)
    const t = pose === 'aimed' ? 1 : 0
    const rig = Object.assign(Object.create(Sidearm.prototype), {
      model,
      aimBlend: t,
      poseTuning: normalizeWeaponPoses(),
      tuning: { ...sidearmTuningDefaults },
      bodycamEnabled: false,
      flashAt: [0, 0, -0.135],
    })
    model.position.set(0.1 * (1 - t), sidearmTuningDefaults.height, -0.2)
    const factoryPitch = ((sidearmTuningDefaults.angle * Math.PI) / 180) * t
    model.rotation.set(factoryPitch, 0, 0)
    rig.alignViewAim(70)
    const baseline = model.quaternion.clone()
    for (const [axis, component] of [
      ['pitch', 'x'],
      ['yaw', 'y'],
      ['roll', 'z'],
    ] as const) {
      rig.poseTuning = normalizeWeaponPoses()
      rig.poseTuning[pose][axis] = 20
      const rotation = new Euler(factoryPitch, 0, 0)
      rotation[component] += (20 * Math.PI) / 180
      model.quaternion.setFromEuler(rotation)
      rig.alignViewAim(70)
      expect(baseline.angleTo(model.quaternion), axis).toBeGreaterThan(0.3)
    }
    if (t) {
      rig.poseTuning = normalizeWeaponPoses()
      rig.tuning.angle += 10
      model.rotation.set((rig.tuning.angle * Math.PI) / 180, 0, 0)
      rig.alignViewAim(70)
      expect(baseline.angleTo(model.quaternion)).toBeGreaterThan(0.15)
    }
  },
)

it('rupture separates nested barrel, slide, magazine and frame once', async () => {
  const { Sidearm } = await import('../../src/runtime/sidearm.js')
  const model = new Group(),
    slide = new Group(),
    barrel = new Group(),
    magazine = new Group()
  slide.name = 'Slide'
  barrel.name = 'Barrel'
  magazine.name = 'Magazine'
  slide.add(barrel)
  model.add(slide, magazine)
  const rig = new Group()
  rig.add(model)
  const arm = Object.assign(Object.create(Sidearm.prototype), {
    broken: false,
    assembledModel: model,
    model,
    viewRig: rig,
    release: () => {},
  }) as Sidearm
  const parts = arm.ruptureParts(new PerspectiveCamera(), new Group(), true)!
  expect(parts.children.map((p) => p.name).sort()).toEqual([
    'Barrel',
    'Broken pistol frame',
    'Magazine',
    'Slide',
  ])
  expect(parts.getObjectByName('Slide')!.children).toHaveLength(0)
  expect(arm.broken).toBe(true)
  expect(arm.ruptureParts(new PerspectiveCamera(), new Group(), true)).toBeNull()
})

it('rupture excludes the long hidden laser and smoke from physical bounds', async () => {
  const { Sidearm } = await import('../../src/runtime/sidearm.js')
  const {
    Box3,
    BoxGeometry,
    Mesh,
    MeshBasicMaterial,
    Line,
    BufferGeometry,
    Float32BufferAttribute,
  } = await import('three')
  const model = new Group(),
    assembly = new Group(),
    rig = new Group()
  assembly.add(new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial()))
  model.add(assembly)
  rig.add(model)
  const beam = new Line(
    new BufferGeometry().setAttribute(
      'position',
      new Float32BufferAttribute([0, 0, 0, 0, 0, -100], 3),
    ),
  )
  beam.visible = false
  model.add(beam)
  const arm = Object.assign(Object.create(Sidearm.prototype), {
    broken: false,
    assembledModel: assembly,
    model,
    viewRig: rig,
    release: () => {},
  }) as Sidearm
  const parts = arm.ruptureParts(new PerspectiveCamera(), new Group(), true)!
  const size = new Box3().setFromObject(parts).getSize(new Vector3())
  expect(size.z).toBeCloseTo(0.2)
  expect(parts.children[0].children).toHaveLength(1)
})
