import { Object3D, Quaternion, SpotLight, Vector3 } from 'three'
import { lightingDefaults } from '../../config/lighting.js'

/** Face light borrowing an existing vehicle spotlight; the vehicle rig owns its resources. */
export class Headlamp {
  private readonly rotation = new Quaternion()
  private readonly forward = new Vector3()
  enabled = false
  private shadowsEnabled = false
  get shadows(): boolean {
    return this.shadowsEnabled
  }
  set shadows(enabled: boolean) {
    this.shadowsEnabled = enabled
    // Only opt-in creates a shadow shader/map. Keep that layout stable after first use.
    if (enabled) {
      this.light.castShadow = true
      this.light.shadow.needsUpdate = true
    }
  }
  constructor(readonly light: SpotLight) {
    // Stable shader layout: toggles change uniforms, never add another renderer light.
    light.castShadow = false
    light.shadow.autoUpdate = false
    light.shadow.needsUpdate = false
    light.shadow.intensity = 0
    light.shadow.mapSize.set(1024, 1024)
    light.shadow.camera.near = 0.1
    light.shadow.bias = -0.0001
    light.shadow.normalBias = 0.02
  }
  get needsShadowPass(): boolean {
    return this.light.castShadow && (!this.light.shadow.map || (this.enabled && this.shadows))
  }
  update(head: Object3D, eyes?: Object3D, occupied = false, eyeOrigin = true): void {
    if (occupied) this.enabled = false
    const active = this.enabled && !occupied
    this.light.shadow.intensity = active && this.shadows ? 1 : 0
    this.light.shadow.autoUpdate = active && this.shadows
    if (this.light.castShadow && !this.light.shadow.map) this.light.shadow.needsUpdate = true
    // SceneView has already restored the vehicle's light parameters this frame.
    if (occupied) return
    this.light.intensity = active ? lightingDefaults.highBeamIntensity : 0
    if (!active) return
    this.light.color.set(0xffffff)
    this.light.distance = lightingDefaults.highBeamRange
    const previousRadius = Math.tan(lightingDefaults.highBeamOuterCone * 1.25)
    // Full brightness to half the former radius; fade to zero across a much wider edge.
    this.light.angle = Math.atan(previousRadius * 1.75)
    this.light.penumbra = 1 - Math.atan(previousRadius * 0.5) / this.light.angle
    this.light.decay = 2
    head.updateWorldMatrix(true, false)
    this.light.position.set(0, 0.015, -0.15)
    head.localToWorld(this.light.position)
    const direction = eyes ?? head
    direction.getWorldQuaternion(this.rotation)
    this.forward.set(0, 0, -1).applyQuaternion(this.rotation)
    if (eyes && eyeOrigin) {
      eyes.getWorldPosition(this.light.position)
      this.light.position.addScaledVector(this.forward, 0.15)
    }
    this.light.target.position.copy(this.light.position).add(this.forward)
    this.light.parent?.worldToLocal(this.light.position)
    this.light.target.parent?.worldToLocal(this.light.target.position)
  }
}
