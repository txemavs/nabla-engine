/**
 * Compose a complete browser game over the shared gameplay coordinator.
 * This owner creates GPU resources, terrain streaming, input listeners, audio,
 * monitors and a single frame loop. Hosts supply a canvas and authored planetary
 * scene; dispose releases owned resources without removing the host canvas.
 */
import { resolveDisplaySettings, type DisplaySettings } from '../config/display.js'
import type { RuntimeFrameSample } from '../diagnostics/runtime-frame.js'
export type { RuntimeFrameSample } from '../diagnostics/runtime-frame.js'
import { controlDefaults } from '../config/controls.js'
import { lightingDefaults } from '../config/lighting.js'
import { streamingDefaults } from '../config/streaming.js'
import { simulationDefaults } from '../config/simulation.js'
import { gameCameraDefaults, type GameCameraSettings } from '../config/camera.js'
import {
  portalRegistry,
  setPortalConnection,
  resolveWorldPortalViews,
  type WorldContent,
} from './world-content.js'
import { RemotePortalViews } from '../render/portal/remote.js'
import { FieldLighting } from './field-lighting.js'
import type { FieldLightOptions } from '../render/entity/field-lights.js'
import { worldWater } from './water.js'
import {
  browserPerformanceDefaults,
  normalizePerformance,
  performancePresets,
  streamBudget,
  tileBudget,
  type PerformanceSettings,
} from './performance.js'
import type { MissingTile } from '../planet/missing-tiles.js'
import { GameRenderPipeline } from './render-pipeline.js'
import { Sidearm } from './sidearm.js'
import { Gallery } from './gallery.js'
import { fireSidearm } from './shooting.js'
import { TouchDriving, type TouchDrivingVisibility } from './touch-driving.js'
import { vehicleMenuKey } from './vehicle-menu.js'
import { VehicleMonitors } from './vehicle-monitors.js'
import * as THREE from 'three'
import { parseScene, type SceneDocument } from '../scene/document.js'
import { SceneView } from '../presentation/scene-view.js'
import { GeographicView } from '../render/planet/sky.js'
import {
  PlanetWorld,
  type TileTiming,
  type LoadDiagnostics,
  type TileDiscoveryMode,
  type PlanetSourceOptions,
} from '../render/planet/world.js'
import { WorldEnvironment, configureWorldRenderer } from '../render/planet/world-environment.js'
import { CatchFloor } from '../render/planet/catch-floor.js'
import { ShadowManager } from '../render/shadows.js'
import { shadowTiers } from '../render/shadow-tiers.js'
import { localToGeo, geoToLocal } from '../math/geo/sphere.js'
import { mapTileSample } from '../scene/mercator.js'
import type { PlayOptions } from './session.js'
import { createGameCameraState } from './game-camera.js'
import { GameRuntime as SharedGameRuntime } from './game.js'
import { availableGamepads } from './input.js'
import { playGroundClearance } from './placement.js'
import { hiddenTileLayers, setHiddenTileLayers } from '../render/planet/tile-layers.js'
import { auditGround, type GroundAudit } from './ground-audit.js'
import { FrameLoop } from './frame-loop.js'
import { normalizeTilesBase } from '../render/planet/static-tiles.js'
import { VehicleEffects } from './vehicle-effects.js'
import { gearLabel } from '../entity/vehicle/gear-label.js'

import { waitForGround } from './ground.js'
import { GameHud } from './hud.js'
import { WheelDebugOverlay } from '../diagnostics/wheel-debug.js'
import { createRuntimeText, type RuntimeLocale } from './messages.js'

export interface GameFrame {
  speedKmh: number
  gear: number | null
  /** HUD text: `R`, `D3` in automatic mode, `M3` in manual mode; null outside a gearbox vehicle. */
  gearLabel: string | null
  location: ReturnType<typeof localToGeo> | null
}
export interface GameRuntimeOptions {
  /** Per-instance camera recovery settings; omitted fields use Engine defaults. */
  camera?: Partial<GameCameraSettings>
  canvas: HTMLCanvasElement
  /** Render the Engine-owned gameplay HUD inside the canvas parent. */
  hud?: boolean
  /** Initial audio preference; hosts may change it later with setAudioEnabled. */
  audio?: boolean
  /** Per-instance UI language and optional message-template overrides. English is the fallback. */
  locale?: RuntimeLocale
  messages?: Readonly<Record<string, string>>
  /** Additional host focus policy, for editor menus and docked panels. */
  acceptsInput?: () => boolean
  scene: SceneDocument
  world?: WorldContent
  tiles?: { baseUrl: string; apiUrl?: string; mode?: TileDiscoveryMode } & PlanetSourceOptions
  /** Disable only the visible water sheet for a synthetic sea-level test surface. */
  sea?: boolean
  /**
   * Also rest every other vehicle of the scene on the loaded ground before play (the player's
   * vehicle always is). Needed on real terrain, where a fixed authored height is wrong.
   * Towed trailers keep their offset from the tractor.
   */
  restParkedOnGround?: boolean
  clock?: 'automatic' | 'manual'
  /** Frame cap and additional resolution scaling; caps apply only to the automatic clock. */
  display?: Partial<DisplaySettings>
  /** Auto shows driving controls on coarse-pointer devices; false disables them. */
  touchControls?: TouchDrivingVisibility | false
  depthOfField?: boolean
  performance?: Partial<PerformanceSettings>
  /** Explicit opt-in; omit to keep offline games independent of external light data. */
  fieldLights?: FieldLightOptions
  onProgress?: (status: string, loadedTiles?: string[]) => void
  onFrame?: (frame: GameFrame) => void
  /** Opt-in per-frame CPU and render counters; omit to avoid diagnostics collection. */
  onDiagnostics?: (sample: RuntimeFrameSample) => void
  onMessage?: (message: string) => void
  onError?: (error: unknown) => void
}

