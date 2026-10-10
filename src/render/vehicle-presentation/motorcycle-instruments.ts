/**
 * Live motorcycle instrument cluster drawn on canvas textures over GLB anchors:
 * `gauge_speedo` (analogue speedometer), `gauge_tacho` (tachometer), `gauge_lcd` (odometer,
 * trip, gear, clock), `lamp_signal_l` / `lamp_signal_r` (green turn-signal tell-tales) and
 * `lamp_warning_1…n` (warning lamps, left to right). Anchor local +Z faces the rider and +Y is up
 * the face; `extras.nabla` carries the size in metres (`diameter`, or `width` and `height`).
 *
 * The state logic (`needleAngle`, `warningLampStates`, `lcdText`) is pure and renderer-free; the
 * drawing needs a DOM canvas and falls back to flat colours without one (Node tests).
 */
import * as THREE from 'three'
import { formatClockTime } from '../../planet/sky.js'

/** Warning lamps a cluster can carry; colours follow the usual tell-tale convention. */
export type WarningLamp = 'neutral' | 'high-beam' | 'oil' | 'fi'
export const warningLampColors: Readonly<Record<WarningLamp, string>> = {
  neutral: '#22e85a',
  'high-beam': '#2f7dff',
  oil: '#ff2a1a',
  fi: '#ffa11a',
}

export interface MotorcycleClusterOptions {
  /** Speedometer full scale and numbered step, km/h. */
  speedoMaxKmh: number
  speedoStepKmh: number
  /** Tachometer full scale and start of the red zone, rpm. */
  tachoMaxRpm: number
  redlineRpm: number
  /** Needle sweep from zero to full scale, radians, centred on 12 o'clock. */
  sweep: number
  /** Warning lamps in `lamp_warning_1…n` order (left to right). */
  lamps: readonly WarningLamp[]
}

/**
 * TODO(unverified): defaults for a sports-touring cluster. The scales are not read from a real
 * dial; presets override them (`vehicle.cluster`).
 */
export const motorcycleClusterDefaults: Readonly<MotorcycleClusterOptions> = Object.freeze({
  speedoMaxKmh: 280,
  speedoStepKmh: 20,
  tachoMaxRpm: 13000,
  redlineRpm: 11500,
  sweep: (240 * Math.PI) / 180,
  lamps: Object.freeze(['high-beam', 'oil', 'neutral', 'fi'] as WarningLamp[]),
})

/** What the cluster shows for one frame. */
export interface ClusterInputs {
  /** Rider on board with the key on; false: everything dark and needles at rest. */
  powered: boolean
  /** Ambient daylight, 0 at night and 1 in full daylight. Omit for daytime instrument colours. */
  daylight?: number
  /** Start-up phase (`Simulation.vehicleInfo`). */
  ignition: 'cranking' | 'sweep' | 'running'
  /** Needle self-test 0..1 while `ignition` is `sweep`. */
  gaugeSweep: number
  speedKmh: number
  rpm: number
  /** 0 = neutral, 1… gears. */
  gear: number
  parked: boolean
  /** Main beam selected (blue tell-tale). */
  highBeam: boolean
  /** Turn-signal tell-tales, already in their blink phase. */
  signalLeft: boolean
  signalRight: boolean
  /** In-game local time, minutes after midnight. */
  clockMinutes: number
  odometerKm: number
  tripKm: number
}

/**
 * Needle angle for `value` on a dial of `max` full scale: radians clockwise from 12 o'clock,
 * from −sweep/2 at zero to +sweep/2 at full scale, clamped to the dial.
 */
export function needleAngle(value: number, max: number, sweep: number): number {
  const share = max > 0 && Number.isFinite(value) ? Math.min(1, Math.max(0, value / max)) : 0
  return (share - 0.5) * sweep
}

