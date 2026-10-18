import * as THREE from 'three'
import { lightingDefaults } from '../../config/lighting.js'
import {
  VehicleLightController,
  type VehicleLampState,
  type VehicleLightMode,
} from '../vehicle-presentation/light-controller.js'
export type CarLampState = VehicleLampState
export interface LampBinding {
  material: THREE.MeshStandardMaterial
  kind: 'position' | 'brake' | 'reverse' | 'signal' | 'front-signal' | 'low' | 'high'
  side: number
  mesh?: THREE.Mesh
  highBeam?: { value: number }
}
export interface CourtesyWell {
  lamp: THREE.PointLight
  lens: THREE.MeshStandardMaterial
}
/** Prepared lens bindings; no model names, lights, shadows or extra scene passes. */
export class CarLights {
  readonly controller: VehicleLightController
  constructor(
    private readonly lamps: readonly LampBinding[],
    flashMs = lightingDefaults.signalFlashMs,
    private readonly courtesy: readonly CourtesyWell[] = [],
  ) {
    this.controller = new VehicleLightController(flashMs)
    for (const well of courtesy) well.lamp.visible = false
  }
  /** Hidden courtesy sources; the shared vehicle light rig samples them while occupied. */
  get courtesyLights(): readonly THREE.PointLight[] {
    return this.courtesy.map((well) => well.lamp)
  }
  toggle(side: number): void {
    this.controller.toggleSignal(side)
  }
  /** Step the light switch (off → position → low → off) without touching brake, reverse or signal lamps. */
  toggleHeadlights(): boolean {
    return this.controller.toggleLights()
  }
  /** `toggleHeadlights`, returning the new switch position. */
  cycleLights(): VehicleLightMode {
    return this.controller.cycleLights()
  }
  update(state: CarLampState, now: number, night = false): void {
    const footwell = state.powered && night
    for (const well of this.courtesy) {
      well.lamp.intensity = footwell ? lightingDefaults.courtesyIntensity : 0
      well.lens.emissiveIntensity = footwell ? lightingDefaults.courtesyLensIntensity : 0
    }
    for (const lamp of this.lamps) {
      if (lamp.kind === 'low' || lamp.kind === 'high') {
        const high = this.controller.level('high', lamp.side, state, now)
        const low = lamp.kind === 'low' ? this.controller.glow('low', lamp.side, state, now) : 0
        lamp.material.emissiveIntensity = Math.max(low, high) * 4
        continue
      }

      if (lamp.kind === 'front-signal') {
        const high = this.controller.level('high', lamp.side, state, now) > 0
        if (lamp.highBeam) lamp.highBeam.value = Number(high)
        const indicating = !high && this.controller.indicating(lamp.side, state)
        lamp.material.emissive.set(indicating ? '#ff7300' : '#e5f2ff')
        lamp.material.color.set(indicating ? '#ff9a32' : '#ebf2ff')
        lamp.material.emissiveIntensity =
          (high ? Number(state.powered) : this.controller.level(lamp.kind, lamp.side, state, now)) *
          (indicating ? 2 : high ? 4 : 0.65)
        continue
      }
      const intensity = lamp.kind === 'position' ? 0.65 : lamp.kind === 'brake' ? 3 : 2
      lamp.material.emissiveIntensity =
        this.controller.level(lamp.kind, lamp.side, state, now) * intensity
      if (lamp.mesh) lamp.mesh.visible = lamp.material.emissiveIntensity > 0
    }
  }
}
