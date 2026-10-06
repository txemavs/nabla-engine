import fs from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { Group, Mesh, MeshStandardMaterial, SpotLight, type Object3D } from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { createA3Lights } from '../../src/catalog/presentation/a3-lamps.js'
import { presetVehicle } from '../../src/catalog/vehicles/library.js'
import { lightingDefaults } from '../../src/config/lighting.js'
import { createEntity } from '../../src/entity/schema.js'
import { AuthoredVehicleLights } from '../../src/render/vehicle-presentation/authored-lights.js'
import {
  VehicleLightController,
  type VehicleLightMode,
} from '../../src/render/vehicle-presentation/light-controller.js'
import { StartLights } from '../../src/render/vehicle-presentation/start-lights.js'
import { Simulation } from '../../src/simulation/simulation.js'
import { finishStartUp } from '../start-up.js'

const dt = 1 / 60
const powered = { powered: true, braking: false, reversing: false }

/** Parse a GLB without its textures (no DOM image decoding in node); emissive strength is kept. */
async function loadModel(file: string): Promise<Group> {
  const source = await fs.readFile(file)
  const length = source.readUInt32LE(12)
  const json = JSON.parse(source.subarray(20, 20 + length).toString())
  delete json.images
  delete json.textures
  delete json.samplers
  for (const material of json.materials ?? []) {
    for (const key of ['normalTexture', 'occlusionTexture', 'emissiveTexture']) delete material[key]
    delete material.pbrMetallicRoughness?.baseColorTexture
    delete material.pbrMetallicRoughness?.metallicRoughnessTexture
    const strength = material.extensions?.KHR_materials_emissive_strength
    delete material.extensions
    if (strength) material.extensions = { KHR_materials_emissive_strength: strength }
  }
  const text = Buffer.from(JSON.stringify(json))
  const padded = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 32)])
  const rest = source.subarray(20 + length)
  const header = Buffer.alloc(20)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(20 + padded.length + rest.length, 8)
  header.writeUInt32LE(padded.length, 12)
  header.writeUInt32LE(0x4e4f534a, 16)
  const bytes = Buffer.concat([header, padded, rest])
  const gltf = await new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    '',
  )
  return gltf.scene
}

function materials(model: Object3D, test: (material: MeshStandardMaterial) => boolean) {
  const found = new Set<MeshStandardMaterial>()
  model.traverse((node) => {
    if (node instanceof Mesh)
      for (const material of [node.material].flat())
        if (material instanceof MeshStandardMaterial && test(material)) found.add(material)
  })
  return [...found]
}

function beams(model: Object3D, channel: 'LowBeam' | 'HighBeam'): SpotLight[] {
  const spots: SpotLight[] = []
  model.traverse((node) => {
    if (!(node instanceof SpotLight)) return
    let owner: Object3D | null = node
    while (owner && owner.userData.role !== 'vehicle-light') owner = owner.parent
    if (owner?.userData.channel === channel) spots.push(node)
  })
  return spots
}

/** A flat floor with one library vehicle at rest on it. */
function scene(id: string, catalog: string, ignition = true): Simulation {
  const floor = createEntity('floor', 'box', [0, -0.5, 0])
  floor.size = [400, 1, 400]
  const vehicle = presetVehicle(catalog, id, [0, catalog === 'white-truck' ? 1.8 : 1.45, 0])
  return new Simulation(
    {
      version: 1,
      name: 'Start lights',
      entities: [floor, createEntity('spawn', 'spawn', [8, 3, 0]), vehicle],
    },
    { ignition },
  )
}

/** Step the simulation, sampling the start lights every frame like `SceneView.sync`. */
function drive(
  sim: Simulation,
  start: StartLights,
  controller: VehicleLightController,
  steps: number,
  each?: () => void,
) {
  for (let i = 0; i < steps; i++) {
    sim.step(dt)
    const id = sim.player.vehicleId
    start.update(id, id ? sim.vehicleInfo(id) : null, id ? controller : undefined)
    each?.()
  }
}