/** Dial values for the frame: the start-up self-test sweeps both needles. */
export function dialValues(
  inputs: ClusterInputs,
  options: MotorcycleClusterOptions,
): { speedKmh: number; rpm: number } {
  if (!inputs.powered) return { speedKmh: 0, rpm: 0 }
  if (inputs.ignition === 'sweep')
    return {
      speedKmh: options.speedoMaxKmh * inputs.gaugeSweep,
      rpm: options.tachoMaxRpm * inputs.gaugeSweep,
    }
  return { speedKmh: Math.max(0, inputs.speedKmh), rpm: Math.max(0, inputs.rpm) }
}

/**
 * Warning lamp states in `lamps` order. Neutral: gear N (or parked). High beam: main beam on.
 * Oil pressure: only while cranking, before the engine runs. FI: self-check during the start-up
 * (cranking and needle sweep), then off.
 */
export function warningLampStates(lamps: readonly WarningLamp[], inputs: ClusterInputs): boolean[] {
  return lamps.map((lamp) => {
    if (!inputs.powered) return false
    switch (lamp) {
      case 'neutral':
        return inputs.gear === 0 || inputs.parked
      case 'high-beam':
        return inputs.highBeam
      case 'oil':
        return inputs.ignition === 'cranking'
      case 'fi':
        return inputs.ignition !== 'running'
    }
  })
}

/** LCD contents: clock, gear (N, 1…) and odometer / trip. Blank when unpowered. */
export function lcdText(inputs: ClusterInputs): {
  clock: string
  gear: string
  odometer: string
  trip: string
} | null {
  if (!inputs.powered) return null
  return {
    clock: formatClockTime(inputs.clockMinutes),
    gear: inputs.gear === 0 || inputs.parked ? 'N' : inputs.gear > 0 ? String(inputs.gear) : 'R',
    odometer: `ODO ${Math.floor(Math.max(0, inputs.odometerKm)).toString().padStart(6, '0')}`,
    trip: `TRIP ${(Math.floor(Math.max(0, inputs.tripKm) * 10) / 10).toFixed(1).padStart(5, ' ')}`,
  }
}

interface Anchor {
  node: THREE.Object3D
  size: { diameter?: number; width?: number; height?: number }
}
const anchorOf = (model: THREE.Object3D, name: string): Anchor | null => {
  const node = model.getObjectByName(name)
  if (!node) return null
  const extras = (node.userData as { nabla?: Anchor['size'] }).nabla ?? {}
  return { node, size: extras }
}
const canvasAvailable = () => typeof document !== 'undefined'
const makeCanvas = (w: number, h: number) => {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  return canvas
}
const LIFT = 0.0004
/** Unlit material for backlit faces; not affected by tone mapping so colours stay true. */
const backlit = (params: THREE.MeshBasicMaterialParameters) =>
  new THREE.MeshBasicMaterial({ toneMapped: false, ...params })

/** Draw a round dial face: ticks every minor step, numbers every major step. */
function drawDial(
  canvas: HTMLCanvasElement,
  o: {
    face: string
    ink: string
    max: number
    major: number
    minor: number
    label: (v: number) => string
    /** Number every `labelEvery` major ticks. */
    labelEvery?: number
    red?: number
    redInk?: string
    caption: string
    sweep: number
  },
): void {
  const g = canvas.getContext('2d')!
  const s = canvas.width,
    c = s / 2
  g.fillStyle = o.face
  g.beginPath()
  g.arc(c, c, c, 0, Math.PI * 2)
  g.fill()
  const at = (v: number) => needleAngle(v, o.max, o.sweep) - Math.PI / 2
  if (o.red !== undefined && o.red < o.max) {
    g.strokeStyle = o.redInk ?? '#d4141c'
    g.lineWidth = s * 0.07
    g.beginPath()
    g.arc(c, c, c * 0.86, at(o.red), at(o.max))
    g.stroke()
  }
  g.strokeStyle = o.ink
  g.fillStyle = o.ink
  for (let v = 0; v <= o.max + 1e-6; v += o.minor) {
    const a = at(v),
      major = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-6
    g.lineWidth = s * (major ? 0.016 : 0.008)
    g.beginPath()
    g.moveTo(c + Math.cos(a) * c * (major ? 0.74 : 0.8), c + Math.sin(a) * c * (major ? 0.74 : 0.8))
    g.lineTo(c + Math.cos(a) * c * 0.93, c + Math.sin(a) * c * 0.93)
    g.stroke()
    const every = o.major * (o.labelEvery ?? 1)
    if (major && Math.abs(v / every - Math.round(v / every)) < 1e-6) {
      g.font = `bold ${Math.round(s * 0.085)}px sans-serif`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(o.label(v), c + Math.cos(a) * c * 0.58, c + Math.sin(a) * c * 0.58)
    }
  }
  g.font = `${Math.round(s * 0.06)}px sans-serif`
  g.fillText(o.caption, c, c + c * 0.42)
}

