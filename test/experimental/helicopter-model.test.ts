import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import * as T from 'three'
import { assets } from '../../src/render/entity/assets.js'
import { ARDrone } from '../../src/experimental/betaflight/ar-drone.js'
import { World, initPhysics } from '../../src/simulation/physics.js'
beforeAll(async () => {
  await initPhysics()
})
afterEach(() => vi.restoreAllMocks())
const fixture = () => {
  const root = new T.Group()
  for (const name of ['Main_Rotor', 'Tail_Rotor']) {
    const pivot = new T.Group()
    pivot.name = name
    root.add(pivot)
  }
  return root
}
const pads = () =>
  ['left', 'right'].map(
    (handedness) =>
      ({
        handedness,
        gamepad: {
          axes: [0, 0, 0.15, -0.1],
          buttons: Array.from({ length: 6 }, () => ({ pressed: false, value: 0 })),
        },
      }) as unknown as XRInputSource,
  )
it('replaces only the visual model and preserves the exact Betaflight trajectory', async () => {
  vi.spyOn(assets, 'instantiate').mockResolvedValue(fixture())
  const worlds = [new World(), new World()],
    scene = new T.Scene(),
    camera = new T.PerspectiveCamera()
  camera.position.y = 1.6
  const old = new ARDrone(scene, () => worlds[0]),
    heli = new ARDrone(scene, () => worlds[1])
  try {
    old.spawn(camera)
    expect(await heli.spawnModel(camera, '/heli.glb')).toBe(true)
    const sources = pads()
    old.setArmed(true)
    heli.setArmed(true)
    for (let i = 0; i < 180; i++)
      for (const [index, drone] of [old, heli].entries()) {
        drone.readInput(sources, 1 / 90)
        drone.beforeStep(1 / 90)
        worlds[index].step(1 / 90)
        drone.sync(1 / 90)
      }
    expect(
      new T.Vector3()
        .copy(old.flight!.body.translation())
        .distanceTo(heli.flight!.body.translation()),
    ).toBeLessThan(1e-7)
    expect(heli.flight!.body.rotation()).toEqual(old.flight!.body.rotation())
    expect(heli.root!.getObjectByName('Main_Rotor')!.rotation.y).not.toBe(0)
    expect(heli.root!.getObjectByName('Tail_Rotor')!.rotation.x).not.toBe(0)
    expect(heli.hasSpotlight).toBe(true)
    expect(old.hasSpotlight).toBe(false)
    expect(heli.spotlightEnabled).toBe(false)
    const buttons = sources[0].gamepad!.buttons as GamepadButton[]
    buttons[4] = { pressed: true, value: 1 } as GamepadButton
    heli.readInput(sources, 1 / 90)
    expect(heli.spotlightEnabled).toBe(true)
    heli.readInput(sources, 1 / 90)
    expect(heli.spotlightEnabled).toBe(true)
    buttons[4] = { pressed: false, value: 0 } as GamepadButton
    heli.readInput(sources, 1 / 90)
    buttons[4] = { pressed: true, value: 1 } as GamepadButton
    heli.readInput(sources, 1 / 90)
    expect(heli.spotlightEnabled).toBe(false)
  } finally {
    old.clear()
    heli.clear()
    worlds.forEach((w) => w.raw.free())
  }
})
it('discards a model that finishes loading after the aircraft has been removed', async () => {
  let resolve!: (group: T.Group) => void
  vi.spyOn(assets, 'instantiate').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const world = new World(),
    drone = new ARDrone(new T.Scene(), () => world)
  try {
    const pending = drone.spawnModel(new T.PerspectiveCamera(), '/heli.glb')
    drone.clear()
    resolve(fixture())
    expect(await pending).toBe(false)
    expect(drone.root).toBeNull()
    expect(drone.flight).toBeNull()
  } finally {
    drone.clear()
    world.raw.free()
  }
})
