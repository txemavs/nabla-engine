import { assets, disposeObject } from '../../render/entity/assets.js'
import * as THREE from 'three'
import type { World } from '../../simulation/physics.js'
import type { XRDisposalTest } from '../../runtime/xr-disposal-portal.js'
import { BetaflightDrone } from './drone.js'
import type { DroneInput } from './droneDef.js'

/** Small AR host adapter: Mode 2 sticks and the original Agency procedural quad.
 * Uses the host's Engine world, room scan, menu, disposal portal and clock.
 */
export class ARDrone {
  root: THREE.Group | null = null
  flight: BetaflightDrone | null = null
  armed = false
  mode: 'angle' | 'acro' = 'angle'
  disposalTest?: XRDisposalTest
  private input: DroneInput = {
    roll: 0,
    pitch: 0,
    yaw: 0,
    throttle: 0.5,
    arm: false,
    mode: 'angle',
  }
  private throttle = 0
  private rotors: THREE.Object3D[] = []
  private generation = 0
  private mainRotor: THREE.Object3D | null = null
  private tailRotor: THREE.Object3D | null = null
  lightButtonIndex = 4
  private spotlight: THREE.SpotLight | null = null
  private lightButtonDown = false
  get hasSpotlight(): boolean {
    return !!this.spotlight
  }
  get spotlightEnabled(): boolean {
    return !!this.spotlight?.visible
  }
  toggleSpotlight(): boolean {
    if (this.spotlight) this.spotlight.visible = !this.spotlight.visible
    return this.spotlightEnabled
  }
  /** Replace presentation only. The existing Betaflight body, PID, mixer and sticks stay unchanged. */
  async spawnModel(camera: THREE.Camera, url: string, scale = 0.06): Promise<boolean> {
    if (!Number.isFinite(scale) || scale <= 0) throw new RangeError('Invalid aircraft model scale')
    this.clear()
    const generation = this.generation
    const model = await assets.instantiate(url)
    if (generation !== this.generation || !this.spawn(camera)) {
      disposeObject(model)
      return false
    }
    const root = this.root!
    for (const child of [...root.children]) {
      disposeObject(child)
      child.removeFromParent()
    }
    this.rotors = []
    model.scale.setScalar(scale)
    model.rotation.y = Math.PI // Engine's Betaflight convention has its nose along +Z.
    model.position.y = -0.025 // Match the existing body's resting height to the landing skids.
    root.add(model)
    root.name = 'Betaflight helicopter'
    this.mainRotor = model.getObjectByName('Main_Rotor') ?? null
    this.tailRotor = model.getObjectByName('Tail_Rotor') ?? null
    const light = new THREE.SpotLight(0xfff2df, 2, 6, 0.38, 0.65, 2)
    light.name = 'Helicopter spotlight'
    light.position.set(0, 0.85, -2.02)
    light.target.position.set(0, -2, -8)
    light.castShadow = false
    light.visible = false
    model.add(light, light.target)
    this.spotlight = light
    return true
  }
  private lastPosition = new THREE.Vector3()
  constructor(
    private scene: THREE.Scene,
    private getWorld: () => World | null,
  ) {}
  spawn(camera: THREE.Camera): boolean {
    const world = this.getWorld()
    if (!world) return false
    this.clear()
    const root = new THREE.Group()
    root.name = 'Agency experimental quad'
    const carbon = new THREE.MeshStandardMaterial({ color: 0x1f2124, roughness: 0.8 })
    const orange = new THREE.MeshStandardMaterial({ color: 0xf28c14, roughness: 0.6 })
    const box = (
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      material = carbon,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material)
      mesh.position.set(x, y, z)
      root.add(mesh)
      return mesh
    }
    // Agency's nine-part procedural model, scaled to the configured motor arm.
    box(0, 0, 0, 0.1, 0.05, 0.16)
    box(0, 0.03, 0.04, 0.06, 0.03, 0.05, orange)
    box(0, 0, 0, 0.24, 0.018, 0.028)
    box(0, 0, 0, 0.028, 0.018, 0.24)
    for (const [x, z] of [
      [-0.12, 0.12],
      [0.12, 0.12],
      [0.12, -0.12],
      [-0.12, -0.12],
    ])
      this.rotors.push(box(x, 0.01, z, 0.08, 0.012, 0.025))
    box(0, 0.05, 0.06, 0.04, 0.04, 0.04, orange)
    this.root = root
    this.scene.add(root)
    this.flight = new BetaflightDrone(world, this.spawnPosition(camera))
    this.reset(camera)
    return true
  }
  private spawnPosition(camera: THREE.Camera): THREE.Vector3 {
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
      camera.getWorldQuaternion(new THREE.Quaternion()),
    )
    direction.y = 0
    return camera.getWorldPosition(new THREE.Vector3()).addScaledVector(direction.normalize(), 0.7)
  }
  reset(camera: THREE.Camera): void {
    this.setArmed(false)
    const yaw =
      new THREE.Euler().setFromQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()), 'YXZ')
        .y + Math.PI
    const position = this.spawnPosition(camera)
    this.lastPosition.copy(position)
    this.flight?.reset(position, yaw)
    this.sync(0)
    if (this.root) this.lastPosition.copy(this.root.position)
  }
  setArmed(armed: boolean): void {
    this.armed = armed && !!this.flight
    this.input.arm = this.armed
    this.throttle = 0
    if (!this.armed) this.flight?.controller.reset()
  }
  setMode(mode: 'angle' | 'acro'): void {
    this.setArmed(false)
    this.mode = mode
    this.input.mode = mode
  }
  /** Neutral spring-centred left stick holds hover in Angle; Acro integrates throttle. */
  readInput(sources: readonly XRInputSource[], dt: number, blocked = false): void {
    const axis = (side: XRHandedness, index: number) => {
      if (blocked) return 0
      const gamepad = sources.find((s) => s.handedness === side)?.gamepad
      const axes = gamepad?.axes
      const value = axes?.[(axes.length >= 4 ? 2 : 0) + index] ?? 0
      return Number.isFinite(value) && Math.abs(value) > 0.12
        ? THREE.MathUtils.clamp(value, -1, 1)
        : 0
    }
    // Losing a controller must not leave a running aircraft unattended.
    if (
      !sources.some((s) => s.handedness === 'left' && !!s.gamepad) ||
      !sources.some((s) => s.handedness === 'right' && !!s.gamepad)
    )
      this.setArmed(false)
    const lightButton = !!sources.find((s) => s.handedness === 'left')?.gamepad?.buttons?.[
      this.lightButtonIndex
    ]?.pressed
    if (lightButton && !this.lightButtonDown && this.spotlight) this.toggleSpotlight()
    this.lightButtonDown = lightButton
    const climb = -axis('left', 1)
    if (this.mode === 'acro')
      this.throttle = THREE.MathUtils.clamp(this.throttle + climb * Math.min(dt, 0.05) * 0.5, 0, 1)
    this.input = {
      arm: this.armed,
      mode: this.mode,
      yaw: -axis('left', 0),
      pitch: -axis('right', 1),
      roll: axis('right', 0),
      throttle: this.mode === 'angle' ? 0.5 + climb * 0.5 : this.throttle,
    }
  }
  beforeStep(dt: number): void {
    this.flight?.beforeStep(this.input, dt)
  }
  sync(dt: number): void {
    if (!this.root || !this.flight) return
    this.root.position.copy(this.flight.body.translation())
    this.root.quaternion.copy(this.flight.body.rotation())
    const motors = this.flight.snapshot.motors
    const power = motors.reduce((sum, value) => sum + value, 0) / motors.length
    if (this.mainRotor) this.mainRotor.rotation.y += power * dt * 48
    if (this.tailRotor) this.tailRotor.rotation.x -= power * dt * 160
    this.rotors.forEach((rotor, i) => {
      rotor.rotation.y += (i % 2 ? -1 : 1) * this.flight!.snapshot.motors[i] * dt * 90
    })
    if (
      this.disposalTest?.(this.lastPosition, this.root.position, 0.15) ||
      this.root.position.y < -5
    )
      this.clear()
    else this.lastPosition.copy(this.root.position)
  }
  clear(): void {
    this.setArmed(false)
    this.flight?.dispose()
    this.flight = null
    this.generation++
    this.spotlight?.dispose()
    this.spotlight = null
    this.mainRotor = this.tailRotor = null
    this.lightButtonDown = false
    if (this.root) disposeObject(this.root)
    this.root?.removeFromParent()
    this.root = null
    this.rotors = []
  }
}
