import * as THREE from 'three'
export interface CarLampState {
  powered: boolean
  braking: boolean
  reversing: boolean
}
export interface LampBinding {
  material: THREE.MeshStandardMaterial
  kind: 'position' | 'brake' | 'reverse' | 'signal' | 'front-signal'
  side: number
  mesh?: THREE.Mesh
}
export interface CourtesyWell {
  lamp: THREE.PointLight
  lens: THREE.MeshStandardMaterial
}
/** Prepared lens bindings; no model names, lights, shadows or extra scene passes. */
export class CarLights {
  private signal = 0
  constructor(
    private readonly lamps: readonly LampBinding[],
    private readonly flashMs = 450,
    private readonly courtesy: readonly CourtesyWell[] = [],
  ) {}
  toggle(side: number): void {
    this.signal = this.signal === side ? 0 : side
  }
  update(state: CarLampState, now: number, night = false): void {
    const footwell = state.powered && night
    for (const well of this.courtesy) {
      well.lamp.intensity = footwell ? 6 : 0
      well.lens.emissiveIntensity = footwell ? 0.45 : 0
    }
    if (!state.powered) this.signal = 0
    const flash = Math.floor(now / this.flashMs) % 2 === 0
    for (const lamp of this.lamps) {
      if (lamp.kind === 'front-signal') {
        const indicating = this.signal === lamp.side
        lamp.material.emissive.set(indicating ? '#ff7300' : '#e5f2ff')
        lamp.material.color.set(indicating ? '#ff9a32' : '#ebf2ff')
        lamp.material.emissiveIntensity = !state.powered ? 0 : indicating ? (flash ? 2 : 0) : 0.65
        continue
      }
      lamp.material.emissiveIntensity = !state.powered
        ? 0
        : lamp.kind === 'position'
          ? 0.65
          : lamp.kind === 'brake'
            ? state.braking
              ? 3
              : 0
            : lamp.kind === 'reverse'
              ? state.reversing
                ? 2
                : 0
              : this.signal === lamp.side && flash
                ? 2
                : 0
      if (lamp.mesh) lamp.mesh.visible = lamp.material.emissiveIntensity > 0
    }
  }
}
