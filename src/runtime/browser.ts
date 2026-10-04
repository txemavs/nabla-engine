import * as THREE from 'three'
import { parseScene, type SceneDocument } from '../scene/document.js'
import { SceneView } from '../presentation/scene-view.js'
import { GeographicView } from '../render/planet/sky.js'
import {
  PlanetWorld,
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
import { GameRuntime as SharedGameRuntime } from './game.js'
import { availableGamepads } from './input.js'
import { playGroundClearance } from './placement.js'
import { FrameLoop } from './frame-loop.js'
import { VehicleEffects } from './vehicle-effects.js'

import { waitForGround } from './ground.js'

export interface GameFrame {
  speedKmh: number
  gear: number | null
  location: ReturnType<typeof localToGeo> | null
}
export interface GameRuntimeOptions {
  canvas: HTMLCanvasElement
  scene: SceneDocument
  tiles?: { baseUrl: string; apiUrl?: string; mode?: TileDiscoveryMode } & PlanetSourceOptions
  /** Disable only the visible water sheet for a synthetic sea-level test surface. */
  sea?: boolean
  clock?: 'automatic' | 'manual'
  onProgress?: (status: string, loadedTiles?: string[]) => void
  onFrame?: (frame: GameFrame) => void
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
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 50000)
  private readonly renderer: THREE.WebGLRenderer
  private readonly view: SceneView
  private readonly sky: GeographicView
  private readonly environment: WorldEnvironment
  private readonly effects: VehicleEffects
  private readonly shadows = new ShadowManager()
  private readonly sun = new THREE.DirectionalLight('#ffe1b1', 3.2)
  private readonly ambient = new THREE.AmbientLight('#dce7f5', 0.22)
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

  constructor(private readonly options: GameRuntimeOptions) {
    this.document = parseScene(options.scene)
    if (!this.document.geography)
      throw new Error('A Nabla game requires planetary coordinates, including offline scenes')
    this.renderer = new THREE.WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      logarithmicDepthBuffer: true,
    })
    configureWorldRenderer(this.renderer)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.shadowMap.autoUpdate = false
    this.scene.add(this.sun, this.ambient, this.catchFloor.mesh)
    this.view = new SceneView(this.document)
    this.scene.add(this.view.root)
    this.sky = new GeographicView(this.document, () => {})
    this.environment = new WorldEnvironment(this.scene, this.sun, this.ambient)
    this.effects = new VehicleEffects(this.scene)
    this.shadows.init({
      camera: this.camera,
      scene: this.scene,
      lightDirection: new THREE.Vector3(25, -45, -25).normalize(),
      tier: shadowTiers[2048]!,
    })
    this.view.setupMaterials((material) => this.shadows.setupMaterial(material))
    this.shadows.setupMaterial(this.catchFloor.mesh.material)
    this.sun.visible = false
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
      this.world.setQuality(2, 8, false, 32)
      this.world.setDistance(4000)
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
    this.originalTabIndex = options.canvas.getAttribute('tabindex')
    options.canvas.tabIndex = 0
    this.bindInput()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(options.canvas)
    this.resize()
  }

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
        progress('Ground ready')
      }
      controller.signal.throwIfAborted()
      this.options.onProgress?.('Starting simulation…')
      await this.game.play(document, { playerMode: 'walk', ...options, planetaryTerrain: true })
      controller.signal.throwIfAborted()
      this.cameraState.mode = options.vehicleId ? 'cockpit' : 'chase'
      this.view.setPlaying(true)
      this.effects.audio.setSuspended(globalThis.document.hidden)
      this.world?.renderUpdate(this.origin, true, this.session.simulation)
      this.lastTime = null
      if (this.options.clock !== 'manual') this.loop.start()
    } catch (error) {
      if (this.loading === controller) this.stop()
      throw error
    } finally {
      if (this.loading === controller) this.loading = null
    }
  }

  pause(): void {
    this.assertAlive()
    this.game.pause()
    this.loop.stop()
    this.releaseInput()
    this.effects.audio.setSuspended(true)
    this.lastTime = null
  }
  resume(): void {
    this.assertAlive()
    this.game.resume()
    this.effects.audio.setSuspended(document.hidden)
    this.lastTime = null
    if (this.session.state === 'playing' && this.options.clock !== 'manual') this.loop.start()
  }
  stop(): void {
    if (this.disposed) return
    this.loading?.abort()
    this.loading = null
    this.loop.stop()
    this.world?.renderUpdate(this.origin, true, null)
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
  resize(): void {
    if (this.disposed) return
    const width = Math.max(1, this.options.canvas.clientWidth)
    const height = Math.max(1, this.options.canvas.clientHeight)
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }
  dispose(): void {
    if (this.disposed) return
    this.stop()
    this.disposed = true
    this.lifetime.abort()
    this.observer.disconnect()
    this.game.dispose()
    this.world?.dispose()
    this.view.dispose()
    this.sky.dispose()
    this.environment.dispose()
    this.effects.dispose()
    this.shadows.dispose()
    this.catchFloor.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    if (this.originalTabIndex === null) this.options.canvas.removeAttribute('tabindex')
    else this.options.canvas.setAttribute('tabindex', this.originalTabIndex)
  }

  private frame(time: number): void {
    const sim = this.session.simulation
    if (this.disposed || !sim || this.session.state !== 'playing') return
    if (!Number.isFinite(time)) throw new Error('Invalid frame time')
    const dt =
      this.lastTime === null ? 0 : Math.min(0.1, Math.max(0, (time - this.lastTime) / 1000))
    this.lastTime = time
    if (document.hidden) return
    if (!this.hasInput()) this.releaseInput()
    this.keys.expire(performance.now())
    const pad = this.pollGamepad()
    this.world?.flushInstall(1.5)
    this.view.flushMapInstall(4, 24, this.camera.position)
    this.world?.renderUpdate(this.origin, true, sim)
    const input = this.game.readInput(dt, {
      keys: this.keys.values,
      yaw: this.cameraState.yaw,
      pad,
      enabled: this.hasInput(),
      menuOpen: !!(sim.player.vehicleId && this.view.vehicleMenu(sim.player.vehicleId)?.open),
    })
    const crossing = this.game.step(dt, input, 0, time)
    if (crossing)
      this.options.onMessage?.(crossing.blocked ? 'Paso bloqueado' : 'Stargate atravesado')
    this.world?.update(sim.player.position, [0, 0, 0])
    this.view.night = this.sky.enabled && this.sky.atmosphere.day < 0.15
    this.view.sync(
      sim,
      dt,
      sim.player.vehicleId ? this.cameraState.mode === 'cockpit' : this.cameraState.firstPerson,
      this.cameraState.headYaw,
      this.cameraState.headPitch,
    )
    const { player, info } = this.game.updateCamera(this.view, this.camera, time, dt)
    const eye = this.camera.position.clone()
    this.origin.set(0, 0, 0)
    if (new THREE.Vector3(...player.position).length() > 10000)
      this.origin.fromArray(player.position)
    this.effects.updateAudio(sim, this.document, eye)
    this.effects.updateTires(sim, dt, this.origin)
    this.environment.updateSea(
      this.document.geography,
      eye,
      this.origin,
      8000,
      time,
      this.options.sea !== false,
    )
    const height = this.environment.updateSky(
      this.sky,
      eye,
      this.origin,
      this.document.sky ?? { mode: 'live' },
      4000,
    )
    if (this.sky.enabled) {
      const direction = this.environment.applyLighting(this.sky)
      this.shadows.setLightDirection(direction.clone().negate())
      this.shadows.setLightIntensity(this.sun.intensity)
      this.shadows.setLightColor(this.sun.color)
      this.camera.far = Math.hypot(
        Math.max(height >= 2000 ? 80000 : 12000, 4500),
        Math.max(0, height),
      )
    } else {
      this.scene.background = new THREE.Color('#a6bbd5')
      this.scene.fog = new THREE.Fog('#a6bbd5', 1500, 4000)
    }
    this.camera.updateProjectionMatrix()
    this.view.root.position.copy(this.origin).negate()
    this.world?.renderUpdate(this.origin, true, sim)
    const disk = sim.catchDisk()
    if (disk) this.catchFloor.show(disk.position, disk.rotation, this.origin)
    else this.catchFloor.hide()
    this.view.streetlights.update(eye, this.view.night, 4000)
    this.view.limitDrawDistance(eye, 4000, true, true, 1000)
    this.camera.position.sub(this.origin)
    for (const [id, hud] of this.view.shipHuds) {
      const inside =
        (player.interiorId === id && this.cameraState.firstPerson) ||
        (player.vehicleId === id && this.cameraState.mode === 'cockpit')
      hud.update(this.camera, this.origin, time, inside ? sim.vehicleInfo(id) : null)
    }
    try {
      this.view.renderMirrors(
        this.renderer,
        this.scene,
        this.camera,
        this.cameraState.mode === 'cockpit' ? player.vehicleId : null,
        time,
      )
      this.sky.setViewAspect(this.camera.aspect)
      this.renderer.autoClear = true
      if (this.sky.enabled) {
        this.sky.render(this.renderer, this.camera, eye)
        this.renderer.autoClear = false
        this.renderer.clearDepth()
      }
      this.shadows.update(this.camera, this.origin)
      this.renderer.shadowMap.needsUpdate = true
      this.renderer.render(this.scene, this.camera)
      if (this.sky.enabled) this.sky.renderClouds(this.renderer, this.camera)
    } finally {
      this.camera.position.copy(eye)
    }
    this.options.onFrame?.({
      speedKmh: player.speed * 3.6,
      gear: info?.gear ?? null,
      location: this.document.geography
        ? localToGeo(this.document.geography, player.position)
        : null,
    })
  }

  private hasInput(): boolean {
    return document.activeElement === this.options.canvas && document.hasFocus() && !document.hidden
  }
  private releaseInput(): void {
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
    let message = this.game.action(code)
    if (code === 'KeyH' && sim.player.vehicleId) {
      const open = this.view.toggleVehicleGps(sim.player.vehicleId)
      if (open !== null) message = open ? 'GPS encendido' : 'GPS apagado'
    }
    if (message) this.options.onMessage?.(message)
  }
  private bindInput(): void {
    const options = { signal: this.lifetime.signal }
    const canvas = this.options.canvas
    canvas.addEventListener(
      'pointerdown',
      () => {
        canvas.focus()
        this.effects.audio.unlock()
      },
      options,
    )
    canvas.addEventListener(
      'keydown',
      (event) => {
        if (!this.hasInput() || this.session.state !== 'playing') return
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code))
          event.preventDefault()
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
        if (!this.hasInput() || !(event.buttons & 1)) return
        const state = this.cameraState
        state.lastLookTime = performance.now()
        if (state.mode === 'cockpit' && this.session.simulation?.player.vehicleId) {
          state.headYaw -= event.movementX * 0.003
          state.headPitch = THREE.MathUtils.clamp(
            state.headPitch + event.movementY * 0.003,
            -1.4,
            1.4,
          )
        } else {
          state.yaw -= event.movementX * 0.003
          state.pitch = THREE.MathUtils.clamp(state.pitch + event.movementY * 0.003, -1.4, 1.4)
        }
      },
      options,
    )
  }
  private assertAlive(): void {
    if (this.disposed) throw new Error('Game runtime disposed')
  }
}