/** A round dial with a needle on one anchor. */
class Dial {
  readonly needle: THREE.Object3D
  private readonly faceMaterial: THREE.MeshBasicMaterial
  private readonly needleMaterial: THREE.MeshBasicMaterial
  private readonly dayTexture: THREE.Texture | null
  private readonly nightTexture: THREE.Texture | null
  private readonly dayColor: THREE.Color
  private readonly needleColor: THREE.Color
  private readonly nightNeedleColor = new THREE.Color('#80dfa4')
  constructor(
    anchor: Anchor,
    draw: ((canvas: HTMLCanvasElement, night: boolean) => void) | null,
    fallback: string,
    needleColor: string,
  ) {
    const radius = (anchor.size.diameter ?? 0.06) / 2
    this.dayTexture =
      draw && canvasAvailable() ? dialTexture((canvas) => draw(canvas, false)) : null
    this.nightTexture =
      draw && canvasAvailable() ? dialTexture((canvas) => draw(canvas, true)) : null
    if (this.dayTexture) this.dayTexture.name = `${anchor.node.name}.day`
    if (this.nightTexture) this.nightTexture.name = `${anchor.node.name}.night`
    this.dayColor = new THREE.Color(fallback)
    this.needleColor = new THREE.Color(needleColor)
    this.faceMaterial = backlit(
      this.dayTexture ? { map: this.dayTexture } : { color: this.dayColor },
    )
    this.needleMaterial = backlit({ color: this.needleColor })
    const face = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), this.faceMaterial)
    face.name = `${anchor.node.name}.face`
    face.position.z = LIFT
    anchor.node.add(face)
    const needle = new THREE.Group()
    needle.name = `${anchor.node.name}.needle`
    needle.position.z = LIFT * 3
    const blade = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 0.05, radius * 0.92),
      this.needleMaterial,
    )
    blade.position.y = radius * 0.32
    needle.add(blade)
    const hub = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 0.11, 20),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 }),
    )
    hub.position.z = LIFT
    needle.add(hub)
    anchor.node.add(needle)
    this.needle = needle
  }
  set(angle: number, inputs: ClusterInputs): void {
    // Clockwise on the face as seen by the rider (looking down −Z of the anchor).
    this.needle.rotation.z = -angle
    const daylight = Math.max(0, Math.min(1, inputs.daylight ?? 1))
    const night = inputs.powered && daylight < 0.35
    const texture = night ? this.nightTexture : this.dayTexture
    if (this.faceMaterial.map !== texture) {
      this.faceMaterial.map = texture
      this.faceMaterial.needsUpdate = true
    }
    this.faceMaterial.color.set(texture ? '#ffffff' : night ? '#060c09' : this.dayColor)
    // Only the markings glow at night. An unpowered white face darkens with the ambient light.
    if (!night) this.faceMaterial.color.multiplyScalar(0.03 + 0.97 * daylight)
    this.needleMaterial.color.copy(night ? this.nightNeedleColor : this.needleColor)
    if (!night) this.needleMaterial.color.multiplyScalar(0.03 + 0.97 * daylight)
  }
}
/** Canvas textures created by the cluster, released by `MotorcycleInstruments.dispose`. */
let owned: THREE.Texture[] = []
const dialTexture = (draw: (canvas: HTMLCanvasElement) => void) => {
  const canvas = makeCanvas(512, 512)
  draw(canvas)
  const texture = new THREE.CanvasTexture(canvas)
  owned.push(texture)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** A round tell-tale: dim tint when off, full colour when lit. */
class Lamp {
  private readonly material: THREE.MeshBasicMaterial
  private readonly on: THREE.Color
  private readonly off: THREE.Color
  constructor(anchor: Anchor, color: string) {
    this.on = new THREE.Color(color)
    this.off = this.on.clone().multiplyScalar(0.07)
    this.material = backlit({ color: this.off.clone() })
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry((anchor.size.diameter ?? 0.01) / 2, 20),
      this.material,
    )
    mesh.name = `${anchor.node.name}.lens`
    mesh.position.z = LIFT
    anchor.node.add(mesh)
  }
  set(lit: boolean): void {
    this.material.color.copy(lit ? this.on : this.off)
  }
  get lit(): boolean {
    return this.material.color.equals(this.on)
  }
}