/** Browser composition over the same session, camera, input and effects used by Studio.
 * Owns its renderer and listeners; the caller owns the canvas and surrounding UI.
 */
export class GameRuntime {
  readonly game = new SharedGameRuntime()
  readonly session = this.game.session
  readonly cameraState = this.game.cameraState
  private readonly document: SceneDocument
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(
    gameCameraDefaults.chaseFov,
    1,
    gameCameraDefaults.nearClip,
    gameCameraDefaults.farClip,
  )
  private readonly renderer: THREE.WebGLRenderer
  private readonly remoteViews: RemotePortalViews
  private readonly worldContent: WorldContent | undefined
  private readonly fieldLighting: FieldLighting | null
  private display: DisplaySettings
  private quality: PerformanceSettings
  private readonly pipeline = new GameRenderPipeline()
  private readonly gallery: Gallery
  private sidearm: Sidearm | null = null
  private weaponDrawn = false
  private fireRequested = false
  private readonly touchDriving: TouchDriving | null
  private readonly monitors: VehicleMonitors
  private readonly view: SceneView
  private readonly sky: GeographicView
  private readonly environment: WorldEnvironment
  private readonly effects: VehicleEffects
  private readonly shadows = new ShadowManager()
  private readonly sun = new THREE.DirectionalLight(
    lightingDefaults.sunColor,
    lightingDefaults.sunIntensity,
  )
  private readonly ambient = new THREE.AmbientLight(
    lightingDefaults.ambientColor,
    lightingDefaults.ambientIntensity,
  )
  private readonly catchFloor = new CatchFloor()
  private readonly origin = new THREE.Vector3()
  private readonly loop: FrameLoop
  private readonly keys = this.game.keys
  private readonly lifetime = new AbortController()
  private readonly observer: ResizeObserver
  private readonly world: PlanetWorld | null
  private loading: AbortController | null = null
  private lastTime: number | null = null
  private previousButtons: boolean[] = []
  private previousPad: number | null = null
  private readonly originalTabIndex: string | null
  private disposed = false
  private readonly hud: GameHud | null
  private readonly wheelDebug = new WheelDebugOverlay()
  private readonly text: ReturnType<typeof createRuntimeText>

