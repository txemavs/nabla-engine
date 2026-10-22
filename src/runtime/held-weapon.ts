import * as THREE from 'three'
import type { HeldWeaponPreset } from '../catalog/weapons/held-library.js'
import { assets, disposeObject } from '../render/entity/assets.js'
import { bowModels, bowString, buildBowModel, createBowString, setBowString } from './bow-model.js'
import { ViewmodelLighting } from './viewmodel-lighting.js'

const euler = (r: readonly [number, number, number]) => new THREE.Euler(r[0], r[1], r[2], 'XYZ')

/**
 * Held non-firearm weapon (melee or bow) from its preset. First person draws it in its own
 * viewmodel pass, lit by copies of the world lights; third person hangs a clone on the avatar.
 * Swing timing is presentation; the host decides what the swing hits.
 */
export class HeldWeapon {
  readonly model = new THREE.Group()
  readonly ready: Promise<void>
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.01, 5)
  private readonly rig = new THREE.Group()
  private readonly lighting = new ViewmodelLighting()
  private world: THREE.Group | null = null
  private source: THREE.Object3D | null = null
  private swingStart = -Infinity
  private enabled = false
  private disposed = false
  private bowLine: THREE.Line | null = null
  private nocked: THREE.Object3D | null = null
  /** The bow's own arrow mesh (bow presets), for hosts that show loosed arrows. */
  arrowTemplate: THREE.Mesh | null = null

  constructor(readonly preset: HeldWeaponPreset) {
    this.scene.add(this.lighting.root, this.rig)
    this.rig.add(this.model)
    const bow = preset.bowModel ? bowModels[preset.bowModel] : undefined
    if (preset.bowModel && !bow)
      throw new Error(`Weapon ${preset.id}: no bow model "${preset.bowModel}"`)
    this.ready = bow
      ? assets.instantiate(bow.url).then((object) => {
          try {
            if (this.disposed) return
            // The headset bow's own meshes: same cut, scale and orientation.
            const root = new THREE.Group()
            const parts = buildBowModel(object, bow.model)
            root.add(parts.bow)
            this.arrowTemplate = parts.arrow
            this.bowLine = createBowString()
            this.nocked = parts.arrow.clone()
            this.nocked.visible = false
            root.add(this.bowLine, this.nocked)
            this.source = root
            this.model.add(root)
          } finally {
            disposeObject(object)
          }
        })
      : preset.model
        ? assets.instantiate(preset.model).then((object) => {
            if (this.disposed) return disposeObject(object)
            const picked = preset.node ? object.getObjectByName(preset.node) : object
            if (!picked) throw new Error(`Weapon ${preset.id}: no node "${preset.node}"`)
            const root = new THREE.Group()
            root.scale.setScalar(preset.scale)
            root.add(preset.node ? picked.clone(true) : picked)
            if (preset.node) disposeObject(object)
            this.source = root
            this.model.add(root)
          })
        : Promise.resolve()
  }

  set visible(value: boolean) {
    this.enabled = value && !this.disposed
    if (!this.enabled && this.world) this.world.visible = false
  }
  get visible(): boolean {
    return this.enabled
  }

  get swinging(): boolean {
    return this.swingProgress(performance.now()) < 1
  }

  /** Start a swing; false while one is in progress or for non-melee weapons. */
  swing(now: number): boolean {
    const melee = this.preset.melee
    if (!melee || !this.enabled || this.swingProgress(now) < 1) return false
    this.swingStart = now
    return true
  }

  private swingProgress(now: number): number {
    const ms = this.preset.melee?.swingMs ?? 1
    return Math.min(1, Math.max(0, (now - this.swingStart) / ms))
  }

  /** Pose offset at `now`: sin-shaped arc out and back. */
  private pose(target: THREE.Object3D, base: HeldWeaponPreset['view'], now: number): void {
    if (!base) return
    target.position.fromArray(base.position)
    target.quaternion.setFromEuler(euler(base.rotation))
    const arc = this.preset.melee?.arc
    const p = this.swingProgress(now)
    if (arc && p < 1) {
      const s = Math.sin(Math.PI * p)
      target.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(euler([arc[0] * s, arc[1] * s, arc[2] * s])),
      )
    }
  }

  /** Show the draw (metres of pull, 0 at rest) on the string and the nocked arrow. */
  setDraw(distance: number): void {
    if (!this.bowLine || !this.nocked) return
    const pull = Number.isFinite(distance) ? Math.max(0, distance) : 0
    const nock = new THREE.Vector3(0, 0, bowString.restZ + pull)
    setBowString(this.bowLine, nock)
    this.nocked.visible = pull > 0
    this.nocked.position.set(0, 0, nock.z - bowString.arrowLead)
  }

  /** The third-person copy made by {@link syncWorld}, or null. */
  get worldObject(): THREE.Group | null {
    return this.world
  }

  /** Third-person copy on the avatar; hidden in first person. */
  syncWorld(parent: THREE.Object3D, now: number, firstPerson: boolean): void {
    if (!this.enabled || firstPerson || !this.source || !this.preset.world) {
      if (this.world) this.world.visible = false
      return
    }
    if (!this.world) {
      this.world = new THREE.Group()
      this.world.name = `Held: ${this.preset.name}`
      this.world.add(this.source.clone(true))
      this.world.traverse((node) => {
        if (node instanceof THREE.Mesh) node.castShadow = true
      })
    }
    if (this.world.parent !== parent) parent.add(this.world)
    this.world.visible = true
    this.pose(this.world, this.preset.world, now)
  }

  /** First-person pass over the rendered world, same contract as the sidearm viewmodel. */
  render(
    renderer: THREE.WebGLRenderer,
    now: number,
    aspect: number,
    firstPerson: boolean,
    world: THREE.Scene,
    eye: THREE.Camera,
  ): void {
    if (!this.enabled || !firstPerson || !this.source) return
    this.pose(this.model, this.preset.view, now)
    this.lighting.sync(world)
    this.scene.environment = world.environment
    this.scene.environmentIntensity = world.environmentIntensity
    this.scene.environmentRotation.copy(world.environmentRotation)
    eye.updateWorldMatrix(true, false)
    eye.matrixWorld.decompose(this.rig.position, this.rig.quaternion, this.rig.scale)
    this.rig.scale.set(1, 1, 1)
    this.camera.position.copy(this.rig.position)
    this.camera.quaternion.copy(this.rig.quaternion)
    this.camera.aspect = aspect
    if (eye instanceof THREE.PerspectiveCamera) this.camera.fov = eye.fov
    this.camera.updateProjectionMatrix()
    const autoClear = renderer.autoClear
    const shadowUpdate = renderer.shadowMap.autoUpdate
    renderer.autoClear = false
    renderer.shadowMap.autoUpdate = false
    try {
      renderer.clearDepth()
      renderer.render(this.scene, this.camera)
    } finally {
      renderer.autoClear = autoClear
      renderer.shadowMap.autoUpdate = shadowUpdate
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.enabled = false
    this.world?.removeFromParent()
    this.world = null
    this.model.removeFromParent()
    disposeObject(this.model)
    this.scene.clear()
  }
}