describe('light switch cycle (H)', () => {
  it('cycles off → position → low (dipped) → off, high beams only on dipped', () => {
    const controller = new VehicleLightController()
    const seen: VehicleLightMode[] = [controller.mode]
    for (let i = 0; i < 4; i++) seen.push(controller.cycleLights())
    expect(seen).toEqual(['off', 'position', 'low', 'off', 'position'])
    const level = (channel: Parameters<VehicleLightController['level']>[0]) =>
      controller.level(channel, 0, powered, 0)
    // Position: front and rear position lamps, no beam; a low-beam lens only glows faintly.
    expect([level('position'), level('tail-stop'), level('front-signal'), level('marker')]).toEqual(
      [1, 1, 1, 1],
    )
    expect([level('low'), level('high')]).toEqual([0, 0])
    expect(controller.glow('low', 0, powered, 0)).toBe(lightingDefaults.positionLensGlow)
    controller.highBeam = true
    expect(level('high')).toBe(0)
    controller.highBeam = false
    expect(controller.toggleLights()).toBe(true)
    expect(controller.mode).toBe('low')
    expect([level('position'), level('low'), level('high')]).toEqual([1, 1, 0])
    expect(controller.glow('low', 0, powered, 0)).toBe(1)
    controller.highBeam = true
    expect([level('low'), level('high')]).toEqual([0, 1])
    expect(controller.toggleLights()).toBe(false)
    expect([level('position'), level('tail-stop'), level('low'), level('high')]).toEqual([
      0, 0, 0, 0,
    ])
    expect(controller.glow('low', 0, { ...powered, powered: false }, 0)).toBe(0)
  })
})

