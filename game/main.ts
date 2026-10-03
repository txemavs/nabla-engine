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
  private sun: THREE.DirectionalLight | null = null
  private ambient: THREE.AmbientLight | null = null
  private renderOrigin = new THREE.Vector3()
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
      this.setupGeography(document)
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

      // Start the game loop - lastTime will be set on first frame
      // to avoid clock mismatches between performance.now() and RAF timestamp
      this.lastTime = 0
      this.animationFrame = requestAnimationFrame((t) => this.loop(t))
    } catch (error) {
      console.error('Game initialization failed:', error)
      if (error instanceof Error && error.stack) {
        console.error('Stack trace:', error.stack)
      }
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

    window.addEventListener('resize', () => this.onResize())
  }

  private setupGeography(document: SceneDocument): void {
    this.geography = new GeographicView(document, () => {})
    this.geography.viewDistance = 4000
    this.geography.setLayers({ sky: true, planets: true, sun: true, clouds: true })
    this.scene.add(this.geography.tiles)

    this.sun = new THREE.DirectionalLight('#ffffff', 3.2)
    this.sun.castShadow = true
    this.scene.add(this.sun)

    this.ambient = new THREE.AmbientLight('#dce7f5', 0.22)
    this.scene.add(this.ambient)
  }

  private setupInput(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      if (e.code === 'KeyC') this.cycleCamera()
      if (e.code === 'KeyR') this.resetVehicle()
      if (e.code === 'KeyH') this.toggleTrailer()
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

    this.catchFloor = new CatchFloor()
    this.shadowManager?.setupMaterial(this.catchFloor.mesh.material)
    this.scene.add(this.catchFloor.mesh)
  }

  private async loadInitialTiles(): Promise<void> {
    if (!this.world) return

    const requiredTiles = this.loading.getRequiredTiles()
    const spawnTile = this.loading.getSpawnTile()
    const spawnTileId = spawnTile ? mapTileId(spawnTile) : null

    // Use the spawn position for world.update(), not a fixed position
    const spawnPosition = geoToLocal(this.origin, {
      latitude: this.config.spawn.latitude,
      longitude: this.config.spawn.longitude,
      altitude: this.config.spawn.altitude,
    })

    const updateTileStates = () => {
      for (const tile of requiredTiles) {
        const key = mapTileId(tile)
        const state = this.world!.getTileLoadingState(key)
        if (state === 'installed') {
          this.loading.markTileLoaded(key)
        } else if (state === 'absent') {
          this.loading.markTileAbsent(key)
        } else if (state === 'failed') {
          this.loading.markTileFailed(key)
        }
        // 'loading', 'ready', 'pending' remain as pending in loading screen
      }
    }

    // Game can start when:
    // 1. At least one tile is INSTALLED (not just tracked, actually usable for ground), OR
    // 2. All tiles are resolved as absent or failed (use CatchFloor), OR
    // 3. Timeout expires (use CatchFloor)
    const canStart = () => {
      const progress = this.loading.getProgress()

      // Check if spawn tile or any tile is actually installed (has collision data)
      if (spawnTileId && this.world!.isTileInstalled(spawnTileId)) return true
      if (progress.loaded > 0) return true

      // All tiles resolved as absent/failed - no point waiting
      if (progress.absent + progress.failed === progress.total && progress.total > 0) return true

      // All tiles are resolved (complete) - either loaded or unavailable
      if (this.loading.isComplete()) return true

      return false
    }

    const maxWait = 30000 // 30s max, not 120s
    const started = Date.now()

    // Initial discovery pass - call update to start tile requests
    this.world.update(spawnPosition, [0, 0, 0])

    while (!canStart()) {
      if (Date.now() - started > maxWait) {
        console.warn('Tile loading timeout after 30s, proceeding with available tiles')
        break
      }

      // Request tile updates and process installs
      // Give more time for flushInstall to complete mesh installation
      this.world.update(spawnPosition, [0, 0, 0])
      this.world.flushInstall(10)

      // Update loading screen states
      updateTileStates()

      // Show progress with proper counts
      const progress = this.loading.getProgress()
      const pending = progress.total - progress.loaded - progress.absent - progress.failed
      const statusParts: string[] = []
      if (progress.loaded > 0) statusParts.push(`${progress.loaded} loaded`)
      if (pending > 0) statusParts.push(`${pending} pending`)
      if (progress.absent > 0) statusParts.push(`${progress.absent} absent`)
      if (progress.failed > 0) statusParts.push(`${progress.failed} failed`)
      this.loading.setStatus(`Loading tiles: ${statusParts.join(', ')}`)

      await new Promise((r) => setTimeout(r, 50))
    }

    // After canStart, give extra time for any in-progress installations to complete
    // This ensures tiles that are being installed finish before we check ground
    for (let i = 0; i < 20 && this.world.flushInstall(10); i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    updateTileStates()

    // Final state update
    updateTileStates()
    this.world.logLoadingSummary()

    const progress = this.loading.getProgress()
    if (progress.absent > 0 || progress.failed > 0) {
      console.log(
        `Game starting with ${progress.loaded} tiles (${progress.absent} absent, ${progress.failed} failed)`,
      )
    }
    if (progress.loaded === 0) {
      console.warn('No tiles loaded, game will use CatchFloor as ground')
    }
  }

  private async startSimulation(document: SceneDocument): Promise<void> {
    if (!this.world) return

    const spawn = document.entities.find((e) => e.kind === 'spawn')!
    const vehicleEntity = document.entities.find((e) => e.kind === 'vehicle')

    // Compute spawn position in local coordinates
    // Note: geoToLocal returns position relative to origin, so if origin.altitude=50m
    // and we pass altitude=50m, the local Y will be ~0
    const spawnLocalPos: Vec3Tuple = [0, 0, 0]

    // Wait for ground with timeout - keep flushing installs while waiting
    let ground: number | undefined
    const groundTimeout = 10000
    const started = Date.now()

    while (Date.now() - started < groundTimeout) {
      // Keep processing tile installations
      this.world.update(spawnLocalPos, [0, 0, 0])
      this.world.flushInstall(10)

      // Check for ground at spawn
      ground = this.world.groundHeight(spawnLocalPos)
      if (ground !== undefined) {
        console.log(`Ground found at height ${ground.toFixed(2)}m after ${Date.now() - started}ms`)
        break
      }

      // Check if spawn tile is absent/failed (no point waiting)
      const spawnTile = this.loading.getSpawnTile()
      if (spawnTile) {
        const spawnTileId = mapTileId(spawnTile)
        const state = this.world.getTileLoadingState(spawnTileId)
        if (state === 'absent' || state === 'failed') {
          console.warn(`Spawn tile ${spawnTileId} is ${state}, using CatchFloor`)
          break
        }
      }

      await new Promise((r) => setTimeout(r, 100))
    }

    if (ground === undefined) {
      console.warn(`No ground available after ${Date.now() - started}ms, using CatchFloor`)
    }

    // Position entities based on ground availability
    // The vehicle needs to be placed ABOVE the ground surface
    const vehicleHeight = vehicleEntity?.groundOffset ?? 0.62
    const spawnHeight = spawn.groundOffset ?? 0.2

    if (ground !== undefined) {
      // Ground available from tiles
      if (vehicleEntity) {
        vehicleEntity.transform.position = [
          spawnLocalPos[0],
          ground + vehicleHeight,
          spawnLocalPos[2],
        ]
      }
      spawn.transform.position = [spawnLocalPos[0] - 4, ground + spawnHeight, spawnLocalPos[2]]
      this.catchFloor?.hide()
    } else {
      // No ground available - use fallback ground at Y=0
      const fallbackY = 0
      console.log(`Using fallback ground at Y=${fallbackY}`)
      if (vehicleEntity) {
        vehicleEntity.transform.position = [
          spawnLocalPos[0],
          fallbackY + vehicleHeight,
          spawnLocalPos[2],
        ]
      }
      spawn.transform.position = [spawnLocalPos[0] - 4, fallbackY + spawnHeight, spawnLocalPos[2]]
      // Show visual CatchFloor at spawn position
      this.catchFloor?.show(
        [spawnLocalPos[0], fallbackY, spawnLocalPos[2]],
        [0, 0, 0, 1],
        this.renderOrigin,
      )
    }

    console.log(
      `Vehicle spawn position: [${vehicleEntity?.transform.position.map((n) => n.toFixed(2)).join(', ')}]`,
    )

    this.sim = new Simulation(document, {
      playerMode: 'walk',
      planetaryTerrain: true,
    })

    // If no ground from tiles, add a physics fallback ground to the simulation
    if (ground === undefined) {
      this.sim.setFallbackGround(0)
    }

    const vehicleId = vehicleEntity?.id
    if (vehicleId) {
      this.sim.startInVehicle(vehicleId)
    }
  }

  private loop(time: number): void {
    if (this.disposed) return

    // Compute elapsed time with safety checks:
    // - On first frame, lastTime might be 0 or from a different clock
    // - After tab throttling or long pause, delta could be huge
    // - Clamp to [0, 0.1] to avoid physics instability
    let elapsed = 0
    if (this.lastTime > 0 && time > this.lastTime) {
      elapsed = Math.min((time - this.lastTime) / 1000, 0.1)
    }
    this.lastTime = time

    // Skip update if elapsed is zero or invalid (first frame edge case)
    if (elapsed > 0) {
      this.update(elapsed)
    }
    this.render()

    this.animationFrame = requestAnimationFrame((t) => this.loop(t))
  }

  private debugLogTimer = 0

  private update(elapsed: number): void {
    if (!this.sim || !this.world || !this.view) return

    const input = this.getInput(elapsed)
    this.sim.setInput(input)
    this.sim.step(elapsed)

    const player = this.sim.player
    const position = player.position

    this.world.update(position, [0, 0, 0])
    this.world.flushInstall(2)
    this.world.renderUpdate(new THREE.Vector3(...position), true, this.sim)

    const ground = this.world.groundHeight(position)

    // Safety check: if vehicle falls below a threshold, ensure fallback ground exists
    // This catches cases where terrain tiles exist but collision isn't built yet
    if (position[1] < -5 && !this.sim.hasFallbackGround()) {
      console.warn(
        `Vehicle falling (Y=${position[1].toFixed(2)}), adding emergency fallback ground`,
      )
      this.sim.setFallbackGround(0)
    }

    // Only remove fallback ground when:
    // 1. We have ground height from tiles, AND
    // 2. Vehicle is above ground (not still falling), AND
    // 3. Vehicle velocity is stable (not bouncing high)
    const vehicleStable = position[1] > 0 && Math.abs(player.speed) < 50
    if (ground !== undefined && vehicleStable) {
      this.catchFloor?.hide()
      if (this.sim.hasFallbackGround()) {
        this.sim.clearFallbackGround()
      }
    }

    // Debug logging every second
    this.debugLogTimer += elapsed
    if (this.debugLogTimer >= 1) {
      this.debugLogTimer = 0
      const colliderStatus = this.sim.hasFallbackGround()
        ? 'fallbackGround'
        : ground !== undefined
          ? 'terrain'
          : 'none'
      console.log(
        `[DEBUG] Vehicle Y=${position[1].toFixed(2)}, ground=${ground?.toFixed(2) ?? 'undefined'}, collider=${colliderStatus}, speed=${(player.speed * 3.6).toFixed(1)}km/h`,
      )
    }

    this.updateCamera(player)
    this.updateHud(player)
    this.view.sync(this.sim, elapsed)

    this.updateGeography(position)
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

  private updateGeography(position: Vec3Tuple): void {
    if (!this.geography) return

    this.geography.update(position, this.renderOrigin, { mode: 'live' })

    const air = this.geography.atmosphere
    const night = 1 - Math.min(1, Math.max(0, air.day))

    if (this.ambient) {
      this.ambient.intensity = 0.22 * air.day + 0.04 * night
    }

    if (this.sun) {
      const moonUp = Math.max(0, this.geography.moonDirection.y)
      const useMoon = this.geography.sunDirection.y <= 0 && moonUp > 0
      const lightDirection = useMoon ? this.geography.moonDirection : this.geography.sunDirection
      this.sun.position.copy(lightDirection).multiplyScalar(65)
      this.sun.intensity = useMoon
        ? 0.35 * Math.min(1, moonUp * 2)
        : this.geography.sunDirection.y > 0
          ? 3.2 * air.day
          : 0
    }

    this.scene.fog = air.fog ? new THREE.Fog(air.color, air.near, air.far) : null
  }

  private cycleCamera(): void {
    this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' : 'chase'
  }

  private resetVehicle(): void {
    if (!this.sim || !this.world) return

    const player = this.sim.player
    if (!player.vehicleId) return

    // Use recoverVehicle to upright the vehicle and reset velocity
    // It lifts the vehicle 3m and zeroes velocity
    this.sim.recoverVehicle()
  }

  private toggleTrailer(): void {
    if (!this.sim) return
    const player = this.sim.player
    if (!player.vehicleId) return

    const result = this.sim.toggleTrailerCoupling()
    console.log('Trailer:', result)
  }

  private render(): void {
    const worldCamera = this.camera.position.clone()

    if (this.geography?.enabled) {
      this.geography.render(this.renderer, this.camera, worldCamera)
      this.renderer.autoClear = false
      this.renderer.clearDepth()
    }

    this.renderer.render(this.scene, this.camera)

    if (this.geography?.enabled) {
      this.geography.renderClouds(this.renderer, this.camera)
    }

    this.renderer.autoClear = true
  }

  private updateHud(player: { speed: number; vehicleId: string | null }): void {
    const speedDisplay = document.getElementById('speed-display')
    const gearDisplay = document.getElementById('gear-display')
    const trailerDisplay = document.getElementById('trailer-display')
    const locationDisplay = document.getElementById('location-display')

    if (speedDisplay) {
      speedDisplay.textContent = `${Math.round(player.speed * 3.6)} km/h`
    }

    if (gearDisplay && player.vehicleId && this.sim) {
      const info = this.sim.vehicleInfo(player.vehicleId)
      gearDisplay.textContent = info.gear < 0 ? 'R' : `D${info.gear}`
    }

    if (trailerDisplay && player.vehicleId && this.sim) {
      const info = this.sim.vehicleInfo(player.vehicleId)
      trailerDisplay.classList.remove('coupled', 'available')
      if (info.coupledTrailerId) {
        trailerDisplay.textContent = 'Remolque: Acoplado'
        trailerDisplay.classList.add('coupled')
      } else if (info.trailerCouplingCandidate) {
        trailerDisplay.textContent = 'Remolque: Disponible (H)'
        trailerDisplay.classList.add('available')
      } else if (info.hasFifthWheel) {
        trailerDisplay.textContent = 'Remolque: Sin acoplar'
      } else if (info.isActingAsTrailer) {
        trailerDisplay.textContent = 'Remolque: Enganchado a tractor'
        trailerDisplay.classList.add('coupled')
      } else {
        trailerDisplay.textContent = ''
      }
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
    this.catchFloor?.dispose()
    this.renderer.dispose()
  }
}

const game = new Game()
void game.start()
