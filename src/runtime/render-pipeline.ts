import { Fsr1 } from '../render/effects/fsr1.js'
import { latestProgramId } from './shader-diagnostics.js'
import * as THREE from 'three'
import type { SceneView } from '../render/entity/view.js'
import type { GeographicView } from '../render/planet/sky.js'
import type { SkyClock } from '../planet/sky.js'
import type { ShadowManager } from '../render/shadows.js'
import { DepthOfField } from '../render/effects/depth-of-field.js'
import { renderPortals, type ExternalPortalView } from '../render/portal/portals.js'
import { portalEnvironment } from '../render/portal/environment.js'
import type { VehicleMonitors } from './vehicle-monitors.js'
import type { GpuTimingBackend } from '../diagnostics/gpu-timing.js'
import { isWebGPU } from '../render/backend.js'
import { GpuRain } from '../render/effects/rain.js'
import type { RainWeather } from '../render/planet/weather.js'

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
  /** Local lights can update shadows independently of the sun/cascade switch. */
  localShadowUpdate?: boolean
  depthOfField?: boolean
  tunnelFocus?: number
  skyVisible?: boolean
  rainAmount?: number
  rainWeather?: RainWeather
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
  diagnostics = false
  readonly shaderPasses = new Map<number, string>()
  /** Main-thread pass timings; reused storage, not GPU timings. */
  readonly timings = {
    mirrorsMs: 0,
    portalsMs: 0,
    mainMs: 0,
    postMs: 0,
    mirrorPrograms: 0,
    portalPrograms: 0,
    mainPrograms: 0,
    postPrograms: 0,
  }
  readonly fsr = new Fsr1()
  readonly depthOfField = new DepthOfField()
  private rain?: GpuRain
  private readonly rainFog = new THREE.Fog('#8999a4', 20, 450)
  private readonly flareScene = new THREE.Scene()
  /** True once the shadow maps were cleared to «no shadow» for the shadows-off switch. */
  private shadowMapsBlank = false
  /** Optional GPU timing backend; set externally when diagnostics are enabled. */
  gpuTiming: GpuTimingBackend | null = null
  /** Release owned postprocessing resources; scene, renderer and monitors remain host-owned. */
  dispose(): void {
    this.rain?.dispose()
    this.depthOfField.dispose()
    this.fsr.dispose()
    this.gpuTiming?.dispose()
  }
  /**
   * Render auxiliary views before the main scene and optional depth of field.
   * Restore render target, auto-clear and overlay visibility even when a pass throws.
   * The frame's culling callbacks may mutate scene visibility; the host retains
   * ownership of supplied scene resources and the animation clock.
   */
  render(frame: GameRenderFrame): void {
    // GLSL-only objects are hidden inside the WebGPU renderer itself (render/backend.ts).
    if (isWebGPU(frame.renderer)) return this.renderWebGPU(frame)
    const { renderer, scene, camera, view, sky, origin, eye, monitors } = frame
    this.shaderPasses.clear()
    let lastProgramId = this.diagnostics ? latestProgramId(renderer.info.programs ?? []) : -1
    const recordShaders = (pass: string) => {
      if (!this.diagnostics) return
      for (const program of renderer.info.programs ?? []) {
        if (program.id > lastProgramId) this.shaderPasses.set(program.id, pass)
      }
      lastProgramId = latestProgramId(renderer.info.programs ?? [])
    }
    let phaseStarted = this.diagnostics ? performance.now() : 0
    let phasePrograms = renderer.info.programs?.length ?? 0
    const target = renderer.getRenderTarget(),
      autoClear = renderer.autoClear
    this.gpuTiming?.beginFrame()
    const overlays = (frame.overlays ?? []).map((object) => ({ object, visible: object.visible }))
    // Shadows switched off: the lit programs still sample each light's shadow map, so the maps
    // must exist (a missing one leaves a non-shadow texture on the shadow sampler: GL errors and
    // a black frame). Let one shadow pass allocate them, then keep them cleared to «no shadow».
    const shadowsOff = !frame.shadowsEnabled
    if (!shadowsOff) this.shadowMapsBlank = false
    const allocate = shadowsOff && missingShadowMap(frame.lights)
    if (allocate) renderer.shadowMap.needsUpdate = true
    else if (shadowsOff && !this.shadowMapsBlank) this.blankShadowMaps(frame)
    const pausedSun =
      shadowsOff && !allocate && frame.localShadowUpdate
        ? frame.lights.map((light) => ({
            shadow: light.shadow,
            auto: light.shadow.autoUpdate,
            needs: light.shadow.needsUpdate,
          }))
        : []
    for (const { shadow } of pausedSun) {
      shadow.autoUpdate = false
      shadow.needsUpdate = false
    }
    try {
      for (const { object } of overlays) object.visible = false
      if (frame.mirrorVehicle) frame.cull(eye)
      const portalStates = [...view.portals.values()].map((surface) => ({
        surface,
        live: surface.mesh.material.uniforms.live.value,
      }))
      this.gpuTiming?.beginPass('mirrors')
      try {
        for (const { surface } of portalStates) surface.mesh.material.uniforms.live.value = 0
        view.renderMirrors(
          renderer,
          scene,
          camera,
          frame.mirrorVehicle,
          frame.time,
          sky.enabled
            ? (reflection) => {
                sky.render(renderer, reflection, reflection.position.clone().add(origin))
              }
            : undefined,
        )
      } finally {
        for (const { surface, live } of portalStates)
          surface.mesh.material.uniforms.live.value = live
      }
      this.gpuTiming?.endPass('mirrors')
      recordShaders('mirrors')
      this.timings.mirrorsMs = (this.diagnostics ? performance.now() : 0) - phaseStarted
      this.timings.mirrorPrograms = (renderer.info.programs?.length ?? 0) - phasePrograms
      phaseStarted = this.diagnostics ? performance.now() : 0
      phasePrograms = renderer.info.programs?.length ?? 0
      this.gpuTiming?.beginPass('portals')
      this.renderedPortals = this.renderPortals(frame)
      this.gpuTiming?.endPass('portals')
      recordShaders('portals')
      this.timings.portalsMs = (this.diagnostics ? performance.now() : 0) - phaseStarted
      this.timings.portalPrograms = (renderer.info.programs?.length ?? 0) - phasePrograms
      phaseStarted = this.diagnostics ? performance.now() : 0
      phasePrograms = renderer.info.programs?.length ?? 0
      this.gpuTiming?.beginPass('main')
      for (const { object, visible } of overlays) object.visible = visible
      if (frame.batchBuildings !== undefined) view.batchBuildings = frame.batchBuildings
      frame.cull(eye)
      frame.beforeMain?.()
      sky.setViewAspect(camera.aspect)
      renderer.autoClear = true
      // Normal view keeps the same colour/flare pipeline even with the weapon lowered.
      // Switching render targets at the first aiming frame changes sky tone mapping.
      const focus = frame.depthOfField || frame.tunnelFocus !== undefined
      this.depthOfField.setFocus(frame.tunnelFocus ?? 0, !!frame.depthOfField)
      const upscale = this.fsr.begin(renderer)
      if (focus) this.depthOfField.begin(renderer, upscale ? this.fsr.inputSize : undefined)
      if (sky.enabled && frame.skyVisible !== false) {
        sky.render(renderer, camera, eye)
        renderer.autoClear = false
        renderer.clearDepth()
      }
      frame.shadows.update(camera, origin)
      monitors.prepare(camera)
      renderer.shadowMap.needsUpdate =
        frame.shadowsEnabled || !!frame.localShadowUpdate || missingShadowMap(frame.lights)
      const flare = sky.lensFlare
      const flareVisible = flare?.visible ?? false
      if (focus && flare) flare.visible = false
      const dryFog = scene.fog
      const rainAmount = frame.rainAmount ?? 0
      const weather = frame.rainWeather ?? { linked: false, clouds: false, amount: 0, storm: 0 }
      const haze =
        rainAmount * (weather.linked ? (weather.clouds ? weather.amount * weather.storm : 0) : 1)
      if (haze > 0) {
        this.rainFog.color.copy(dryFog?.color ?? new THREE.Color('#8999a4'))
        this.rainFog.near = 20
        this.rainFog.far = 1200 - haze * 850
        if (dryFog instanceof THREE.Fog) this.rainFog.far = Math.min(dryFog.far, this.rainFog.far)
        scene.fog = this.rainFog
      }
      try {
        renderer.render(scene, camera)
      } finally {
        scene.fog = dryFog
        if (flare) flare.visible = flareVisible
      }
      this.gpuTiming?.endPass('main')
      recordShaders('main-scene-sky-shadows')
      this.timings.mainMs = (this.diagnostics ? performance.now() : 0) - phaseStarted
      this.timings.mainPrograms = (renderer.info.programs?.length ?? 0) - phasePrograms
      phaseStarted = this.diagnostics ? performance.now() : 0
      phasePrograms = renderer.info.programs?.length ?? 0
      this.gpuTiming?.beginPass('post')
      if (allocate && !missingShadowMap(frame.lights)) this.blankShadowMaps(frame)
      if (sky.enabled) sky.renderClouds(renderer, camera)
      if (rainAmount > 0) {
        this.rain ??= new GpuRain()
        this.rain.update(
          frame.time / 1000,
          eye,
          origin,
          rainAmount,
          sky.enabled ? sky.atmosphere.day : 1,
          weather,
        )
        renderer.autoClear = false
        renderer.render(this.rain.scene, camera)
      }
      monitors.finish()
      if (focus) {
        this.depthOfField.present(renderer, camera, upscale ? this.fsr.input : null)
        if (flare && flareVisible) this.renderFocusFlare(renderer, camera, flare)
      }
      if (upscale) this.fsr.present(renderer)
      this.gpuTiming?.endPass('post')
      this.gpuTiming?.endFrame()
      recordShaders('postprocessing')
      this.timings.postMs = (this.diagnostics ? performance.now() : 0) - phaseStarted
      this.timings.postPrograms = (renderer.info.programs?.length ?? 0) - phasePrograms
    } finally {
      this.fsr.restore(renderer)
      for (const { shadow, auto, needs } of pausedSun) {
        shadow.autoUpdate = auto
        shadow.needsUpdate = needs
      }
      monitors.finish()
      for (const { object, visible } of overlays) object.visible = visible
      renderer.setRenderTarget(target)
      renderer.autoClear = autoClear
    }
  }
  /** The lens flare over the presented depth-of-field frame, occluded by the scene depth. */
  private renderFocusFlare(
    renderer: THREE.WebGLRenderer,
    camera: THREE.PerspectiveCamera,
    flare: THREE.Mesh,
  ): void {
    const parent = flare.parent
    const material = flare.material as THREE.ShaderMaterial
    const depthTest = material.depthTest
    this.flareScene.add(flare)
    material.depthTest = false
    material.uniforms.sceneDepth.value = this.depthOfField.depthTexture
    material.uniforms.useSceneDepth.value = true
    renderer.autoClear = false
    try {
      renderer.render(this.flareScene, camera)
    } finally {
      material.depthTest = depthTest
      material.uniforms.useSceneDepth.value = false
      material.uniforms.sceneDepth.value = null
      flare.removeFromParent()
      parent?.add(flare)
    }
  }
  /** Remote portal views, each with its destination's sky and environment (`portalEnvironment`). */
  private renderPortals(frame: GameRenderFrame): number {
    const { renderer, scene, camera, view, sky, origin, eye } = frame
    return renderPortals(
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
  }
  /**
   * WebGPU frame: mirrors, portals, then the main scene, timed per pass like the WebGL frame. GLSL passes without a node-material port yet are
   * skipped; see docs/webgpu.md.
   */
  private renderWebGPU(frame: GameRenderFrame): void {
    const { renderer, scene, camera, view, eye, monitors } = frame
    const target = renderer.getRenderTarget(),
      autoClear = renderer.autoClear
    const overlays = (frame.overlays ?? []).map((object) => ({ object, visible: object.visible }))
    this.renderedPortals = 0
    const started = this.diagnostics ? performance.now() : 0
    const timing = this.gpuTiming
    timing?.beginFrame()
    try {
      for (const { object } of overlays) object.visible = false
      if (frame.mirrorVehicle) frame.cull(eye)
      // Mirrors capture through the TSL reflector twin (mirror-nodes.ts), with the sky pass painted
      // into each capture as under WebGL; portals show black inside mirror captures there too.
      const portalStates = [...view.portals.values()].map((surface) => ({
        surface,
        live: surface.mesh.material.uniforms.live.value,
      }))
      for (const { surface } of portalStates) surface.mesh.material.uniforms.live.value = 0
      timing?.beginPass('mirrors')
      try {
        view.renderMirrors(
          renderer,
          scene,
          camera,
          frame.mirrorVehicle,
          frame.time,
          frame.sky.enabled && frame.skyVisible !== false
            ? (reflection) =>
                frame.sky.render(
                  renderer,
                  reflection,
                  reflection.position.clone().add(frame.origin),
                )
            : undefined,
        )
      } finally {
        for (const { surface, live } of portalStates)
          surface.mesh.material.uniforms.live.value = live
      }
      timing?.endPass('mirrors')
      const mirrorsDone = this.diagnostics ? performance.now() : 0
      this.timings.mirrorsMs = mirrorsDone - started
      timing?.beginPass('portals')
      this.renderedPortals = this.renderPortals(frame)
      timing?.endPass('portals')
      const portalsDone = this.diagnostics ? performance.now() : 0
      this.timings.portalsMs = portalsDone - mirrorsDone
      timing?.beginPass('main')
      for (const { object, visible } of overlays) object.visible = visible
      if (frame.batchBuildings !== undefined) view.batchBuildings = frame.batchBuildings
      frame.cull(eye)
      frame.beforeMain?.()
      frame.sky.setViewAspect(camera.aspect)
      renderer.autoClear = true
      // Depth of field and FSR 1 as under WebGL; their passes have node twins (effect-nodes.ts).
      const focus = frame.depthOfField || frame.tunnelFocus !== undefined
      this.depthOfField.setFocus(frame.tunnelFocus ?? 0, !!frame.depthOfField)
      const upscale = this.fsr.begin(renderer)
      if (focus) this.depthOfField.begin(renderer, upscale ? this.fsr.inputSize : undefined)
      frame.shadows.update(camera, frame.origin)
      monitors.prepare(camera)
      renderer.shadowMap.needsUpdate = frame.shadowsEnabled || !!frame.localShadowUpdate
      // The sky scene draws first, as under WebGL; its GLSL pieces have TSL twins (sky-nodes.ts).
      const background = scene.background
      const skyDrawn = frame.sky.enabled && frame.skyVisible !== false
      if (skyDrawn) {
        frame.sky.render(renderer, camera, eye)
        renderer.autoClear = false
        renderer.clearDepth()
      } else if (!background && frame.skyVisible !== false)
        scene.background = scene.fog?.color ?? webgpuBackdrop
      const flare = frame.sky.lensFlare
      const flareVisible = flare?.visible ?? false
      if (focus && flare) flare.visible = false
      try {
        renderer.render(scene, camera)
      } finally {
        scene.background = background
        if (flare) flare.visible = flareVisible
      }
      if (skyDrawn) frame.sky.renderClouds(renderer, camera)
      monitors.finish()
      timing?.endPass('main')
      timing?.beginPass('post')
      if (focus) {
        this.depthOfField.present(renderer, camera, upscale ? this.fsr.input : null)
        if (flare && flareVisible) this.renderFocusFlare(renderer, camera, flare)
      }
      if (upscale) this.fsr.present(renderer)
      timing?.endPass('post')
      timing?.endFrame()
      this.timings.mainMs = (this.diagnostics ? performance.now() : 0) - portalsDone
      this.timings.postMs = 0
    } finally {
      this.fsr.restore(renderer)
      monitors.finish()
      for (const { object, visible } of overlays) object.visible = visible
      renderer.setRenderTarget(target)
      renderer.autoClear = autoClear
    }
  }
  /** Clear every shadow map to its far depth (fully lit); the current render target is kept. */
  private blankShadowMaps(frame: GameRenderFrame): void {
    const { renderer } = frame
    const target = renderer.getRenderTarget()
    try {
      for (const light of frame.lights) {
        const map = light.castShadow ? light.shadow?.map : null
        if (!map) continue
        renderer.setRenderTarget(map as THREE.WebGLRenderTarget)
        renderer.clear(true, true, false)
      }
      this.shadowMapsBlank = true
    } finally {
      renderer.setRenderTarget(target)
    }
  }
}

/** Sky stand-in under WebGPU, matching the mirror capture backdrop. */
const webgpuBackdrop = new THREE.Color('#a6bbd5')

/** A shadow-casting light whose map the renderer has not created yet. */
function missingShadowMap(lights: readonly THREE.DirectionalLight[]): boolean {
  return lights.some((light) => light.castShadow && !light.shadow?.map)
}