describe('position lights after the engine start-up', () => {
  it('S3: dark while starting, then posición with the front and rear position lamps on', async () => {
    const model = await loadModel('assets/library/cars/a3/a3.cabrio.glb')
    const car = createA3Lights(model)
    const authored = new AuthoredVehicleLights(model, car.controller)
    const front = materials(model, (m) => m.name === 'FocoC')
    const rear = materials(model, (m) => m.name === 'PilotoP')
    expect(front.length).toBeGreaterThan(0)
    expect(rear.length).toBeGreaterThan(0)
    const low = beams(model, 'LowBeam')
    expect(low.length).toBe(2)
    const render = () => {
      car.update(powered, 0)
      authored.apply(powered, 0)
    }
    const start = new StartLights()
    const sim = scene('s3', 'car')
    try {
      drive(sim, start, car.controller, 30)
      sim.startInVehicle('s3')
      let sawCranking = false
      drive(sim, start, car.controller, 1, render)
      // P and held, starter, needle sweep: lights stay off until the engine runs.
      while (sim.vehicleInfo('s3').ignition !== 'running') {
        sawCranking ||= sim.vehicleInfo('s3').ignition === 'cranking'
        expect(car.controller.mode).toBe('off')
        for (const material of [...front, ...rear]) expect(material.emissiveIntensity).toBe(0)
        drive(sim, start, car.controller, 1, render)
      }
      expect(sawCranking).toBe(true)
      drive(sim, start, car.controller, 1, render)
      expect(car.controller.mode).toBe('position')
      for (const material of [...front, ...rear])
        expect(material.emissiveIntensity).toBeGreaterThan(0)
      for (const spot of low) expect(spot.intensity).toBe(0)
      // H keeps its cycle from here: cruce, apagadas, posición.
      expect(car.cycleLights()).toBe('low')
      render()
      for (const spot of low) expect(spot.intensity).toBeGreaterThan(0)
      expect(car.cycleLights()).toBe('off')
      render()
      for (const material of [...front, ...rear]) expect(material.emissiveIntensity).toBe(0)
      for (const spot of low) expect(spot.intensity).toBe(0)
      expect(car.cycleLights()).toBe('position')
      // The driver's choice survives the following frames.
      drive(sim, start, car.controller, 10)
      expect(car.controller.mode).toBe('position')
    } finally {
      authored.dispose()
      sim.dispose()
    }
  })

  it('truck: tail lamps and a front lens glow after the start-up, no beams', async () => {
    const tractor = await loadModel('assets/library/trucks/white-truck/assets/tractor.modern.glb')
    const tail = materials(tractor, (m) => m.userData.vehicleLightChannel === 'Tail_Stop')
    const lens = materials(tractor, (m) => m.userData.vehicleLightChannel === 'LowBeam')
    const authoredLens = lens.map((material) => material.emissiveIntensity)
    const lights = new AuthoredVehicleLights(tractor)
    expect(tail.length).toBeGreaterThan(0)
    expect(lens.length).toBeGreaterThan(0)
    const low = beams(tractor, 'LowBeam')
    expect(low.length).toBeGreaterThan(0)
    const start = new StartLights()
    const sim = scene('truck', 'white-truck')
    try {
      sim.startInVehicle('truck')
      drive(sim, start, lights.controller, 1)
      expect(sim.vehicleInfo('truck').ignition).not.toBe('running')
      expect(lights.controller.mode).toBe('off')
      finishStartUp({ step: () => drive(sim, start, lights.controller, 1) })
      expect(sim.vehicleInfo('truck').ignition).toBe('running')
      expect(lights.controller.mode).toBe('position')
      lights.apply(powered, 0)
      for (const material of tail) expect(material.emissiveIntensity).toBeGreaterThan(0)
      lens.forEach((material, i) => {
        expect(material.emissiveIntensity).toBeCloseTo(
          authoredLens[i] * lightingDefaults.positionLensGlow,
        )
      })
      for (const spot of low) expect(spot.intensity).toBe(0)
    } finally {
      lights.dispose()
      sim.dispose()
    }
  })

  it('ignition: false: posición at once on entry', () => {
    const controller = new VehicleLightController()
    const start = new StartLights()
    const sim = scene('s3', 'car', false)
    try {
      sim.startInVehicle('s3')
      expect(sim.vehicleInfo('s3').ignition).toBe('running')
      start.update('s3', sim.vehicleInfo('s3'), controller)
      expect(controller.mode).toBe('position')
    } finally {
      sim.dispose()
    }
  })

  it('a host can start in dipped beams or dark instead', () => {
    for (const mode of ['low', 'off'] as const) {
      const controller = new VehicleLightController()
      const start = new StartLights(mode)
      const sim = scene('s3', 'car')
      try {
        sim.startInVehicle('s3')
        finishStartUp({ step: () => drive(sim, start, controller, 1) })
        expect(controller.mode).toBe(mode)
      } finally {
        sim.dispose()
      }
    }
  })
})

describe('StartLights', () => {
  const cranking = { ignition: 'cranking', helm: 'car' }
  const running = { ignition: 'running', helm: 'car' }
  it('keeps an H choice made during the start-up', () => {
    const controller = new VehicleLightController()
    const start = new StartLights()
    start.update('car', cranking, controller)
    controller.cycleLights()
    controller.cycleLights()
    start.update('car', running, controller)
    expect(controller.mode).toBe('low')
  })
  it('switches off with the engine and back to posición when it runs again', () => {
    const controller = new VehicleLightController()
    const start = new StartLights()
    start.update('car', running, controller)
    expect(controller.mode).toBe('position')
    start.update('car', { ignition: 'running', helm: 'off' }, controller)
    expect(controller.mode).toBe('off')
    start.update('car', cranking, controller)
    expect(controller.mode).toBe('off')
    start.update('car', running, controller)
    expect(controller.mode).toBe('position')
  })
  it('re-entering starts dark again; a model that loads late still gets its lights', () => {
    const controller = new VehicleLightController()
    const start = new StartLights()
    start.update('car', running, controller)
    controller.cycleLights()
    start.update(null, null, undefined)
    start.update('car', cranking, controller)
    expect(controller.mode).toBe('off')
    const late = new VehicleLightController()
    start.update('truck', running, undefined)
    start.update('truck', running, late)
    expect(late.mode).toBe('position')
  })
})
