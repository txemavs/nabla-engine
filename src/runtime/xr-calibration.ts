import { createSettingsStore, type SettingsStorage } from './settings-scope.js'
import * as THREE from 'three'

export const xrCalibrationObjects = {
  'hand-left': 'Mano',
  'hand-right': 'Mano derecha',
  'grip-left': 'Pistola',
  'grip-right': 'Pistola en mano derecha',
  'pistol-0': 'Pistola en funda',
  'pistol-1': 'Pistola en funda derecha',
  'holster-0': 'Funda',
  'holster-1': 'Funda derecha',
  'magazine-normal': 'Cargador normal (objeto)',
  'magazine-long': 'Cargador largo (objeto)',
  'pocket-0': 'Cargadores · pecho',
  'pocket-1': 'Cargador largo · pecho',
  'bike-controls': 'Moto · gas, dirección y frenos',
  'bike-left': 'Manillar',
  'bike-right': 'Moto · puño derecho',
  'ar-rc-s3': 'AR · Puesto S3',
  'ar-rc-truck': 'AR · Puesto camión',
  'ar-rc-forklift': 'AR · Volante toro',
  'ar-rc-forklift-levers': 'AR · Palancas toro',
  'ar-rc-bike': 'AR · Puesto moto',
} as const
export type XRCalibrationObject = keyof typeof xrCalibrationObjects
export type XRPoseAdjustment = {
  x: number
  y: number
  z: number
  rx: number
  ry: number
  rz: number
}
const mirrorPairs: [XRCalibrationObject, XRCalibrationObject][] = [
  ['hand-right', 'hand-left'],
  ['pocket-1', 'pocket-0'],
  ['bike-right', 'bike-left'],
  ['grip-left', 'grip-right'],
  ['pistol-0', 'pistol-1'],
  ['holster-0', 'holster-1'],
]
const mirrored = (p: XRPoseAdjustment): XRPoseAdjustment => ({
  x: -p.x || 0,
  y: p.y,
  z: p.z,
  rx: p.rx,
  ry: -p.ry || 0,
  rz: -p.rz || 0,
})
const bikeDefaults: XRPoseAdjustment = { x: 45, y: 3, z: 30, rx: 100, ry: 100, rz: 1 }
const zero = (): XRPoseAdjustment => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 })
// Keep older storage intact; V5 accepts the new left-hand zero and carries its grip with it.
const storageKey = 'nabla.xr.calibration.v5'
export const xrCalibrationBaseline = '2026-10-15-hand-zero'
export const xrHandZero: XRPoseAdjustment = { x: -2, y: -1, z: 0.5, rx: -20, ry: -10, rz: 0 }
const defaults: Partial<Record<XRCalibrationObject, Partial<XRPoseAdjustment>>> = {
  'ar-rc-s3': { ry: 180 },
  'ar-rc-truck': { ry: 180 },
  'ar-rc-forklift': { ry: 180 },
  'hand-right': { x: 1, rx: -45, rz: -70 },
  'hand-left': { x: -1, rx: -45, rz: 70 },
  'pistol-0': { rx: 90 },
  'pistol-1': { rx: 90 },
  'holster-0': { x: 5, y: 10, z: 15 },
  'holster-1': { x: -5, y: 10, z: 15 },
  'pocket-0': { z: 25 },
  'pocket-1': { z: 25 },
  // In hand, the supplied grip -90° and the former shared pistol +90° cancel.
  // Keeping that composed pose here lets holstered adjustments become independent.
}
// Compose the accepted V2 adjustments after the previous baseline rotation.
const baselineAdjustments: Partial<Record<XRCalibrationObject, Partial<XRPoseAdjustment>>> = {
  'ar-rc-truck': { rx: 20, rz: 180 },
  'hand-left': { x: 1, z: 0.5, rx: 3, ry: 23, rz: 4 },
  'hand-right': { x: -1, z: 0.5, rx: 3, ry: -23, rz: -4 },
  'grip-left': { x: 1.5, rx: 6, ry: -12, rz: -6 },
  'grip-right': { x: -1.5, rx: 6, ry: 12, rz: 6 },
  'pistol-0': {},
  'pistol-1': {},
  'holster-0': { y: -2.5, z: 5 },
  'holster-1': { y: -2.5, z: 5 },
  'pocket-0': { x: 8 },
  'pocket-1': { x: -8 },
}
const cleanAngle = (n: number) => (Math.abs(n) < 1e-8 ? 0 : n)
const rotation = (p: XRPoseAdjustment) =>
  new THREE.Quaternion().setFromEuler(
    new THREE.Euler(
      THREE.MathUtils.degToRad(p.rx),
      THREE.MathUtils.degToRad(p.ry),
      THREE.MathUtils.degToRad(p.rz),
      'XYZ',
    ),
  )

