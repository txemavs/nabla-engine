import * as THREE from 'three'
import { heldWeaponPresets, type HeldWeaponPreset } from '@nabla/engine'
import { XRObjectGrab } from '@nabla/engine/ar'
import type { GrabHand } from '../src/runtime/xr-grab.js'
import { assets, disposeObject } from '../src/render/entity/assets.js'

const squeezed = (hand: GrabHand) =>
  !!hand.source?.gamepad?.buttons[1]?.pressed ||
  (hand.source?.gamepad?.buttons[1]?.value ?? 0) > 0.6

type Held = { preset: HeldWeaponPreset; root: THREE.Group; grab: XRObjectGrab }

/**
 * Held weapons from preset data (melee and prop kinds) as grabbable AR objects: grip near the
 * model to hold it, release to leave it floating where it is. Bows keep the physical XRBow.
 */
export class ARHeldWeapons {
  private readonly items = new Map<string, Held>()
  private generation = 0
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
      item = { preset, root, grab: new XRObjectGrab() }
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
    }
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
