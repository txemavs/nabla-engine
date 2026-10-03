/**
 * Nabla Engine - Standalone Game Entry Point
 *
 * This module provides a library mode for running games without the Studio UI.
 * It loads terrain tiles statically and spawns the player in a vehicle.
 */

import { parseGameConfig, type GameConfig } from './config.js'
import { LoadingScreen, showError } from './loading.js'
import { initPhysics } from '../src/simulation/physics.js'
import {
  Simulation,
  createEntity,
  idleInput,
  type SceneDocument,
  type PlayerInput,
  type Vec3Tuple,
} from '../src/index.js'
import { presetVehicle, hasVehiclePreset } from '../src/catalog/vehicles/library.js'
import { PlanetWorld } from '../src/render/planet/world.js'
import { mapTileAt, mapTileId } from '../src/scene/mercator.js'
import { geoToLocal, localToGeo, type GeoPoint } from '../src/math/geo/sphere.js'
import { KeyboardSteering } from '../src/simulation/vehicles/keyboard-steering.js'
import { SceneView } from '../src/presentation/scene-view.js'
import { GeographicView } from '../src/render/planet/sky.js'
import { ShadowManager } from '../src/render/shadows.js'
import { CatchFloor } from '../src/render/planet/catch-floor.js'
import * as THREE from 'three'

class Game {
  private config: GameConfig
  private loading: LoadingScreen
  private origin: GeoPoint
  private scene!: THREE.Scene
  private renderer!: THREE.WebGLRenderer
  private camera!: THREE.PerspectiveCamera
  private sim: Simulation | null = null
  private world: PlanetWorld | null = null
  private view: SceneView | null = null
  private geography: GeographicView | null = null
  private shadowManager: ShadowManager | null = null
  private catchFloor: CatchFloor | null = null
  private keyboardSteering = new KeyboardSteering()
  private disposed = false
  private animationFrame = 0
  private lastTime = 0
  private keys = new Set<string>()
  private cameraMode: 'chase' | 'cockpit' = 'cockpit'
  private yaw = 0
  private pitch = 0.15

  constructor() {
    this.config = parseGameConfig()
    this.loading = new LoadingScreen()
    this.origin = {
      latitude: this.config.spawn.latitude,
      longitude: this.config.spawn.longitude,
      altitude: this.config.spawn.altitude,
    }
  }

  async start(): Promise<void> {
    try {
      this.loading.setSpawn(this.config.spawn.latitude, this.config.spawn.longitude)
      this.loading.setStatus('Initializing physics...')
      await initPhysics()

      this.loading.setStatus('Setting up renderer...')
      this.setupRenderer()
      this.setupInput()

      this.loading.setStatus('Creating scene...')
      const document = this.createGameDocument()
      this.view = new SceneView(document, false, true)
      this.scene.add(this.view.root)

      this.loading.setStatus('Setting up world streaming...')
      this.setupWorldStream()

      this.loading.setStatus('Loading initial tiles...')
      await this.loadInitialTiles()

      this.loading.setStatus('Starting simulation...')
      await this.startSimulation(document)

      this.loading.hide()
      this.showHud()

      this.lastTime = performance.now()
      this.animationFrame = requestAnimationFrame((t) => this.loop(t))
    } catch (error) {
      console.error('Game initialization failed:', error)
      showError(error instanceof Error ? error.message : String(error))
    }
  }

  private setupRenderer(): void {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      50000,
    )
    this.camera.position.set(0, 5, 10)

    this.shadowManager = new ShadowManager(this.renderer, 1024)
    this.shadowManager.distance = 2000

    this.geography = new GeographicView(this.origin, () => {})
    this.scene.add(this.geography.sky)
    this.scene.add(this.geography.sun)

