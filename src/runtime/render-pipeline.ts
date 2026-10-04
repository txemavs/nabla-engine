import type * as THREE from 'three'
import type { SceneView } from '../render/entity/view.js'
import type { GeographicView } from '../render/planet/sky.js'
import type { SkyClock } from '../planet/sky.js'
import type { ShadowManager } from '../render/shadows.js'
import { DepthOfField } from '../render/effects/depth-of-field.js'
import { renderPortals, type ExternalPortalView } from '../render/portal/portals.js'
import { portalEnvironment } from '../render/portal/environment.js'
import type { VehicleMonitors } from './vehicle-monitors.js'

export interface GameRenderFrame {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  view: SceneView
  sky: GeographicView
  clock: SkyClock
  origin: THREE.Vector3
  eye: THREE.Vector3
  ambient: THREE.AmbientLight
  lights: THREE.DirectionalLight[]
  shadows: ShadowManager
  monitors: VehicleMonitors
  time: number
  mirrorVehicle: string | null
  shadowsEnabled: boolean
  depthOfField?: boolean
  skyVisible?: boolean
  externalViews?: Map<string, ExternalPortalView>
  /** World-space culling for each auxiliary view and the main view. */
  cull: (eye: THREE.Vector3) => void
  /** Editor-only objects excluded from mirrors and portal views. */
  overlays?: THREE.Object3D[]
  /** Apply editor layer visibility after auxiliary views have completed. */
  beforeMain?: () => void
  batchBuildings?: boolean
}

/** Ordered mirror, portal, sky, shadow, CSS aperture and postprocessing passes. */
export class GameRenderPipeline {
  renderedPortals = 0
  readonly depthOfField = new DepthOfField()
  /** Release owned postprocessing resources; scene, renderer and monitors remain host-owned. */
  dispose(): void {
    this.depthOfField.dispose()
  }
  /**
   * Render auxiliary views before the main scene and optional depth of field.
   * Restore render target, auto-clear and overlay visibility even when a pass throws.
   * The frame's culling callbacks may mutate scene visibility; the host retains
   * ownership of supplied scene resources and the animation clock.
   */
  render(frame: GameRenderFrame): void {
    const { renderer, scene, camera, view, sky, origin, eye, monitors } = frame
    const target = renderer.getRenderTarget(),
      autoClear = renderer.autoClear
    const overlays = (frame.overlays ?? []).map((object) => ({ object, visible: object.visible }))
    try {
      for (const { object } of overlays) object.visible = false
      if (frame.mirrorVehicle) frame.cull(eye)
      const portalStates = [...view.portals.values()].map((surface) => ({
        surface,
        live: surface.mesh.material.uniforms.live.value,
      }))
      try {
        for (const { surface } of portalStates) surface.mesh.material.uniforms.live.value = 0
        view.renderMirrors(renderer, scene, camera, frame.mirrorVehicle, frame.time)
      } finally {
        for (const { surface, live } of portalStates)
          surface.mesh.material.uniforms.live.value = live
      }
      this.renderedPortals = renderPortals(
        view.portals,
        renderer,
        scene,
        camera,
        (remote) => {
          const remoteEye = remote.position.clone().add(origin)
          frame.cull(remoteEye)
          if (!sky.enabled) return
          const restore = portalEnvironment(
            sky,
            scene,
            remoteEye,
            eye,
            origin,
            frame.clock,
            frame.ambient,
            frame.lights,
          )
          try {
            sky.render(renderer, remote, remoteEye)
            renderer.autoClear = false
          } catch (error) {
            restore()
            throw error
          }
          return restore
        },
        frame.externalViews,
      )
      for (const { object, visible } of overlays) object.visible = visible
      if (frame.batchBuildings !== undefined) view.batchBuildings = frame.batchBuildings
      frame.cull(eye)
      frame.beforeMain?.()
      sky.setViewAspect(camera.aspect)
      renderer.autoClear = true
      if (frame.depthOfField) this.depthOfField.begin(renderer)
      if (sky.enabled && frame.skyVisible !== false) {
        sky.render(renderer, camera, eye)
        renderer.autoClear = false
        renderer.clearDepth()
      }
      frame.shadows.update(camera, origin)
      monitors.prepare(camera)
      renderer.shadowMap.needsUpdate = frame.shadowsEnabled
      renderer.render(scene, camera)
      if (sky.enabled) sky.renderClouds(renderer, camera)
      monitors.finish()
      if (frame.depthOfField) this.depthOfField.present(renderer, camera)
    } finally {
      monitors.finish()
      for (const { object, visible } of overlays) object.visible = visible
      renderer.setRenderTarget(target)
      renderer.autoClear = autoClear
    }
  }
}