/** Portrait LCD: clock, big gear digit, odometer and trip; redrawn only when the text changes. */
class Lcd {
  private readonly canvas: HTMLCanvasElement | null
  private readonly texture: THREE.CanvasTexture | null
  private key = ''
  constructor(anchor: Anchor) {
    const width = anchor.size.width ?? 0.03,
      height = anchor.size.height ?? 0.045
    this.canvas = canvasAvailable() ? makeCanvas(256, Math.round((256 * height) / width)) : null
    this.texture = this.canvas ? new THREE.CanvasTexture(this.canvas) : null
    if (this.texture) owned.push(this.texture)
    if (this.texture) this.texture.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      backlit(this.texture ? { map: this.texture } : { color: 0x26302a }),
    )
    mesh.name = `${anchor.node.name}.screen`
    mesh.position.z = LIFT
    anchor.node.add(mesh)
  }
  draw(text: ReturnType<typeof lcdText>, daylight: number): void {
    const night = daylight < 0.35
    const key = text ? `${text.clock}|${text.gear}|${text.odometer}|${text.trip}|${night}` : ''
    if (key === this.key || !this.canvas || !this.texture) return
    this.key = key
    const g = this.canvas.getContext('2d')!
    const w = this.canvas.width,
      h = this.canvas.height
    // Unlit: dark grey-green glass. Lit: backlit amber-green with dark segments.
    g.fillStyle = text ? (night ? '#80dfa4' : '#9fb889') : '#1d241f'
    g.fillRect(0, 0, w, h)
    if (text) {
      g.fillStyle = '#10180f'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.font = `bold ${Math.round(h * 0.14)}px monospace`
      g.fillText(text.clock, w / 2, h * 0.13)
      g.font = `bold ${Math.round(h * 0.4)}px monospace`
      g.fillText(text.gear, w / 2, h * 0.47)
      g.font = `bold ${Math.round(h * 0.085)}px monospace`
      g.fillText(text.odometer, w / 2, h * 0.79)
      g.fillText(text.trip, w / 2, h * 0.91)
    }
    this.texture.needsUpdate = true
  }
}

/** The cluster bound to one model. */
export class MotorcycleInstruments {
  private textures: THREE.Texture[] = []
  private constructor(
    private readonly options: MotorcycleClusterOptions,
    private readonly speedo: Dial | null,
    private readonly tacho: Dial | null,
    private readonly lcd: Lcd | null,
    private readonly signals: [Lamp | null, Lamp | null],
    private readonly warnings: (Lamp | null)[],
  ) {}