    window.addEventListener('resize', () => this.onResize())
  }

  private setupInput(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      if (e.code === 'KeyC') this.cycleCamera()
      if (e.code === 'KeyR') this.resetVehicle()
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
    })
    window.addEventListener('blur', () => {
      this.keys.clear()
    })
  }

  private createGameDocument(): SceneDocument {
    if (!hasVehiclePreset(this.config.vehicle)) {
      console.warn(`Vehicle preset '${this.config.vehicle}' not found, using 'car'`)
      this.config.vehicle = 'car'
    }

    const vehicle = presetVehicle(this.config.vehicle, 'player-vehicle', [0, 2, 0])
    vehicle.groundOffset = 0.62

    return {
      version: 1,
      name: 'Drive',
      sky: { mode: 'live' },
      geography: {
        ...this.origin,
        imagery: 'offline',
        planetary: true,
      },
      cursor: [0, 0, 0],
      cursorOnGround: true,
      entities: [{ ...createEntity('spawn', 'spawn', [-4, 1, 0]), groundOffset: 0.2 }, vehicle],
    }
  }

  private setupWorldStream(): void {
    const tilesBaseUrl = this.config.staticTiles
      ? this.config.tilesBaseUrl
      : import.meta.env.VITE_WORLD_PREPARED_URL || '/prepared'

    const apiUrl = import.meta.env.VITE_WORLD_PREPARE_API || '/prepare'

    this.world = new PlanetWorld(
      this.origin,
      () => {},
      (m) => this.shadowManager?.setupMaterial(m),
      tilesBaseUrl,
      apiUrl,
      this.config.staticTiles ? 'static' : 'dynamic',
    )
    this.world.setQuality(2, 8, false, 32)
    this.world.setDistance(4000)
    this.scene.add(this.world.root)

    this.catchFloor = new CatchFloor(
      this.origin,
      () => {},
      (m) => this.shadowManager?.setupMaterial(m),
    )
    this.scene.add(this.catchFloor.root)
  }

  private async loadInitialTiles(): Promise<void> {
    if (!this.world) return

    const requiredTiles = this.loading.getRequiredTiles()
    const position: Vec3Tuple = [0, 100, 0]

    const checkComplete = () => {
      for (const tile of requiredTiles) {
        const key = mapTileId(tile)
        if (this.world!.activeTiles.some((t) => t.key === key)) {
          this.loading.markTileLoaded(key)
        }
      }
      return this.loading.isComplete()
    }

    const maxWait = 120000
    const started = Date.now()

    while (!checkComplete()) {
      if (Date.now() - started > maxWait) {
        console.warn('Tile loading timeout, proceeding anyway')
        break
      }
      this.world.update(position, [0, 0, 0])
      this.world.flushInstall(5)

      const progress = this.loading.getProgress()
      this.loading.setStatus(`Loading tiles: ${progress.loaded}/${progress.total}`)

      await new Promise((r) => setTimeout(r, 100))
    }
  }

  private async startSimulation(document: SceneDocument): Promise<void> {
    if (!this.world) return

    const spawn = document.entities.find((e) => e.kind === 'spawn')!
    const position = spawn.transform.position

    await this.world.ensureGround(position)
    const ground = this.world.groundHeight(position)

    if (ground !== undefined) {
      const vehicleEntity = document.entities.find((e) => e.kind === 'vehicle')
      if (vehicleEntity) {
        vehicleEntity.transform.position[1] = ground + (vehicleEntity.groundOffset ?? 0.62)
      }
      spawn.transform.position[1] = ground + (spawn.groundOffset ?? 0.2)
    }

    this.sim = new Simulation(document, {
      playerMode: 'walk',
      planetaryTerrain: true,
    })

    const vehicleId = document.entities.find((e) => e.kind === 'vehicle')?.id
    if (vehicleId) {
      this.sim.startInVehicle(vehicleId)
    }
  }

  private loop(time: number): void {
    if (this.disposed) return

    const elapsed = Math.min((time - this.lastTime) / 1000, 0.1)
    this.lastTime = time

    this.update(elapsed)
    this.render()

    this.animationFrame = requestAnimationFrame((t) => this.loop(t))
  }

  private update(elapsed: number): void {
    if (!this.sim || !this.world || !this.view) return

    const input = this.getInput(elapsed)
    this.sim.step(input, elapsed)

    const player = this.sim.player
    const position = player.position

    this.world.update(position, [0, 0, 0])
    this.world.flushInstall(2)
    this.world.renderUpdate(new THREE.Vector3(...position), true, this.sim)

    this.catchFloor?.update(position, this.world.groundHeight(position))

    this.updateCamera(player)
    this.updateHud(player)
    this.view.update(this.sim, elapsed)

    this.geography?.update(new Date())
    this.shadowManager?.update(this.camera, this.scene)
  }

  private getInput(elapsed: number): PlayerInput {
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0)
    const right = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0)
    const steering = this.keyboardSteering.update(
      this.sim?.player.vehicleId ?? null,
      right,
      elapsed,
    )

    return {
      forward,
      right: steering,
      yaw: this.yaw,
      sprint: this.keys.has('ShiftLeft'),
      jump: this.keys.has('Space'),
      brake: this.keys.has('Space'),
    }
  }

  private updateCamera(player: {
    position: Vec3Tuple
    vehicleId: string | null
    speed: number
  }): void {
    if (!this.sim) return

    const target = new THREE.Vector3(...player.position)

    if (player.vehicleId) {
      const vehicleTransform = this.sim.entityTransform(player.vehicleId)
      const vehiclePos = new THREE.Vector3(...vehicleTransform.position)
      const vehicleQuat = new THREE.Quaternion(...vehicleTransform.rotation)

      if (this.cameraMode === 'cockpit') {
        const driverOffset = new THREE.Vector3(-0.35, 0.9, 0.3)
        driverOffset.applyQuaternion(vehicleQuat)
        this.camera.position.copy(vehiclePos).add(driverOffset)

        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(vehicleQuat)
        this.camera.lookAt(this.camera.position.clone().add(forward))
      } else {
        const distance = 6 + Math.min(player.speed * 0.1, 4)
        const height = 2 + Math.min(player.speed * 0.05, 2)
        const back = new THREE.Vector3(0, height, distance).applyQuaternion(vehicleQuat)
        this.camera.position.copy(vehiclePos).add(back)
        this.camera.lookAt(vehiclePos.clone().add(new THREE.Vector3(0, 1, 0)))
      }
    } else {
      const offset = new THREE.Vector3(0, 2, 5)
      this.camera.position.copy(target).add(offset)
      this.camera.lookAt(target)
    }
  }

  private cycleCamera(): void {
    this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' : 'chase'
  }

  private resetVehicle(): void {
    if (!this.sim || !this.world) return

    const player = this.sim.player
    if (!player.vehicleId) return

    const ground = this.world.groundHeight(player.position)
    if (ground !== undefined) {
      this.sim.resetVehicle(player.vehicleId, [player.position[0], ground + 1, player.position[2]])
    }
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  private updateHud(player: { speed: number; vehicleId: string | null }): void {
    const speedDisplay = document.getElementById('speed-display')
    const gearDisplay = document.getElementById('gear-display')
    const locationDisplay = document.getElementById('location-display')

    if (speedDisplay) {
      speedDisplay.textContent = `${Math.round(player.speed * 3.6)} km/h`
    }

    if (gearDisplay && player.vehicleId && this.sim) {
      const info = this.sim.vehicleInfo(player.vehicleId)
      gearDisplay.textContent = info.gear < 0 ? 'R' : `D${info.gear}`
    }

    if (locationDisplay && this.sim) {
      const pos = this.sim.player.position
      const geo = localToGeo(this.origin, pos)
      locationDisplay.textContent = `${geo.latitude.toFixed(5)}°, ${geo.longitude.toFixed(5)}°`
    }
  }

  private showHud(): void {
    const hud = document.getElementById('game-hud')
    if (hud) hud.classList.remove('hidden')
  }

  private onResize(): void {
    const width = window.innerWidth
    const height = window.innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
  }

  dispose(): void {
    this.disposed = true
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
    }
    this.world?.dispose()
    this.view?.dispose()
    this.geography?.dispose()
    this.renderer.dispose()
  }
}

const game = new Game()
void game.start()
