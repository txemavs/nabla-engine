import { FieldLights, type FieldLightOptions } from '../render/entity/field-lights.js'
import type { Vector3 } from 'three'
import type { SceneryLayer } from './scenery-physics.js'
/** Shared geographic lights, floating-origin positioning and the handoff of posts to scenery physics. */
export class FieldLighting {
  readonly lights: FieldLights
  private followNight = true
  private sceneryKey = ''
  /** Own a light collection; omitted navigation settings follow the first observed night. */
  constructor(options: FieldLightOptions = {}) {
    this.lights = new FieldLights(options)
    this.followNight = options.layers?.navigation === undefined
  }
  /** Apply an explicit navigation-light preference and stop automatic night activation. */
  setNavigation(enabled: boolean): void {
    this.followNight = false
    this.lights.layers.navigation = enabled
  }
  /** Update geographic placement, compensate the floating origin and copy pole collisions to physics. */
  update(args: {
    origin: Parameters<FieldLights['update']>[0]
    eye: Vector3
    renderOrigin: Vector3
    night: boolean
    time: number
    heightAt: Parameters<FieldLights['update']>[4]
    tiles?: Parameters<FieldLights['update']>[5]
    /** The scenery-physics layer that gives lamp posts and tree trunks their static bodies. */
    scenery?: SceneryLayer | null
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
    if (args.scenery) this.feed(args.scenery)
  }

  /**
   * Hand the posts to the layer. The refresh is skipped while the posts, the actor cells (8 m grid)
   * and the simulation are unchanged and nothing is waiting for the creation budget.
   */
  private feed(layer: SceneryLayer): void {
    const poles = this.lights.poles()
    const actors = layer.actors()
    const key =
      (layer.available ? '1' : '0') +
      poles.map((p) => p.position.map((n) => Math.round(n * 50) / 50).join(',')).join('|') +
      '#' +
      actors.map((p) => p.map((n) => Math.floor(n / 8)).join(',')).join('|')
    if (key === this.sceneryKey && !layer.pending) return
    this.sceneryKey = key
    const nearest = (p: { position: readonly number[] }) =>
      Math.min(...actors.map((a) => Math.hypot(p.position[0] - a[0], p.position[2] - a[2])))
    const nearestFirst = poles
      .map((pole) => ({ pole, distance: nearest(pole) }))
      .sort((a, b) => a.distance - b.distance)
    layer.begin()
    for (const { pole } of nearestFirst)
      layer.add(
        pole.position.map((n) => n.toFixed(2)).join(','),
        pole.position[0],
        pole.position[1] - pole.half[1],
        pole.position[2],
        pole.half[1] * 2,
        pole.half[0],
      )
    layer.end()
  }
  /** Cancel outstanding light loads and release the owned render resources. */
  dispose(): void {
    this.lights.dispose()
  }
}
