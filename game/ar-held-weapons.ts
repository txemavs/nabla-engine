import * as THREE from 'three'
import { heldWeaponPresets, type HeldWeaponPreset } from '@nabla/engine'
import { XRObjectGrab } from '@nabla/engine/ar'
import type { GrabHand } from '../src/runtime/xr-grab.js'
import { assets, disposeObject } from '../src/render/entity/assets.js'

const squeezed = (hand: GrabHand) =>
  !!hand.source?.gamepad?.buttons[1]?.pressed ||
  (hand.source?.gamepad?.buttons[1]?.value ?? 0) > 0.6

type Held = {
  preset: HeldWeaponPreset
  root: THREE.Group
  grab: XRObjectGrab
  /** Grip to tip along -Z, metres. */
  blade: number
  tip: THREE.Vector3 | null
  lastStrike: number
}
/** Tip speed that counts as a swing, m/s. */
const SWING_SPEED = 2.5

/**
 * Held weapons from preset data (melee and prop kinds) as grabbable AR objects: grip near the
 * model to hold it, release to leave it floating where it is. Bows keep the physical XRBow.
 * A held melee weapon whose tip moves faster than SWING_SPEED strikes along its blade
 * (`onStrike`, same impact path as a shot), at most once per `melee.swingMs`.
 */
export class ARHeldWeapons {
  private readonly items = new Map<string, Held>()
  private generation = 0
  onStrike?: (origin: THREE.Vector3, direction: THREE.Vector3, distance: number) => boolean
  constructor(private readonly scene: THREE.Scene) {}

  static presets(): HeldWeaponPreset[] {
    return heldWeaponPresets().filter((p) => p.kind === 'melee' || p.kind === 'prop')
  }

  owns(grip: THREE.Object3D): boolean {
    for (const item of this.items.values()) if (item.grab.hands.includes(grip)) return true
    return false
  }

  /** Place the weapon 45 cm in front of the eyes; a second call moves the same one. */
  async spawn(preset: HeldWeaponPreset, camera: THREE.Camera): Promise<void> {
    let item = this.items.get(preset.id)
    if (!item) {
      const generation = this.generation
      const object = await assets.instantiate(preset.model!)
      if (generation !== this.generation) return disposeObject(object)
      const root = new THREE.Group()
      root.name = `AR ${preset.name}`
      const model = new THREE.Group()
      model.scale.setScalar(preset.scale)
      model.add(object)
      root.add(model)
      this.scene.add(root)
      const bounds = new THREE.Box3().setFromObject(model, true)
      item = {
        preset,
        root,
        grab: new XRObjectGrab(),
        blade: Math.max(0.1, -bounds.min.z),
        tip: null,
        lastStrike: -Infinity,
      }
      this.items.set(preset.id, item)
    }
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    item.root.position.copy(camera.position).addScaledVector(forward, 0.45)
    item.root.position.y -= 0.15
    item.root.quaternion.copy(camera.quaternion)
    item.grab.reset()
  }

  /** Free hands squeezing within 15 cm of the grip (model origin) take the weapon. */
  update(hands: readonly GrabHand[], dt: number): void {
    const point = new THREE.Vector3()
    for (const item of this.items.values()) {
      const origin = item.root.getWorldPosition(new THREE.Vector3())
      const holding = hands.filter((h) => {
        if (!squeezed(h)) return false
        if (item.grab.hands.includes(h.grip)) return true
        if (this.owns(h.grip)) return false
        return h.grip.getWorldPosition(point).distanceTo(origin) < 0.15
      })
      item.grab.update(
        item.root,
        holding.map((h) => h.grip),
        dt,
      )
      this.swing(item, dt)
    }
  }

  private swing(item: Held, dt: number): void {
    const melee = item.preset.melee
    if (!melee || !item.grab.hands.length || dt <= 0) {
      item.tip = null
      return
    }
    const origin = item.root.getWorldPosition(new THREE.Vector3())
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(
      item.root.getWorldQuaternion(new THREE.Quaternion()),
    )
    const tip = origin.clone().addScaledVector(direction, item.blade)
    const speed = item.tip ? tip.distanceTo(item.tip) / dt : 0
    item.tip = tip
    const now = performance.now()
    if (speed < SWING_SPEED || now - item.lastStrike < melee.swingMs) return
    const distance = Math.min(melee.reachM, item.blade)
    if (this.onStrike?.(origin, direction, distance)) item.lastStrike = now
  }

  clear(): void {
    this.generation++
    for (const item of this.items.values()) {
      item.root.removeFromParent()
      disposeObject(item.root)
    }
    this.items.clear()
  }
}