  constructor(private readonly options: GameRuntimeOptions) {
    // Reject malformed JavaScript callers before allocating browser resources.
    if (options.tiles) normalizeTilesBase(options.tiles.baseUrl)
    this.text = createRuntimeText(options.locale, options.messages)
    this.game.text = this.text
    this.hud = options.hud ? new GameHud(options.canvas.parentElement!, this.text) : null
    this.scene.add(this.wheelDebug.root)
    this.display = resolveDisplaySettings(options.display)
    Object.assign(this.cameraState, createGameCameraState(options.camera))
    this.camera.near = this.cameraState.settings.nearClip
    this.camera.far = this.cameraState.settings.farClip
    const profile = options.performance?.preset
    const preset =
      profile && Object.hasOwn(performancePresets, profile)
        ? performancePresets[profile as keyof typeof performancePresets].settings
        : {}
    this.quality = normalizePerformance({
      ...browserPerformanceDefaults,
      ...preset,
      ...options.performance,
    })
    this.document = parseScene(options.scene)
    this.worldContent = options.world ? structuredClone(options.world) : undefined
    this.remoteViews = new RemotePortalViews(
      () => {},
      (message) => options.onMessage?.(message),
      (doc) => new SceneView(doc),
      (doc) =>
        doc.geography && options.tiles
          ? new PlanetWorld(
              doc.geography,
              () => {},
              () => {},
              options.tiles.baseUrl,
              options.tiles.apiUrl ?? '/prepare',
              options.tiles.mode ?? 'static',
              options.tiles,
            )
          : undefined,
    )
    if (!this.document.geography)
      throw new Error('A Nabla game requires planetary coordinates, including offline scenes')
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true,
    })
    configureWorldRenderer(this.renderer)
    if (options.onDiagnostics) this.renderer.info.autoReset = false
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.quality.resolution) *
        this.display.resolutionScale,
    )
    this.renderer.shadowMap.enabled = this.quality.shadows > 0
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.scene.add(this.sun, this.ambient, this.catchFloor.mesh)
    this.fieldLighting = options.fieldLights ? new FieldLighting(options.fieldLights) : null
    if (this.fieldLighting) this.scene.add(this.fieldLighting.lights.root)
    this.view = new SceneView(this.document)
    this.scene.add(this.view.root)
    this.monitors = new VehicleMonitors(
      options.canvas.parentElement!,
      (message) => options.onMessage?.(message),
      options.canvas,
      this.text,
    )
    this.monitors.onShipSwitch = (id, kind) => this.view.pressShipSwitch(id, kind)
    if (this.worldContent) {
      const world = this.worldContent
      const source = (id: string) =>
        portalRegistry(world).find(
          (entry) => entry.entityId === id && entry.locationId === world.activeLocation,
        )
      this.monitors.projectRegistry = {
        entries: () =>
          portalRegistry(world).filter((entry) => entry.locationId !== world.activeLocation),
        selected: (id) =>
          world.connections?.find((connection) => connection.source === source(id)?.id)
            ?.destination,
        configure: (id, destination, open) => {
          const entry = source(id)
          if (!entry) throw new Error('Portal is not registered')
          const mouth = this.document.entities.find((entity) => entity.id === id)
          const sim = this.session.simulation
          if (
            open &&
            mouth?.portal?.clearsRamp &&
            mouth.parentId &&
            sim &&
            !sim.vehicleInfo(mouth.parentId).rampClosed
          )
            throw new Error('Close the garage door first')
          if (destination && sim) sim.configurePortal(id, null, 'closed')
          Object.assign(
            world,
            setPortalConnection(world, entry.id, destination, open ? 'window' : 'closed'),
          )
          this.remoteViews.dispose()
          return this.text(open ? 'Remote window open' : 'Remote window closed')
        },
        status: (id) => {
          const connection = world.connections?.find((item) => item.source === source(id)?.id)
          return connection
            ? this.text(
                connection.mode === 'window' ? 'Remote window open' : 'Remote window closed',
              )
            : undefined
        },
      }
    }
    this.monitors.rebuild(this.document)
    this.gallery = new Gallery(options.canvas.parentElement!, this.text)
    this.sky = new GeographicView(this.document, () => {})
    this.environment = new WorldEnvironment(this.scene, this.sun, this.ambient)
    this.effects = new VehicleEffects(this.scene)
    this.effects.audio.setEnabled(options.audio !== false)
    this.touchDriving =
      options.touchControls === false
        ? null
        : new TouchDriving(
            options.canvas.parentElement!,
            {
              engage: () => {
                options.canvas.focus()
                this.effects.audio.unlock()
              },
              interact: () => this.action('KeyE'),
              camera: () => this.cycleCamera(),
            },
            options.touchControls ?? 'auto',
            this.text,
          )
    if (this.quality.shadows > 0)
      this.shadows.init({
        camera: this.camera,
        scene: this.scene,
        lightDirection: new THREE.Vector3(25, -45, -25).normalize(),
        tier: shadowTiers[this.quality.shadows]!,
      })
    this.view.setVehicleShadowReceiving(!!this.quality.vehicleShadows)
    this.view.setupMaterials((material) => this.shadows.setupMaterial(material))
    this.shadows.setupMaterial(this.catchFloor.mesh.material)
    this.sun.visible = this.quality.shadows === 0
    this.world =
      options.tiles && this.document.geography
        ? new PlanetWorld(
            this.document.geography,
            () => {},
            (material) => this.shadows.setupMaterial(material),
            options.tiles.baseUrl,
            options.tiles.apiUrl ?? '/prepare',
            options.tiles.mode ?? 'static',
            options.tiles,
          )
        : null
    if (this.world) {
      const budget = streamBudget(this.quality)
      this.world.setQuality(budget.concurrent, budget.ahead, budget.retain, budget.tiles)
      this.world.setDistance(this.quality.distance)
      this.world.setRelief(this.quality.relief)
      this.scene.add(this.world.root)
    }
    this.loop = new FrameLoop((time) => {
      try {
        this.frame(time)
      } catch (error) {
        this.pause()
        this.options.onError?.(error)
      }
    })
    this.loop.setMaxFps(this.display.maxFps)
    this.originalTabIndex = options.canvas.getAttribute('tabindex')
    options.canvas.tabIndex = 0
    this.bindInput()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(options.canvas)
    this.resize()
  }

  /** Prepare usable terrain and presentation before starting physics; reject cancelled/failed loads. */
  async play(options: PlayOptions = {}): Promise<void> {
    this.assertAlive()
    this.stop()
    const controller = new AbortController()
    this.loading = controller
    const document = structuredClone(this.document)
    try {
      if (this.world) {
        const progress = (status: string) =>
          this.options.onProgress?.(
            status,
            this.world!.activeTiles.map((tile) => tile.key),
          )
        // A finite example loads its declared coverage before the player can cross a seam.
        for (const tile of this.options.tiles?.tiles ?? []) {
          await waitForGround(
            this.world,
            geoToLocal(this.document.geography!, mapTileSample(tile, 1, 1, 2)),
            {
              signal: controller.signal,
              onProgress: progress,
            },
          )
        }
        const spawn =
          document.entities.find((entity) => entity.id === options.vehicleId) ??
          document.entities.find((entity) => entity.kind === 'spawn')
        if (!spawn) throw new Error('A spawn entity is required')
        const ground = await waitForGround(this.world, spawn.transform.position, {
          signal: controller.signal,
          onProgress: progress,
        })
        spawn.transform.position[1] = ground + playGroundClearance(spawn)
        if (this.options.restParkedOnGround) {
          const authored = new Map(
            this.document.entities.map((entity) => [entity.id, entity.transform.position[1]]),
          )
          const towed = document.entities.filter((entity) => entity.vehicle?.tow)
          for (const entity of document.entities) {
            if (entity === spawn || !entity.vehicle || entity.vehicle.tow) continue
            entity.transform.position[1] =
              (await waitForGround(this.world, entity.transform.position, {
                signal: controller.signal,
                onProgress: progress,
              })) + playGroundClearance(entity)
          }
          for (const trailer of towed) {
            const tractor = document.entities.find(
              (entity) => entity.id === trailer.vehicle!.tow!.vehicleId,
            )
            if (!tractor) continue
            trailer.transform.position[1] =
              tractor.transform.position[1] +
              (authored.get(trailer.id)! - authored.get(tractor.id)!)
          }
        }
        progress('Ground ready')
      }
      controller.signal.throwIfAborted()
      this.options.onProgress?.('Starting simulation…')
      const simulation = await this.game.play(document, {
        playerMode: 'walk',
        ...options,
        planetaryTerrain: !!document.geography?.planetary,
      })
      simulation.setCollisionDistance(this.quality.collisions)
      controller.signal.throwIfAborted()
      this.cameraState.mode = options.vehicleId ? 'cockpit' : 'chase'
      this.view.setPlaying(true)
      this.effects.audio.setSuspended(globalThis.document.hidden)
      this.world?.renderUpdate(this.origin, !!this.quality.buildings, this.session.simulation)
      this.lastTime = null
      if (this.options.clock !== 'manual') this.loop.start()
    } catch (error) {
      if (this.loading === controller) this.stop()
      throw error
    } finally {
      if (this.loading === controller) this.loading = null
    }
  }

  /** Suspend the frame loop, physics, audio and held input while retaining loaded resources. */
  pause(): void {
    this.assertAlive()
    this.touchDriving?.setActive(false)
    this.game.pause()
    this.loop.stop()
    this.releaseInput()
    this.effects.audio.setSuspended(true)
    this.lastTime = null
  }
  /** Resume paused gameplay and automatic scheduling; manual-clock hosts still supply ticks. */
  resume(): void {
    this.assertAlive()
    this.game.resume()
    this.effects.audio.setSuspended(document.hidden)
    this.lastTime = null
    if (this.session.state === 'playing' && this.options.clock !== 'manual') this.loop.start()
  }
  /** Cancel loading and reset gameplay/presentation for replay while retaining reusable renderer resources. */
  stop(): void {
    if (this.disposed) return
    this.loading?.abort()
    this.loading = null
    this.loop.stop()
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, null)
    this.touchDriving?.setActive(false)
    this.monitors.hide()
    this.remoteViews.dispose()
    this.fieldLighting?.lights.reset()
    this.weaponDrawn = false
    if (this.sidearm) {
      this.sidearm.visible = false
      this.sidearm.reset()
    }
    this.gallery.reset()
    this.gallery.update(this.view, false, 0)
    this.game.stop()
    this.releaseInput()
    this.view.setPlaying(false)
    this.effects.updateAudio(null, this.document, this.camera.position)
    this.effects.updateTires(null, 0, this.origin)
    this.lastTime = null
  }
  /** Host-owned scheduling is exclusive with the automatic loop. Time is in milliseconds. */
  tick(time: number): void {
    this.assertAlive()
    if (this.options.clock !== 'manual') throw new Error('tick requires a manual clock')
    this.frame(time)
  }
  /** Fit renderer and projection to canvas CSS dimensions; ignore notifications after disposal. */
  resize(): void {
    if (this.disposed) return
    const width = Math.max(1, this.options.canvas.clientWidth)
    const height = Math.max(1, this.options.canvas.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }
  /** Release GPU/audio/DOM listeners and restore canvas tab index. Idempotent and terminal. */
  dispose(): void {
    if (this.disposed) return
    this.stop()
    this.disposed = true
    this.lifetime.abort()
    this.observer.disconnect()
    this.game.dispose()
    this.world?.dispose()
    this.sidearm?.dispose()
    this.gallery.dispose()
    this.touchDriving?.dispose()
    this.monitors.dispose()
    this.view.dispose()
    this.sky.dispose()
    this.environment.dispose()
    this.fieldLighting?.dispose()
    this.effects.dispose()
    this.pipeline.dispose()
    this.shadows.dispose()
    this.catchFloor.dispose()
    this.hud?.dispose()
    this.wheelDebug.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    if (this.originalTabIndex === null) this.options.canvas.removeAttribute('tabindex')
    else this.options.canvas.setAttribute('tabindex', this.originalTabIndex)
  }

  private frame(time: number): void {
    const sim = this.session.simulation
    if (this.disposed || !sim || this.session.state !== 'playing') return
    if (!Number.isFinite(time)) throw new Error('Invalid frame time')
    const measuring = !!this.options.onDiagnostics
    const cpuStart = measuring ? performance.now() : 0
    const frameMs = this.lastTime === null ? 0 : Math.max(0, time - this.lastTime)
    if (measuring) this.renderer.info.reset()
    const dt =
      this.lastTime === null
        ? 0
        : Math.min(simulationDefaults.maxFrameSeconds, Math.max(0, (time - this.lastTime) / 1000))
    this.lastTime = time
    this.touchDriving?.setActive(document.hasFocus() && !document.hidden)
    if (document.hidden) return
    if (!this.hasInput()) this.releaseInput()
    this.keys.expire(performance.now())
    this.canvasDiagnostics(frameMs)
    const pad = this.pollGamepad()
    const installStart = measuring ? performance.now() : 0
    this.world?.flushInstall(
      this.quality.preset === 'mobile' || this.quality.preset === 'minimal'
        ? streamingDefaults.mobileInstallBudgetMs
        : streamingDefaults.installBudgetMs,
    )
    this.view.flushMapInstall(
      streamingDefaults.mapInstallBudgetMs,
      streamingDefaults.mapInstallCount,
      this.camera.position,
    )
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, sim)
    const installMs = measuring ? performance.now() - installStart : 0
    const input = this.game.readInput(dt, {
      keys: this.keys.values,
      yaw: this.cameraState.yaw,
      pad,
      touch: this.monitors.flightInput(),
      driving: this.touchDriving?.input(),
      enabled: this.hasInput(),
      menuOpen: !!(sim.player.vehicleId && this.view.vehicleMenu(sim.player.vehicleId)?.open),
    })
    const water = worldWater(this.document.water, this.document.sky)
    this.environment.ocean.setLevel(water.level)
    const physicsStart = measuring ? performance.now() : 0
    const crossing = this.game.step(dt, input, water.level, time)
    const physicsMs = measuring ? performance.now() - physicsStart : 0
    if (crossing)
      this.options.onMessage?.(
        crossing.blocked ? this.text('Passage blocked') : this.text('Stargate crossed'),
      )
    if (this.world) this.game.streaming.update(this.world, sim, this.document, time)
    this.view.night = this.sky.enabled && this.sky.atmosphere.day < lightingDefaults.nightThreshold
    this.view.sync(
      sim,
      dt,
      sim.player.vehicleId ? this.cameraState.mode === 'cockpit' : this.cameraState.firstPerson,
      this.cameraState.headYaw,
      this.cameraState.headPitch,
    )
    const { player, info } = this.game.updateCamera(this.view, this.camera, time, dt)
    const canvas = this.options.canvas
    canvas.dataset.vehicle = player.vehicleId ?? ''
    canvas.dataset.interior = player.interiorId ?? ''
    canvas.dataset.cameraMode = player.vehicleId
      ? this.cameraState.mode
      : this.cameraState.firstPerson
        ? 'first-person'
        : 'chase'
    canvas.dataset.mapHeight = String(Math.round(this.cameraState.mapHeight))
    canvas.dataset.vehicleEntrance = this.cameraState.entrance ? 'active' : 'complete'
    if (crossing) canvas.dataset.portalCrossings = String(crossing.sequence)
    this.gallery.update(this.view, true, dt)
    if (this.sidearm) {
      this.sidearm.visible = !sim.player.vehicleId && this.weaponDrawn
      if (this.fireRequested && this.hasInput()) {
        fireSidearm(
          this.sidearm,
          this.gallery,
          sim,
          this.view,
          this.camera,
          time,
          this.cameraState.firstPerson,
        )
        this.options.canvas.dataset.impacts = String(this.view.impacts.count)
      }
    }
    this.fireRequested = false
    const eye = this.camera.position.clone()
    this.origin.set(0, 0, 0)
    if (new THREE.Vector3(...player.position).length() > streamingDefaults.floatingOriginDistance)
      this.origin.fromArray(player.position)
    if (this.wheelDebug.isEnabled) {
      const surfaces: THREE.Object3D[] = []
      for (const entity of this.document.entities) {
        const object = this.view.objects.get(entity.id)
        if (object && (entity.terrain || entity.road)) surfaces.push(object)
      }
      this.world?.root.traverseVisible((object) => {
        if (
          (object as THREE.Mesh).isMesh &&
          ['Terrain', 'Roads'].includes(object.userData.category)
        )
          surfaces.push(object)
      })
      this.wheelDebug.setTerrainMeshes(surfaces)
      this.wheelDebug.update(sim, player.vehicleId, this.origin)
    }
    this.hud?.update({
      speedKmh: player.speed * 3.6,
      gear: info?.gear ?? null,
      gearLabel: info ? gearLabel(info.gear, info.manualTransmission, info.parked) : null,
      vehicle:
        this.document.entities.find((entity) => entity.id === player.vehicleId)?.name ?? null,
      cameraMode: canvas.dataset.cameraMode!,
      interaction: player.vehicleId
        ? 'E exit · C camera · L lights · F9 wheel diagnostics'
        : 'WASD move · Space jump · E enter · C camera',
      wheelDebug: this.wheelDebug.formatHud(),
    })
    this.effects.updateAudio(sim, this.document, eye)
    this.effects.updateTires(sim, dt, this.origin)
    this.environment.updateSea(
      this.document.geography,
      eye,
      this.origin,
      Math.max(this.quality.distance, this.quality.fog * 2),
      time,
      this.options.sea !== false,
    )
    const height = this.environment.updateSky(
      this.sky,
      eye,
      this.origin,
      this.document.sky ?? { mode: 'live' },
      this.quality.fog,
    )
    const previousFar = this.camera.far
    if (this.sky.enabled) {
      const direction = this.environment.applyLighting(this.sky)
      this.shadows.setLightDirection(direction.clone().negate())
      this.shadows.setLightIntensity(this.sun.intensity)
      this.shadows.setLightColor(this.sun.color)
      this.camera.far = Math.hypot(
        Math.max(height >= 2000 ? 80000 : 12000, this.quality.distance + 500),
        Math.max(0, height),
      )
    } else {
      this.scene.background = new THREE.Color('#a6bbd5')
      this.scene.fog = new THREE.Fog('#a6bbd5', this.quality.fog * 0.75, this.quality.fog)
    }
    if (this.camera.far !== previousFar) this.camera.updateProjectionMatrix()
    this.view.root.position.copy(this.origin).negate()
    this.world?.renderUpdate(this.origin, !!this.quality.buildings, sim)
    const disk = sim.catchDisk()
    if (disk) this.catchFloor.show(disk.position, disk.rotation, this.origin)
    else this.catchFloor.hide()
    this.view.streetlights.update(eye, this.view.night, this.quality.distance)
    this.cull(eye)
    this.monitors.update(
      sim,
      this.document,
      this.camera,
      this.view.portalTablets,
      this.view.helmScreens,
      this.view.touchScreens,
      this.view.flightScreens,
      this.view.placeScreens,
      this.view.systemScreens,
      this.origin,
      this.cameraState.mode === 'cockpit',
    )
    this.fieldLighting?.update({
      origin: this.document.geography,
      eye,
      renderOrigin: this.origin,
      night: this.view.night,
      time,
      heightAt: (p) => this.world?.groundHeight(p),
      tiles: this.world?.activeTiles.map((tile) => tile.manifest.tile) ?? [],
      simulation: sim,
    })
    this.camera.position.sub(this.origin)
    for (const [id, hud] of this.view.shipHuds) {
      const inside =
        (player.interiorId === id && this.cameraState.firstPerson) ||
        (player.vehicleId === id && this.cameraState.mode === 'cockpit')
      hud.update(this.camera, this.origin, time, inside ? sim.vehicleInfo(id) : null)
    }
    try {
      this.pipeline.render({
        externalViews: this.worldContent
          ? resolveWorldPortalViews(
              this.worldContent,
              this.view.portals,
              (location, document, entity) => this.remoteViews.resolve(location, document, entity),
            )
          : undefined,
        renderer: this.renderer,
        scene: this.scene,
        camera: this.camera,
        view: this.view,
        sky: this.sky,
        clock: this.document.sky ?? { mode: 'live' },
        origin: this.origin,
        eye,
        ambient: this.ambient,
        lights: [this.sun, ...this.shadows.lights],
        shadows: this.shadows,
        monitors: this.monitors,
        time,
        mirrorVehicle:
          this.quality.mirrors && this.cameraState.mode === 'cockpit' ? player.vehicleId : null,
        shadowsEnabled: this.quality.shadows > 0,
        depthOfField: this.options.depthOfField ?? !!this.quality.dof,
        cull: (position) => this.cull(position),
      })
    } finally {
      this.camera.position.copy(eye)
    }
    this.options.canvas.dataset.portalViews = String(this.pipeline.renderedPortals)
    this.sidearm?.render(this.renderer, time, this.camera.aspect, this.cameraState.firstPerson)
    if (this.options.onDiagnostics)
      this.options.onDiagnostics({
        frameMs,
        cpuMs: performance.now() - cpuStart,
        physicsMs,
        installMs,
        calls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        width: this.renderer.domElement.width,
        height: this.renderer.domElement.height,
        droppedSeconds: sim.stats.droppedSeconds,
      })
    this.options.onFrame?.({
      speedKmh: player.speed * 3.6,
      gear: info?.gear ?? null,
      gearLabel: info ? gearLabel(info.gear, info.manualTransmission, info.parked) : null,
      location: this.document.geography
        ? localToGeo(this.document.geography, player.position)
        : null,
    })
  }

  /** Terrain cells loaded and drawn of the known dataset; null without tiles. */
  get cellStats(): {
    loaded: number
    visible: number
    missing: number
    pending: number
    failed: number
  } | null {
    return this.world?.cellStats ?? null
  }
  /**
   * Change how far terrain is loaded and how many cells stay in memory, live. Unset fields keep their value,
   * except that a new distance without `cells` resets the cells to the quality profile for that distance.
   * The disk cache is separate (`setMapCacheBudget`, `clearMapCache`).
   */
  setStreaming(options: { distance?: number; cells?: number }): void {
    this.assertAlive()
    if (options.distance !== undefined) {
      if (!Number.isFinite(options.distance) || options.distance < 500 || options.distance > 20000)
        throw new Error('Load distance must be 500–20000 m')
      this.quality = { ...this.quality, distance: options.distance }
      this.world?.setDistance(options.distance)
      // A longer radius needs more cells resident, unless the caller sets the number.
      if (options.cells === undefined) this.world?.setMaxTiles(tileBudget(options.distance))
    }
    if (options.cells !== undefined) this.world?.setMaxTiles(options.cells)
  }
  /** Current load radius (metres) and cells kept in memory. */
  get streaming(): { distance: number; cells: number } {
    return { distance: this.quality.distance, cells: this.world?.maxCells ?? 0 }
  }
  /** What the loading screen needs: requests in flight, failures, holes and the last error. */
  get loadDiagnostics(): LoadDiagnostics | null {
    return this.world?.loadDiagnostics ?? null
  }
  /** Tiles the host does not have (z/x/y, HTTP status, when): holes in the map, kept for the tile producer. */
  get missingTiles(): MissingTile[] {
    return this.world?.missingTiles ?? []
  }
  clearMissingTiles(): void {
    this.world?.clearMissingTiles()
  }
  /** Per-cell load timings (worker phases, install steps, photo), keyed by cell id; empty without tiles. */
  get cellTimings(): [string, TileTiming][] {
    return [...(this.world?.tileTimings ?? [])]
  }
  /** Ids of the terrain layers switched off (see `TILE_LAYERS`). */
  get hiddenLayers(): string[] {
    return hiddenTileLayers()
  }
  /** Show or hide terrain layers live; only drawing changes, never collision. */
  setHiddenLayers(ids: Iterable<string>): void {
    this.assertAlive()
    setHiddenTileLayers(ids)
    this.world?.applyLayers()
  }
  /** Where every vehicle and the player sit against the loaded ground; null when not playing. */
  groundAudit(): GroundAudit | null {
    const sim = this.session.simulation
    if (!sim || !this.world) return null
    const world = this.world
    return auditGround(
      sim,
      this.document.entities.flatMap((entity) =>
        entity.vehicle
          ? [{ id: entity.id, name: entity.name, wheelRadius: entity.vehicle.wheelRadius }]
          : [],
      ),
      (position) => world.groundHeight(position),
      sim.options.playerMode === 'hover' ? 0.28 : simulationDefaults.playerHalfHeight,
    )
  }
  /** Return per-instance presentation settings without exposing mutable internal state. */
  get displaySettings(): DisplaySettings {
    return { ...this.display }
  }
  /** Change the host's mute preference without replacing the audio graph. */
  setAudioEnabled(enabled: boolean): void {
    this.assertAlive()
    this.effects.audio.setEnabled(enabled)
  }
  /** Apply a live automatic-clock cap and drawing-buffer scale; physics keeps its fixed timestep. */
  setDisplay(settings: Partial<DisplaySettings>): void {
    if (this.disposed) throw new Error('Game runtime is disposed')
    const next = resolveDisplaySettings({ ...this.display, ...settings })
    const resize = next.resolutionScale !== this.display.resolutionScale
    if (next.maxFps !== this.display.maxFps) this.loop.setMaxFps(next.maxFps)
    this.display = next
    if (resize) {
      this.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, this.quality.resolution) * next.resolutionScale,
      )
      this.resize()
    }
  }

  private cull(position: THREE.Vector3): void {
    this.view.limitDrawDistance(
      position,
      this.quality.distance,
      true,
      !!this.quality.buildings,
      this.quality.preset === 'ultra' ? 20000 : Math.min(this.quality.distance, this.quality.roads),
    )
  }
  private hasInput(): boolean {
    return (
      document.activeElement === this.options.canvas &&
      document.hasFocus() &&
      !document.hidden &&
      (this.options.acceptsInput?.() ?? true)
    )
  }
  /** Expose input health on the canvas so a stuck-control report can be checked in devtools. */
  private canvasDiagnostics(frameMs: number): void {
    const data = this.options.canvas.dataset
    data.heldKeys = [...this.keys.values].join(' ')
    data.keyExpirations = String(this.keys.expirations)
    if (frameMs > 100) data.longFrames = String(Number(data.longFrames ?? 0) + 1)
    data.lastFrameMs = frameMs.toFixed(1)
  }
  /** Release held controls when host UI takes focus, without stopping simulation. */
  releaseInput(): void {
    this.fireRequested = false
    this.touchDriving?.clear()
    this.monitors.releaseInput()
    this.game.releaseInput()
    this.previousButtons = []
    this.previousPad = null
    if (document.pointerLockElement === this.options.canvas) document.exitPointerLock()
  }
  private cycleCamera(): void {
    const message = this.game.action('KeyC')
    if (message) this.options.onMessage?.(message)
  }
  private pollGamepad(): Gamepad | null {
    if (!this.hasInput()) {
      this.previousButtons = []
      return null
    }
    const pad = availableGamepads().find((p) => p?.connected && p.mapping === 'standard') ?? null
    if (pad?.index !== this.previousPad) this.previousButtons = []
    this.previousPad = pad?.index ?? null
    if (!pad) return null
    const pressed = (index: number) => !!pad.buttons[index]?.pressed && !this.previousButtons[index]
    if (pressed(0)) this.action('KeyE')
    if (pressed(1)) this.cycleCamera()
    if (pressed(2)) this.action('KeyF')
    if (pressed(3)) this.action('KeyV')
    if (pressed(4)) this.action('KeyT')
    this.previousButtons = pad.buttons.map((button) => button.pressed)
    return pad
  }
  private action(code: string): void {
    const sim = this.session.simulation
    if (!sim) return
    if (code === 'F9') {
      this.wheelDebug.toggle()
      return
    }
    if (code === 'Tab' && !sim.player.vehicleId) {
      this.weaponDrawn = !this.weaponDrawn
      this.fireRequested = false
      if (this.weaponDrawn && !this.sidearm)
        this.sidearm = new Sidearm(this.options.canvas.parentElement!)
      this.options.onMessage?.(
        this.weaponDrawn ? this.text('Weapon drawn') : this.text('Weapon holstered'),
      )
      return
    }
    if (code === 'KeyN') this.gallery.reset()
    let message = this.game.action(code)
    if (code === 'KeyL' && sim.player.vehicleId) {
      const enabled = this.view.toggleVehicleLights(sim.player.vehicleId)
      if (enabled !== null) message = enabled ? this.text('Lights on') : this.text('Lights off')
    }
    if (code === 'KeyH' && sim.player.vehicleId) {
      const open = this.view.toggleVehicleGps(sim.player.vehicleId)
      if (open !== null) message = open ? this.text('GPS on') : this.text('GPS off')
    }
    if (message) this.options.onMessage?.(message)
  }
  private bindInput(): void {
    const options = { signal: this.lifetime.signal }
    const canvas = this.options.canvas
    canvas.addEventListener(
      'wheel',
      (event) => {
        if (
          !this.hasInput() ||
          !this.session.simulation?.player.vehicleId ||
          this.cameraState.mode !== 'map'
        )
          return
        event.preventDefault()
        this.cameraState.mapZoom = THREE.MathUtils.clamp(
          this.cameraState.mapZoom * Math.exp(event.deltaY * controlDefaults.mapZoomSensitivity),
          controlDefaults.mapZoomMin,
          controlDefaults.mapZoomMax,
        )
      },
      { ...options, passive: false },
    )
    canvas.parentElement!.addEventListener(
      'pointerdown',
      (event) => {
        if (
          event.target instanceof Element &&
          event.target.closest('.portal-tablet-layer button')
        ) {
          event.preventDefault()
          canvas.focus()
          this.effects.audio.unlock()
        }
        if (event.target === canvas.parentElement) {
          event.preventDefault()
          canvas.focus()
          this.effects.audio.unlock()
        }
      },
      options,
    )
    canvas.addEventListener(
      'pointerdown',
      (event) => {
        canvas.focus()
        this.effects.audio.unlock()
        if (event.button === 0 && this.weaponDrawn && !this.session.simulation?.player.vehicleId)
          this.fireRequested = true
      },
      options,
    )
    canvas.addEventListener(
      'keydown',
      (event) => {
        if (!this.hasInput() || this.session.state !== 'playing') return
        if (
          ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)
        )
          event.preventDefault()
        const id = this.session.simulation?.player.vehicleId
        if (id && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const result = vehicleMenuKey(
            this.view,
            this.document,
            id,
            event.code,
            event.repeat,
            (message) => this.options.onMessage?.(message),
            (entityId, patch) => {
              const entity = this.document.entities.find((e) => e.id === entityId)
              if (entity) Object.assign(entity, patch)
            },
            this.text,
          )
          if (result.handled) {
            event.preventDefault()
            this.game.releaseInput()
            if (result.opened) this.cameraState.mode = 'cockpit'
            return
          }
        }
        this.keys.press(event.code, event.repeat, performance.now())
        this.effects.audio.unlock()
        if (!event.repeat) this.action(event.code)
      },
      options,
    )
    window.addEventListener('keyup', (event) => this.keys.release(event.code), {
      ...options,
      capture: true,
    })
    window.addEventListener('pagehide', () => this.releaseInput(), options)
    // Leaving pointer lock (Escape, browser UI) can swallow the keyups of held controls.
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (document.pointerLockElement !== canvas) this.releaseInput()
      },
      options,
    )
    canvas.addEventListener('blur', () => this.releaseInput(), options)
    window.addEventListener('blur', () => this.releaseInput(), options)
    document.addEventListener(
      'visibilitychange',
      () => {
        this.releaseInput()
        this.effects.audio.setSuspended(document.hidden || this.session.state !== 'playing')
        this.lastTime = null
      },
      options,
    )
    canvas.addEventListener(
      'pointermove',
      (event) => {
        if (!this.hasInput() || (!(event.buttons & 1) && document.pointerLockElement !== canvas))
          return
        const state = this.cameraState
        if (state.mode === 'map' && this.session.simulation?.player.vehicleId) return
        state.lastLookTime = performance.now()
        if (state.mode === 'cockpit' && this.session.simulation?.player.vehicleId) {
          state.headYaw -= event.movementX * controlDefaults.mouseSensitivity
          state.headPitch = THREE.MathUtils.clamp(
            state.headPitch + event.movementY * controlDefaults.mouseSensitivity,
            -controlDefaults.pitchLimit,
            controlDefaults.pitchLimit,
          )
        } else {
          state.yaw -= event.movementX * controlDefaults.mouseSensitivity
          state.pitch = THREE.MathUtils.clamp(
            state.pitch + event.movementY * controlDefaults.mouseSensitivity,
            -controlDefaults.pitchLimit,
            controlDefaults.pitchLimit,
          )
        }
      },
      options,
    )
  }
  private assertAlive(): void {
    if (this.disposed) throw new Error('Game runtime disposed')
  }
}
