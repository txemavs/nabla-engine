/**
 * VFR800 cockpit pass: the GLB edits from scripts/prepare-vfr800-cockpit.mjs (mirror nodes,
 * instrument anchors, chrome exhaust, blended windscreen), the reflection environment and the live
 * instrument cluster (needle angles and lamp logic).
 */
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { describe, expect, it } from 'vitest'
import {
  MotorcycleInstruments,
  dialValues,
  lcdText,
  motorcycleClusterDefaults,
  needleAngle,
  warningLampStates,
  type ClusterInputs,
} from '../../src/render/vehicle-presentation/motorcycle-instruments.js'
import { applyReflectionEnvironment } from '../../src/render/vehicle-presentation/reflection-environment.js'

const bytes = readFileSync('assets/library/motorcycles/vfr800fi-1999/vfr800fi-1999.glb')
const load = async () =>
  (
    await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      '',
    )
  ).scene
const materialsOf = (object: THREE.Object3D) => {
  const out = new Set<THREE.MeshStandardMaterial>()
  object.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (mesh.isMesh)
      for (const m of [mesh.material].flat()) out.add(m as THREE.MeshStandardMaterial)
  })
  return [...out]
}

describe('vfr800 GLB cockpit pass', () => {
  it('has fairing-mounted mirror_L and mirror_R nodes with reflective glass', async () => {
    const root = await load()
    const body = root.getObjectByName('Body')!
    for (const [name, side] of [
      ['mirror_L', -1],
      ['mirror_R', 1],
    ] as const) {
      const mirror = root.getObjectByName(name)!
      expect(mirror, name).toBeTruthy()
      // Mounted on the fairing (Body), not on the steering.
      expect(mirror.parent).toBe(body)
      const box = new THREE.Box3().setFromObject(mirror)
      const size = box.getSize(new THREE.Vector3())
      expect(Math.sign(box.getCenter(new THREE.Vector3()).x)).toBe(side)
      // Plausible size: a housing and stalk some 15-35 cm wide, 5-20 cm tall.
      expect(size.x).toBeGreaterThan(0.15)
      expect(size.x).toBeLessThan(0.35)
      expect(size.y).toBeGreaterThan(0.05)
      expect(size.y).toBeLessThan(0.2)
      expect(materialsOf(mirror).some((m) => m.metalness >= 0.9 && m.roughness < 0.15)).toBe(true)
    }
  })

  it('keeps the exhaust bright polished chrome and gives it a reflection environment', async () => {
    const root = await load()
    const chrome = materialsOf(root).find((m) => m.name.startsWith('Chrome exhaust'))!
    expect(chrome.metalness).toBe(1)
    expect(chrome.roughness).toBeGreaterThanOrEqual(0.05)
    expect(chrome.roughness).toBeLessThanOrEqual(0.15)
    expect(Math.min(chrome.color.r, chrome.color.g, chrome.color.b)).toBeGreaterThan(0.6)
    const env = applyReflectionEnvironment(root)
    expect(chrome.envMap).toBeTruthy()
    expect(env.materials).toContain(chrome)
    // Matte paint and rubber are left alone.
    const rubber = materialsOf(root).find((m) => m.name === 'Smooth rubber')!
    expect(rubber.envMap).toBeNull()
  })

  it('blends a lighter smoked windscreen with reflections', async () => {
    const root = await load()
    const screen = materialsOf(root).find((m) => m.name.startsWith('Smoked translucent'))!
    expect(screen.transparent).toBe(true)
    expect(screen.opacity).toBeGreaterThan(0.15)
    expect(screen.opacity).toBeLessThan(0.4)
    expect(screen.depthWrite).toBe(false)
    expect((screen as THREE.MeshPhysicalMaterial).transmission ?? 0).toBe(0)
    applyReflectionEnvironment(root)
    expect(screen.envMap).toBeTruthy()
  })

  it('carries the instrument anchors and binds a live cluster to them', async () => {
    const root = await load()
    for (const name of [
      'gauge_speedo',
      'gauge_tacho',
      'gauge_lcd',
      'lamp_signal_l',
      'lamp_signal_r',
      'lamp_warning_1',
      'lamp_warning_4',
    ])
      expect(root.getObjectByName(name), name).toBeTruthy()
    const cluster = MotorcycleInstruments.bind(root)!
    expect(cluster).toBeTruthy()
    cluster.update({ ...inputs, speedKmh: 140, rpm: 6500, signalLeft: true })
    const o = motorcycleClusterDefaults
    expect(cluster.needleAngles().speedo).toBeCloseTo(needleAngle(140, o.speedoMaxKmh, o.sweep), 9)
    expect(cluster.needleAngles().tacho).toBeCloseTo(needleAngle(6500, o.tachoMaxRpm, o.sweep), 9)
    expect(cluster.lampStates().signals).toEqual([true, false])
    cluster.dispose()
  })
})

