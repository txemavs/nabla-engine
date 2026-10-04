/**
 * Nabla Engine - Standalone Game Entry Point
 *
 * This module provides a library mode for running games without the Studio UI.
 * It loads terrain tiles statically and spawns the player in a vehicle.
 * Uses the same driving systems as Studio (camera, audio, telemetry).
 */

import { parseGameConfig, type GameConfig } from './config.js'
import { LoadingScreen, showError } from './loading.js'
import { findNearestGround, checkFootprint, FOOTPRINT_RADIUS } from './ground.js'
import { initPhysics } from '../src/simulation/physics.js'
import {
  Simulation,
  createEntity,
  DrivingController,
  type SceneDocument,
  type PlayerInput,
  type Vec3Tuple,
} from '../src/index.js'
import {
  presetVehicle,
  hasVehiclePreset,
  hasTrailerPreset,
  presetTractorTrailer,
} from '../src/catalog/vehicles/library.js'
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
  private driving = new DrivingController({ enableAudio: true, initialCameraMode: 'chase' })
  private disposed = false
  private animationFrame = 0
  private lastTime = 0
  private keys = new Set<string>()
  private yaw = 0
  private spawnPosition: Vec3Tuple = [0, 0, 0]
  private waitingForTerrain = true
  private terrainMessage = ''
  private pointerLocked = false

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
      // Single-tile mode: load only one specific tile with truck at center
      if (this.config.singleTile) {
        this.loading.setSingleTile(this.config.singleTile)
        console.log(
          `Single tile mode: ${this.config.singleTile.z}/${this.config.singleTile.x}/${this.config.singleTile.y}`,
        )
      } else {
        this.loading.setSpawn(this.config.spawn.latitude, this.config.spawn.longitude)
      }
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

      this.loading.setStatus('Esperando terreno...')
      await this.waitForTerrain(document)

      this.loading.hide()
      this.showHud()

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
    this.scene.background = new THREE.Color('#87CEEB')

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
    this.sun.position.set(50, 100, 30)
    this.scene.add(this.sun)

    this.ambient = new THREE.AmbientLight('#dce7f5', 0.5)
    this.scene.add(this.ambient)

    const hemi = new THREE.HemisphereLight('#b1e1ff', '#b97a20', 0.6)
    this.scene.add(hemi)
  }

  private setupInput(): void {
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      if (e.code === 'KeyC') this.cycleCamera()
      if (e.code === 'KeyR') this.resetVehicle()
      if (e.code === 'KeyH') this.toggleTrailer()
      if (e.code === 'Escape') this.exitPointerLock()
      this.driving.unlockAudio()
    })
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code)
    })
    window.addEventListener('blur', () => {
      this.keys.clear()
    })

    // Mouse controls - click to lock pointer, move to rotate camera
    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) {
        canvas.requestPointerLock()
      }
    })

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas
      console.log('Pointer lock:', this.pointerLocked ? 'active' : 'released')
    })

    // Mouse movement for camera rotation (like Studio)
    document.addEventListener('mousemove', (e) => {
      if (this.pointerLocked && this.sim) {
        const mode = this.driving.getCameraMode()
        if (mode !== 'map') {
          this.driving.applyMouseLook(e.movementX, e.movementY)
        }
      }
    })

    // Wheel for map zoom
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (this.driving.getCameraMode() === 'map') {
          e.preventDefault()
          const currentZoom = 1 // Could track this
          this.driving.setMapZoom(currentZoom + e.deltaY * 0.001)
        }
      },
      { passive: false },
    )

    window.addEventListener('pointerdown', () => this.driving.unlockAudio())
    document.addEventListener('visibilitychange', () => {
      this.driving.setAudioSuspended(document.hidden)
    })
  }

  private exitPointerLock(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
  }

  private createGameDocument(): SceneDocument {
    if (!hasVehiclePreset(this.config.vehicle)) {
      console.warn(`Vehicle preset '${this.config.vehicle}' not found, using 'car'`)
      this.config.vehicle = 'car'
    }

    const entities = [{ ...createEntity('spawn', 'spawn', [-4, 1, 0]), groundOffset: 0.2 }]

    if (hasTrailerPreset(this.config.vehicle)) {
      const { tractor, trailer } = presetTractorTrailer(
        this.config.vehicle,
        'player-vehicle',
        'player-trailer',
        [0, 2, 0],
      )
      tractor.groundOffset = 0.62
      entities.push(tractor)
      if (trailer) {
        trailer.groundOffset = 0.62
        entities.push(trailer)
        console.log('Spawning tractor and trailer:', tractor.id, trailer.id)
      }
    } else {
      const vehicle = presetVehicle(this.config.vehicle, 'player-vehicle', [0, 2, 0])
      vehicle.groundOffset = 0.62
      entities.push(vehicle)
    }

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
      entities,
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

    // Single-tile mode: limit view distance to keep within one tile
    if (this.config.singleTile) {
      this.world.setQuality(1, 4, false, 1) // Only 1 tile max
      this.world.setDistance(500) // ~500m, well within a Z15 tile
    } else {
      this.world.setQuality(2, 8, false, 32)
      this.world.setDistance(4000)
    }

    this.scene.add(this.world.root)

    // No CatchFloor in single-tile mode - use real terrain only
    if (!this.config.singleTile) {
      this.catchFloor = new CatchFloor()
      this.shadowManager?.setupMaterial(this.catchFloor.mesh.material)
      this.scene.add(this.catchFloor.mesh)
    }
  }

  private async loadInitialTiles(): Promise<void> {
    if (!this.world) return

    const requiredTiles = this.loading.getRequiredTiles()
    const spawnTile = this.loading.getSpawnTile()
    const spawnTileId = spawnTile ? mapTileId(spawnTile) : null

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
      }
    }

    const isSpawnTileResolved = (): 'installed' | 'absent' | 'failed' | null => {
      if (!spawnTileId) return null
      const state = this.world!.getTileLoadingState(spawnTileId)
      if (state === 'installed' || state === 'absent' || state === 'failed') return state
      return null
    }

    const canStart = () => {
      const spawnState = isSpawnTileResolved()
      if (spawnState !== null) {
        console.log(`Spawn tile ${spawnTileId} resolved as: ${spawnState}`)
        return true
      }
      const progress = this.loading.getProgress()
      if (progress.absent + progress.failed === progress.total && progress.total > 0) return true
      if (this.loading.isComplete()) return true
      return false
    }

    const maxWait = 15000
    const started = Date.now()

    this.world.update(spawnPosition, [0, 0, 0])

    while (!canStart()) {
      if (Date.now() - started > maxWait) {
        console.warn('Tile loading timeout after 15s')
        break
      }

      this.world.update(spawnPosition, [0, 0, 0])
      this.world.flushInstall(10)
      updateTileStates()

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

    for (let i = 0; i < 20 && this.world.flushInstall(10); i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    updateTileStates()
    this.world.logLoadingSummary()
  }

  /**
   * Wait for real terrain ground height at the spawn position.
   * Does NOT spawn until ground is known - no fake Y=0 fallback.
   */
  private async waitForTerrain(document: SceneDocument): Promise<void> {
    if (!this.world) return

    const spawn = document.entities.find((e) => e.kind === 'spawn')!
    const vehicleEntity = document.entities.find((e) => e.kind === 'vehicle')
    const trailerEntity = document.entities.find((e) => e.id === 'player-trailer')

    let spawnLocalPos: Vec3Tuple = [0, 0, 0]
    const groundHeightFn = (pos: Vec3Tuple) => this.world!.groundHeight(pos)

    const maxWait = 60000 // Wait up to 60 seconds for terrain
    const started = Date.now()

    this.loading.setStatus('Esperando terreno...')

    while (Date.now() - started < maxWait) {
      // Keep updating world to process tile installations
      this.world.update(spawnLocalPos, [0, 0, 0])
      this.world.flushInstall(10)

      // Check for ground at spawn position with footprint
      let ground = checkFootprint(groundHeightFn, spawnLocalPos, FOOTPRINT_RADIUS)

      if (ground === undefined) {
        // Try ring search for nearby ground
        const searchResult = findNearestGround(groundHeightFn, spawnLocalPos, { maxRadius: 100 })
        if (searchResult.found) {
          spawnLocalPos = searchResult.position
          ground = searchResult.groundHeight
          console.log(
            `Ground found at radius ${searchResult.searchRadius}m: ` +
              `[${spawnLocalPos.map((n) => n.toFixed(1)).join(', ')}] height=${ground.toFixed(2)}m`,
          )
        }
      }

      if (ground !== undefined) {
        // Real terrain found - spawn on it
        console.log(`Terrain ready at height ${ground.toFixed(2)}m`)
        this.waitingForTerrain = false
        this.terrainMessage = ''

        const vehicleHeight = vehicleEntity?.groundOffset ?? 0.62
        const spawnHeight = spawn.groundOffset ?? 0.2

        this.spawnPosition = [spawnLocalPos[0], ground + vehicleHeight, spawnLocalPos[2]]

        if (vehicleEntity) {
          vehicleEntity.transform.position = [...this.spawnPosition]
        }
        spawn.transform.position = [spawnLocalPos[0] - 4, ground + spawnHeight, spawnLocalPos[2]]

        if (trailerEntity) {
          trailerEntity.transform.position = [
            spawnLocalPos[0],
            ground + (trailerEntity.groundOffset ?? 0.62),
            spawnLocalPos[2] + 10,
          ]
        }

        // Show visual catch floor at terrain level for reference
        this.catchFloor?.show(
          [spawnLocalPos[0], ground, spawnLocalPos[2]],
          [0, 0, 0, 1],
          this.renderOrigin,
        )

        console.log(
          `Vehicle spawn position: [${this.spawnPosition.map((n) => n.toFixed(2)).join(', ')}]`,
        )

        // Create simulation with vehicle on real terrain
        this.sim = new Simulation(document, {
          playerMode: 'walk',
          planetaryTerrain: true,
        })

        // NO fallback ground - we have real terrain
        const vehicleId = vehicleEntity?.id
        if (vehicleId) {
          this.sim.startInVehicle(vehicleId)
        }
        return
      }

      // Update loading message
      const elapsed = Math.floor((Date.now() - started) / 1000)
      this.loading.setStatus(`Esperando terreno... (${elapsed}s)`)
      this.terrainMessage = 'Esperando terreno...'

      await new Promise((r) => setTimeout(r, 100))
    }

    // Timeout - no terrain available
    console.warn('No terrain found after 60s timeout')
    this.waitingForTerrain = true
    this.terrainMessage = 'Sin terreno en esta posición'

    // Still create simulation but vehicle won't be properly placed
    // Show warning and don't hide loading screen fully
    this.sim = new Simulation(document, {
      playerMode: 'walk',
      planetaryTerrain: true,
    })

    const vehicleId = vehicleEntity?.id
    if (vehicleId) {
      this.sim.startInVehicle(vehicleId)
    }
  }

  private loop(time: number): void {
    if (this.disposed) return

    let elapsed = 0
    if (this.lastTime > 0 && time > this.lastTime) {
      elapsed = Math.min((time - this.lastTime) / 1000, 0.1)
    }
    this.lastTime = time

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

    // If we were waiting for terrain and now have ground data, update spawn position
    if (this.waitingForTerrain && ground !== undefined) {
      const vehicleHeight = 0.62
      // Use current position for terrain check (vehicle may have moved from original spawn)
      const currentX = position[0]
      const currentZ = position[2]

      // First try a simple ground check at current position
      const groundHeightFn = (pos: Vec3Tuple) => this.world!.groundHeight(pos)
      let terrainGround = groundHeightFn([currentX, 0, currentZ])

      // If no ground at exact position, try footprint check
      if (terrainGround === undefined) {
        terrainGround = checkFootprint(groundHeightFn, [currentX, 0, currentZ], FOOTPRINT_RADIUS)
      }

      if (terrainGround !== undefined) {
        // Terrain detected - update spawn position to be ON the terrain
        this.spawnPosition = [currentX, terrainGround + vehicleHeight, currentZ]
        console.log(
          `Terrain now available! Spawn position updated to: ` +
            `[${this.spawnPosition.map((n) => n.toFixed(2)).join(', ')}]`,
        )
        this.waitingForTerrain = false
        this.terrainMessage = ''

        // Check if vehicle Y is below terrain - if so, teleport to correct height
        if (position[1] < terrainGround) {
          console.log(
            `Vehicle Y=${position[1].toFixed(2)} < terrain=${terrainGround.toFixed(2)}, teleporting...`,
          )
          this.sim.teleportVehicle(this.spawnPosition, 0)
          console.log(
            `Vehicle teleported to terrain height. Y=${this.spawnPosition[1].toFixed(2)}, ground=${terrainGround.toFixed(2)}`,
          )
        } else {
          console.log(
            `Vehicle Y=${position[1].toFixed(2)} >= terrain=${terrainGround.toFixed(2)}, already above ground`,
          )
        }

        // Update catch floor to show at terrain level
        this.catchFloor?.show(
          [currentX, terrainGround, currentZ],
          [0, 0, 0, 1],
          this.renderOrigin,
        )
      }
    }

    // If vehicle falls below ground by more than 5m, try to recover
    if (ground !== undefined && position[1] < ground - 5 && !this.waitingForTerrain) {
      console.warn(
        `Vehicle fell below terrain (Y=${position[1].toFixed(2)}, ground=${ground.toFixed(2)}), recovering...`,
      )
      // Teleport back to spawn position (which is on real terrain)
      this.sim.teleportVehicle(this.spawnPosition, 0)
    }

    // Hide catch floor once terrain collision is working
    const collisionReady = this.sim.preparePlanetCollisions()
    if (ground !== undefined && collisionReady && !this.waitingForTerrain) {
      this.catchFloor?.hide()
    }

    // Debug logging every second
    this.debugLogTimer += elapsed
    if (this.debugLogTimer >= 1) {
      this.debugLogTimer = 0
      console.log(
        `[DEBUG] Vehicle Y=${position[1].toFixed(2)}, ground=${ground?.toFixed(2) ?? 'undefined'}, speed=${(player.speed * 3.6).toFixed(1)}km/h`,
      )
    }

    this.driving.update(this.sim, elapsed)
    this.updateCamera(elapsed)
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
      yaw: this.driving.getYaw(),
      sprint: this.keys.has('ShiftLeft'),
      jump: this.keys.has('Space'),
      brake: this.keys.has('Space'),
    }
  }

  private updateCamera(elapsed: number): void {
    if (!this.sim) return

    const groundUp = new THREE.Vector3(0, 1, 0)
    const cameraState = this.driving.computeCamera(this.sim, elapsed, groundUp)

    this.camera.position.copy(cameraState.position)
    this.camera.up.copy(cameraState.up)
    this.camera.lookAt(cameraState.target)
    this.camera.fov = cameraState.fov
    this.camera.updateProjectionMatrix()
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
    const mode = this.driving.cycleCamera()
    console.log(
      `Cámara: ${mode === 'chase' ? 'seguimiento' : mode === 'cockpit' ? 'conductor' : 'mapa'}`,
    )
  }

  private async resetVehicle(): Promise<void> {
    if (!this.sim || !this.world) return

    const player = this.sim.player
    if (!player.vehicleId) return

    const currentPos = player.position
    const groundHeightFn = (pos: Vec3Tuple) => this.world!.groundHeight(pos)
    const currentGround = checkFootprint(groundHeightFn, currentPos, FOOTPRINT_RADIUS)

    if (currentGround !== undefined && currentPos[1] > currentGround - 5) {
      // Current position has ground - just upright it
      this.sim.recoverVehicle()
    } else {
      // No ground at current position - wait for terrain and teleport
      console.log('Waiting for terrain at reset position...')

      const maxWait = 5000
      const started = Date.now()

      while (Date.now() - started < maxWait) {
        this.world.update(currentPos, [0, 0, 0])
        this.world.flushInstall(10)

        const ground = checkFootprint(groundHeightFn, currentPos, FOOTPRINT_RADIUS)
        if (ground !== undefined) {
          const vehicleHeight = 0.62
          this.sim.teleportVehicle([currentPos[0], ground + vehicleHeight, currentPos[2]], 0)
          return
        }

        await new Promise((r) => setTimeout(r, 100))
      }

      // Fallback to original spawn position
      console.log('Resetting to spawn position:', this.spawnPosition)
      this.sim.teleportVehicle(this.spawnPosition, 0)
    }
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
    const terrainWarning = document.getElementById('terrain-warning')

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

    if (terrainWarning) {
      if (this.terrainMessage) {
        terrainWarning.textContent = this.terrainMessage
        terrainWarning.style.display = 'block'
      } else {
        terrainWarning.style.display = 'none'
      }
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
    this.driving.dispose()
    this.renderer.dispose()
  }
}

const game = new Game()
void game.start()
