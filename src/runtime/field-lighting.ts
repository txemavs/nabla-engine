import { FieldLights, type FieldLightOptions } from '../render/entity/field-lights.js'
import type { Vector3 } from 'three'
import type { Simulation } from '../simulation/simulation.js'
/** Shared geographic lights, floating-origin positioning and collision handoff. */
export class FieldLighting {
  readonly lights: FieldLights
  private followNight = true
  constructor(options: FieldLightOptions = {}) {
    this.lights = new FieldLights(options)
    this.followNight = options.layers?.navigation === undefined
  }
  setNavigation(enabled: boolean): void {
    this.followNight = false
    this.lights.layers.navigation = enabled
  }
  update(args: {
    origin: Parameters<FieldLights['update']>[0]
    eye: Vector3
    renderOrigin: Vector3
    night: boolean
    time: number
    heightAt: Parameters<FieldLights['update']>[4]
    tiles?: Parameters<FieldLights['update']>[5]
    simulation?: Pick<Simulation, 'setPoles'> | null
  }): void {
    if (this.followNight && args.night) {
      this.lights.layers.navigation = true
      this.followNight = false
    }
    this.lights.root.position.copy(args.renderOrigin).negate()
    this.lights.update(
      args.origin,
      args.eye.toArray(),
      args.night,
      args.time,
      args.heightAt,
      args.tiles,
    )
    args.simulation?.setPoles(this.lights.poles())
  }
  dispose(): void {
    this.lights.dispose()
  }
}