const inputs: ClusterInputs = {
  powered: true,
  ignition: 'running',
  gaugeSweep: 0,
  speedKmh: 0,
  rpm: 1200,
  gear: 3,
  parked: false,
  highBeam: false,
  signalLeft: false,
  signalRight: false,
  clockMinutes: 9 * 60 + 5,
  odometerKm: 12.34,
  tripKm: 12.34,
}

describe('motorcycle instrument logic', () => {
  const sweep = (240 * Math.PI) / 180

  it('maps needle angles across a centred sweep, clamped to the dial', () => {
    expect(needleAngle(0, 280, sweep)).toBeCloseTo(-sweep / 2, 12)
    expect(needleAngle(140, 280, sweep)).toBeCloseTo(0, 12)
    expect(needleAngle(280, 280, sweep)).toBeCloseTo(sweep / 2, 12)
    expect(needleAngle(400, 280, sweep)).toBeCloseTo(sweep / 2, 12)
    expect(needleAngle(-5, 280, sweep)).toBeCloseTo(-sweep / 2, 12)
    expect(needleAngle(Number.NaN, 280, sweep)).toBeCloseTo(-sweep / 2, 12)
  })

  it('sweeps both needles during the start-up self-test and rests them when off', () => {
    const o = motorcycleClusterDefaults
    expect(dialValues({ ...inputs, ignition: 'sweep', gaugeSweep: 0.5 }, o)).toEqual({
      speedKmh: o.speedoMaxKmh / 2,
      rpm: o.tachoMaxRpm / 2,
    })
    expect(dialValues({ ...inputs, powered: false, speedKmh: 90, rpm: 5000 }, o)).toEqual({
      speedKmh: 0,
      rpm: 0,
    })
  })

  it('lights neutral, high beam, oil and FI from the bike state', () => {
    const lamps = ['neutral', 'high-beam', 'oil', 'fi'] as const
    expect(warningLampStates(lamps, inputs)).toEqual([false, false, false, false])
    expect(warningLampStates(lamps, { ...inputs, gear: 0 })).toEqual([true, false, false, false])
    expect(warningLampStates(lamps, { ...inputs, parked: true })[0]).toBe(true)
    expect(warningLampStates(lamps, { ...inputs, highBeam: true })[1]).toBe(true)
    // Cranking: oil pressure and FI on. Needle sweep (engine caught): FI self-check only.
    expect(warningLampStates(lamps, { ...inputs, ignition: 'cranking' })).toEqual([
      false,
      false,
      true,
      true,
    ])
    expect(warningLampStates(lamps, { ...inputs, ignition: 'sweep' })).toEqual([
      false,
      false,
      false,
      true,
    ])
    expect(warningLampStates(lamps, { ...inputs, powered: false, gear: 0 })).toEqual([
      false,
      false,
      false,
      false,
    ])
  })

  it('shows clock, gear and distances on the LCD', () => {
    expect(lcdText(inputs)).toEqual({
      clock: '09:05',
      gear: '3',
      odometer: 'ODO 000012',
      trip: 'TRIP  12.3',
    })
    expect(lcdText({ ...inputs, gear: 0 })!.gear).toBe('N')
    expect(lcdText({ ...inputs, powered: false })).toBeNull()
  })
})