/** A rigid change in controller coordinates keeps the former hand-to-pistol relationship. */
const handRebases = Object.fromEntries(
  (['left', 'right'] as const).map((side) => {
    const id = `hand-${side}` as const
    const delta = side === 'left' ? xrHandZero : mirrored(xrHandZero)
    const baked = { ...zero(), ...defaults[id] }
    const accepted = { ...zero(), ...baselineAdjustments[id] }
    const before = rotation(baked).multiply(rotation(accepted))
    return [
      side,
      {
        delta,
        before: new THREE.Vector3(
          baked.x + accepted.x,
          baked.y + accepted.y,
          baked.z + accepted.z,
        ).multiplyScalar(0.01),
        translation: new THREE.Vector3(delta.x, delta.y, delta.z).multiplyScalar(0.01),
        rotation: before.clone().multiply(rotation(delta)).multiply(before.clone().invert()),
      },
    ]
  }),
) as Record<
  'left' | 'right',
  {
    delta: XRPoseAdjustment
    before: THREE.Vector3
    translation: THREE.Vector3
    rotation: THREE.Quaternion
  }
>

/** Local offsets from the authored pose: centimetres and degrees, never tracking coordinates. */
export class XRCalibration {
  motorcycleStatus = 'Agarra el manillar para calibrar'
  private poses: Partial<Record<XRCalibrationObject, XRPoseAdjustment>> = {}
  private bases = new WeakMap<
    THREE.Object3D,
    { position: THREE.Vector3; rotation: THREE.Quaternion }
  >()
  constructor(private readonly storage: SettingsStorage = createSettingsStore()) {
    try {
      const current = this.storage.getItem(storageKey)
      const saved = current ?? this.storage.getItem('nabla.xr.calibration.v4')
      const previous = this.storage.getItem('nabla.xr.calibration.v3')
      const stored = saved
        ? JSON.parse(saved)
        : previous
          ? JSON.parse(previous)
          : Object.fromEntries(
              Object.entries(
                JSON.parse(this.storage.getItem('nabla.xr.calibration.v2') ?? '{}'),
              ).filter(([id]) => !(id in baselineAdjustments)),
            )
      // Rebase the old wheel Euler pose exactly, preserving position and other angles.
      if (!saved)
        for (const id of ['ar-rc-s3', 'ar-rc-truck']) {
          const old = stored[id]
          if (!old || !Number.isFinite(old.ry) || old.ry === 0) continue
          const q = rotation({ ...zero(), ...old })
          q.premultiply(rotation({ ...zero(), ry: -180 }))
          const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
          stored[id] = {
            ...old,
            rx: THREE.MathUtils.radToDeg(e.x),
            ry: THREE.MathUtils.radToDeg(e.y),
            rz: THREE.MathUtils.radToDeg(e.z),
          }
        }
      if (!current) {
        for (const side of ['left', 'right'] as const) {
          const { delta, rotation: change } = handRebases[side]
          const hand = stored[`hand-${side}`]
          if (hand) {
            const old = { ...zero(), ...hand }
            const q = rotation(delta).invert().multiply(rotation(old))
            const e = new THREE.Euler().setFromQuaternion(q, 'XYZ')
            stored[`hand-${side}`] = {
              x: old.x - delta.x,
              y: old.y - delta.y,
              z: old.z - delta.z,
              rx: cleanAngle(THREE.MathUtils.radToDeg(e.x)),
              ry: cleanAngle(THREE.MathUtils.radToDeg(e.y)),
              rz: cleanAngle(THREE.MathUtils.radToDeg(e.z)),
            }
          }
          const grip = stored[`grip-${side}`]
          if (grip) {
            const offset = new THREE.Vector3(grip.x || 0, grip.y || 0, grip.z || 0).applyQuaternion(
              change,
            )
            stored[`grip-${side}`] = { ...grip, x: offset.x, y: offset.y, z: offset.z }
          }
        }
      }
      // Accepted truck posture is the new zero; keep position and the other angle.
      if (this.storage.getItem('nabla.xr.truck-zero') !== 'x20-z180') {
        if (stored['ar-rc-truck'])
          stored['ar-rc-truck'] = { ...stored['ar-rc-truck'], rx: 0, rz: 0 }
        try {
          this.storage.setItem(storageKey, JSON.stringify(stored))
          this.storage.setItem('nabla.xr.truck-zero', 'x20-z180')
        } catch {
          // A read-only store must not discard the adjustments already read.
        }
      }
      for (const id of Object.keys(xrCalibrationObjects) as XRCalibrationObject[]) {
        // Prefer the saved left hand; pistol pairs keep the saved right side.
        const pair = mirrorPairs.find((pair) => pair.includes(id))
        if (pair && id === pair[0] && stored[pair[1]]) continue
        if (stored[id]) this.set(id, stored[id], false)
      }
      if (!current) {
        try {
          this.storage.setItem(storageKey, JSON.stringify(this.poses))
        } catch {
          /* Live poses still work. */
        }
      }
    } catch {
      /* Storage is optional in private browsing and server-side tests. */
    }
  }
  fields(id: XRCalibrationObject) {
    return id === 'bike-controls'
      ? {
          x: { label: 'Recorrido gas', unit: '°', step: 1 },
          y: { label: 'Zona muerta gas', unit: '°', step: 1 },
          z: { label: 'Recorrido dirección', unit: '°', step: 1 },
          rx: { label: 'Freno delantero', unit: '%', step: 5 },
          ry: { label: 'Freno trasero', unit: '%', step: 5 },
          rz: { label: 'Sentido gas ±1', unit: '', step: 2 },
        }
      : {
          x: { label: 'Posición X', unit: 'cm', step: 0.5 },
          y: { label: 'Posición Y', unit: 'cm', step: 0.5 },
          z: { label: 'Posición Z', unit: 'cm', step: 0.5 },
          rx: { label: 'Giro X', unit: '°', step: 1 },
          ry: { label: 'Giro Y', unit: '°', step: 1 },
          rz: { label: 'Giro Z', unit: '°', step: 1 },
        }
  }
  /** One menu entry per symmetric pair; edits retain the existing per-side storage. */
  get editableObjects() {
    return Object.fromEntries(
      Object.entries(xrCalibrationObjects).filter(
        ([id]) =>
          !['hand-right', 'grip-right', 'pistol-1', 'holster-1', 'bike-right', 'pocket-1'].includes(
            id,
          ),
      ),
    )
  }
  get objects() {
    return xrCalibrationObjects
  }
  get(id: XRCalibrationObject): XRPoseAdjustment {
    return { ...(id === 'bike-controls' ? bikeDefaults : zero()), ...this.poses[id] }
  }
  set(id: XRCalibrationObject, patch: Partial<XRPoseAdjustment>, save = true): void {
    if (!(id in xrCalibrationObjects)) return
    const value = this.get(id)
    for (const key of Object.keys(value) as (keyof XRPoseAdjustment)[]) {
      const n = patch[key]
      if (typeof n === 'number' && Number.isFinite(n))
        value[key] = THREE.MathUtils.clamp(n, -360, 360)
    }
    if (id === 'bike-controls') {
      value.x = THREE.MathUtils.clamp(value.x, 10, 120)
      value.y = THREE.MathUtils.clamp(value.y, 0, value.x - 1)
      value.z = THREE.MathUtils.clamp(value.z, 5, 60)
      value.rx = THREE.MathUtils.clamp(value.rx, 10, 200)
      value.ry = THREE.MathUtils.clamp(value.ry, 10, 200)
      value.rz = value.rz < 0 ? -1 : 1
    }
    this.poses[id] = value
    const pair = mirrorPairs.find((pair) => pair.includes(id))
    if (pair) this.poses[pair[0] === id ? pair[1] : pair[0]] = mirrored(value)
    if (save) {
      try {
        this.storage.setItem(storageKey, JSON.stringify(this.poses))
      } catch {
        /* Live adjustments still work. */
      }
    }
  }
  reset(id: XRCalibrationObject): void {
    this.set(id, id === 'bike-controls' ? bikeDefaults : zero())
  }
  export(): string {
    return JSON.stringify(
      {
        version: 5,
        baseline: xrCalibrationBaseline,
        units: { position: 'cm', rotation: 'degrees' },
        poses: this.poses,
        controlUnits: { 'bike-controls': this.fields('bike-controls') },
      },
      null,
      2,
    )
  }
  apply(object: THREE.Object3D, id: XRCalibrationObject): void {
    let base = this.bases.get(object)
    if (!base) {
      base = { position: object.position.clone(), rotation: object.quaternion.clone() }
      this.bases.set(object, base)
    }
    const baked = { ...zero(), ...defaults[id] }
    const accepted = { ...zero(), ...baselineAdjustments[id] }
    const p = this.get(id)
    object.position
      .copy(base.position)
      .add(
        new THREE.Vector3(
          baked.x + accepted.x,
          baked.y + accepted.y,
          baked.z + accepted.z,
        ).multiplyScalar(0.01),
      )
    object.quaternion.copy(base.rotation).multiply(rotation(baked)).multiply(rotation(accepted))
    if (id === 'hand-left' || id === 'hand-right') {
      const { delta, translation } = handRebases[id === 'hand-left' ? 'left' : 'right']
      object.position.add(translation)
      object.quaternion.multiply(rotation(delta))
    } else if (id === 'grip-left' || id === 'grip-right') {
      const change = handRebases[id === 'grip-left' ? 'left' : 'right']
      object.position
        .sub(change.before)
        .applyQuaternion(change.rotation)
        .add(change.before)
        .add(change.translation)
      object.quaternion.premultiply(change.rotation)
    }
    object.position.add(new THREE.Vector3(p.x, p.y, p.z).multiplyScalar(0.01))
    object.quaternion.multiply(rotation(p))
    object.updateMatrix()
  }
}