  /** Bind to a model with the instrument anchors; null when it has none. */
  static bind(
    model: THREE.Object3D,
    overrides: Partial<MotorcycleClusterOptions> = {},
  ): MotorcycleInstruments | null {
    const o: MotorcycleClusterOptions = { ...motorcycleClusterDefaults, ...overrides }
    owned = []
    const speedoAnchor = anchorOf(model, 'gauge_speedo'),
      tachoAnchor = anchorOf(model, 'gauge_tacho'),
      lcdAnchor = anchorOf(model, 'gauge_lcd')
    if (!speedoAnchor && !tachoAnchor && !lcdAnchor) return null
    const speedo = speedoAnchor
      ? new Dial(
          speedoAnchor,
          (canvas, night) =>
            drawDial(canvas, {
              face: night ? '#060c09' : '#0b0b0d',
              ink: night ? '#80dfa4' : '#f2f2f2',
              max: o.speedoMaxKmh,
              major: o.speedoStepKmh,
              minor: o.speedoStepKmh / 2,
              label: (v) => String(v),
              labelEvery: 2,
              caption: 'km/h',
              sweep: o.sweep,
            }),
          '#0b0b0d',
          '#ff5a14',
        )
      : null
    const tacho = tachoAnchor
      ? new Dial(
          tachoAnchor,
          (canvas, night) =>
            drawDial(canvas, {
              face: night ? '#060c09' : '#f4f4f0',
              ink: night ? '#80dfa4' : '#111111',
              redInk: night ? '#80dfa4' : '#d4141c',
              max: o.tachoMaxRpm / 1000,
              major: 1,
              minor: 0.5,
              label: (v) => String(v),
              red: o.redlineRpm / 1000,
              caption: 'x1000 r/min',
              sweep: o.sweep,
            }),
          '#f4f4f0',
          '#e0141c',
        )
      : null
    const lamp = (name: string, color: string) => {
      const anchor = anchorOf(model, name)
      return anchor ? new Lamp(anchor, color) : null
    }
    const cluster = new MotorcycleInstruments(
      o,
      speedo,
      tacho,
      lcdAnchor ? new Lcd(lcdAnchor) : null,
      [lamp('lamp_signal_l', '#22e85a'), lamp('lamp_signal_r', '#22e85a')],
      o.lamps.map((kind, i) => lamp(`lamp_warning_${i + 1}`, warningLampColors[kind])),
    )
    cluster.textures = owned
    owned = []
    return cluster
  }

  /** Release the canvas textures (meshes and materials go with the model). */
  dispose(): void {
    for (const texture of this.textures) texture.dispose()
    this.textures = []
  }

  update(inputs: ClusterInputs): void {
    const dial = dialValues(inputs, this.options)
    this.speedo?.set(
      needleAngle(dial.speedKmh, this.options.speedoMaxKmh, this.options.sweep),
      inputs,
    )
    this.tacho?.set(needleAngle(dial.rpm, this.options.tachoMaxRpm, this.options.sweep), inputs)
    this.lcd?.draw(lcdText(inputs), inputs.daylight ?? 1)
    this.signals[0]?.set(inputs.powered && inputs.signalLeft)
    this.signals[1]?.set(inputs.powered && inputs.signalRight)
    warningLampStates(this.options.lamps, inputs).forEach((lit, i) => this.warnings[i]?.set(lit))
  }

  /** Lit state of every lamp (signals left/right, then warnings), for tests and debugging. */
  lampStates(): { signals: [boolean, boolean]; warnings: boolean[] } {
    return {
      signals: [!!this.signals[0]?.lit, !!this.signals[1]?.lit],
      warnings: this.warnings.map((l) => !!l?.lit),
    }
  }

  /** Needle angles (radians, clockwise from 12 o'clock) for tests and debugging. */
  needleAngles(): { speedo: number | null; tacho: number | null } {
    return {
      speedo: this.speedo ? -this.speedo.needle.rotation.z : null,
      tacho: this.tacho ? -this.tacho.needle.rotation.z : null,
    }
  }
}
