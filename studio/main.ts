import { vehicleMenuKey } from '@nabla/engine/runtime'
import { randomUUID } from '../src/util/uuid.js'
import {
  commands,
  bindAction,
  inspector,
  sceneNodes,
  hierarchyNodes,
  transformSelection,
  selection,
  selectEntity,
  inspectCapability,
  cursorTool,
  objectMode,
  log,
} from './ui/state.js'
import { objectProperties, chooseCapability, axisLocked, axisLocks } from './ui/properties.js'
import { sceneTree, sceneHierarchy } from './ui/scene-tree.js'
import { openExactTransform } from './ui/exact-transform.js'
import { parseScene } from '../src/scene/document.js'
import { capturePng } from '../src/render/capture.js'
import { simplifiedTide } from '../src/planet/tide.js'
import { CatchFloor } from '../src/render/planet/catch-floor.js'
import { seaSeenFromBelow } from '../src/render/planet/ocean-sheet.js'
import { TileDebugView, type TileDebugMode } from '../src/render/planet/debug.js'
import { PerformanceMonitor } from '../src/diagnostics/performance-monitor.js'
import { TouchDriving } from './touch-driving.js'
import {
  GameRuntime,
  VehicleEffects,
  availableGamepads,
  playGroundClearance,
} from '@nabla/engine/runtime'
import { setNavigationPlaces } from '../src/render/entity/navigation-places.js'
import { flightEntry, urlPlay } from './flight-entry.js'
import { geoToLocal } from '../src/math/geo/sphere.js'
import { urlLocation } from './url-location.js'
import { settleGroundPlacement } from './ground-placement.js'
import { mountStudio } from './shell.js'
import { setPlanetCharts } from '../src/render/entity/helm-map.js'
import { PlanetWorld, projectedLayers } from '../src/render/planet/world.js'
import { FieldLights, fieldLayers, lampLook } from '../src/render/entity/field-lights.js'
import { planetaryScene, createPlanetScene } from './planet-scene.js'
import { geographicPose, anchoredWorldPose } from './geographic-pose.js'
import { bindCoverageMap } from './ui/coverage-map.js'
import { prepareStartup } from './startup.js'
import { authoredTree, isMapEnvironment } from './outliner.js'
import { RemotePortalViews } from '../src/render/portal/remote.js'
import { portalRegistry, setPortalConnection } from './portal-registry.js'
import { portalEnvironment } from '../src/render/portal/environment.js'
import {
  createProject,
  travelPlanet,
  locationId,
  parseProject,
  retainLocation,
  visitLocation,
  projectFilename,
  type StudioProject,
} from './project.js'
import { FrameLoop } from '../src/runtime/frame-loop.js'
import { StudioInputOwner } from './input-owner.js'
import { mapCacheStats, setMapCacheBudget, clearMapCache } from '../src/render/planet/cache.js'
import { receiveMapGeometry, type PreparedMapGeometry } from '../src/render/planet/geometry.js'
import { roadGeometry } from '../src/planet/land/roads/draped-road.js'
import { VehicleAudio } from './vehicle-audio.js'
import { activatePreparation } from './preparation-access.js'
void activatePreparation()
import { createCatalogEntities, entityCatalog } from '../src/index.js'
import { SelectionOutline } from './selection-outline.js'
import { SelectionSilhouette } from './selection-silhouette.js'
import { readPerformance, shadowTiers, performancePresets, streamBudget } from './performance.js'
import { DepthOfField } from '../src/render/effects/depth-of-field.js'
import { ShadowManager } from '../src/render/shadows.js'
import { readScene, writeScene } from './scene-storage.js'
import { SolidEditor } from './solid-editor.js'
import { treeSprite } from '../src/entity/sprite/sprite.js'
import { createGallery, Gallery } from './gallery.js'
import { PortalControls } from './portal-controls.js'
import { Sidearm } from './sidearm.js'
import { DrivingTelemetry } from '../src/render/entity/driving-camera.js'
import { WheelDebugOverlay } from './wheel-debug.js'
import { createPortal } from '../src/entity/portal/portal.js'
import { renderPortals, type ExternalPortalView } from '../src/render/portal/portals.js'
import { skyTime, localTimeInput, type SkyClock } from '../src/planet/sky.js'
import { GeographicView } from '../src/render/planet/sky.js'
import { WorldEnvironment, configureWorldRenderer } from '../src/render/planet/world-environment.js'
import { localToGeo, MADRID } from '../src/math/geo/sphere.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import {
  SceneEditor,
  createSampleScene,
  type SceneDocument,
  SceneGraph,
  Simulation,
  createEntity,
  idleInput,
  type Entity,
  type Vec3Tuple,
} from '../src/index.js'
import { SceneView } from '../src/presentation/scene-view.js'
import './style.css'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error('Missing element: ' + id)
  return element as T
}
const performanceSettings = readPerformance()
const STORAGE_KEY = 'nabla.scene.v1'
const PROJECT_KEY = 'nabla.project.v1'
let project: StudioProject | undefined
let portalEntriesCache: ReturnType<typeof portalRegistry> = []
let portalEntriesProject: StudioProject | undefined
const requestedLocation = urlLocation(location.search)
const urlDestination =
  requestedLocation && !('error' in requestedLocation) ? requestedLocation : null
const circuitMode =
  !urlDestination && new URLSearchParams(location.search).get('scene') === 'circuit'
let loadingWorld = true
const vehicleAudio = new VehicleAudio()
let groundPlacementDirty = true
let worldStream: PlanetWorld | null = null
let tileDebug: TileDebugView | null = null
let streamMode: 'ground' | 'flight' | 'model' = 'ground'
const performanceMonitor = new PerformanceMonitor()
let streamGeography = ''
let streamSample: { at: number; position: Vec3Tuple } | null = null
let editor = new SceneEditor({
  version: 1,
  name: 'Preparando mundo',
  entities: [createEntity('spawn', 'spawn')],
})
let startupPending = true
let finishStartup!: () => void
const startupDone = new Promise<void>((resolve) => {
  finishStartup = resolve
})
project = createProject(editor.document)
let savedDocument = editor.serialize()
let editorMetadataDirty = false
let restoredLockState: StudioProject['editorState']
let restoredLockLocation = ''
const collapsed = new Set(
  editor.document.entities.filter((e) => e.kind === 'group').map((e) => e.id),
)
let selectedGeometry: Entity['geometry']
let selectedId =
  editor.document.entities.find((e) => e.kind === 'vehicle')?.id ?? editor.document.entities[0].id
const game = new GameRuntime()
let sim: Simulation | null = null
let needsRender = true
let firstPerson = true
let fireRequested = false
let weaponDrawn = false
let cameraMode: 'chase' | 'cockpit' | 'map' = 'chase'
let headYaw = 0
let headPitch = 0.05
let vehicleEntrance: { id: string; started: number } | null = null
const preparedVehicles = new WeakSet<THREE.Object3D>()
let mapHeight = 45
let mapZoom = 1
const drivingTelemetry = new DrivingTelemetry()
function pushGameCamera(): void {
  Object.assign(game.cameraState, {
    mode: cameraMode,
    firstPerson,
    yaw,
    pitch,
    headYaw,
    headPitch,
    lastLookTime,
    mapHeight,
    mapZoom,
    entrance: vehicleEntrance,
    telemetry: drivingTelemetry,
  })
}
function pullGameCamera(): void {
  const state = game.cameraState
  cameraMode = state.mode
  firstPerson = state.firstPerson
  yaw = state.yaw
  pitch = state.pitch
  headYaw = state.headYaw
  headPitch = state.headPitch
  mapHeight = state.mapHeight
  vehicleEntrance = state.entrance
}
function gameAction(code: string): string {
  pushGameCamera()
  const message = game.action(code)
  pullGameCamera()
  return message ?? ''
}
function cycleCamera(): void {
  const message = gameAction('KeyC')
  if (message) toast(message)
}
let lastLookTime = 0
let yaw = 0,
  pitch = 0.24
const keys = game.keys.values
const studioInput = new StudioInputOwner(() => {
  game.releaseInput()
  fireRequested = false
  if (document.pointerLockElement) document.exitPointerLock()
})
let toastTimer: ReturnType<typeof setTimeout>
let remotePortalViews: RemotePortalViews | undefined
function toast(message: string): void {
  log(message)
  $('toast').textContent = message
  $('toast').style.display = 'block'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    $('toast').style.display = 'none'
  }, 3500)
}
function action(fn: () => void | Promise<void>): void {
  const fail = (error: unknown) =>
    toast(error instanceof Error ? error.message : 'No se pudo completar la acción')
  try {
    const result = fn()
    if (result) result.catch(fail)
  } catch (error) {
    fail(error)
  }
}
const viewport = $('viewport')
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  logarithmicDepthBuffer: true,
  alpha: true,
})
renderer.setPixelRatio(Math.min(devicePixelRatio, performanceSettings.resolution))
renderer.shadowMap.enabled = performanceSettings.shadows > 0
renderer.shadowMap.type = THREE.PCFShadowMap
// Refresh once for the main view; auxiliary cameras reuse that map.
renderer.shadowMap.autoUpdate = false
configureWorldRenderer(renderer)

const DRONE_W = 320
const DRONE_H = 180
const droneTarget = new THREE.WebGLRenderTarget(DRONE_W, DRONE_H)
const droneCamera = new THREE.PerspectiveCamera(68, DRONE_W / DRONE_H, 0.35, 8000)
const dronePixels = new Uint8Array(DRONE_W * DRONE_H * 4)
const droneImage = new ImageData(DRONE_W, DRONE_H)
const droneClear = new THREE.Color()
let droneOn = false
let droneLat = Number.NaN
let droneLon = Number.NaN
let dronePreview = ''
viewport.prepend(renderer.domElement)
const depthOfField = new DepthOfField()
const performanceHud = document.createElement('output')
performanceHud.className = 'performance-hud'
performanceHud.hidden = true
viewport.append(performanceHud)
const touchDriving = new TouchDriving(viewport, {
  play: () => $('play').click(),
  interact: () => {
    if (sim) toast(gameAction('KeyE'))
  },
  camera: () => cycleCamera(),
})

renderer.domElement.setAttribute('aria-label', 'Vista 3D de la escena')
const scene = new THREE.Scene()
const vehicleEffects = new VehicleEffects(scene, vehicleAudio)
const tireMarks = vehicleEffects.marks
const fieldLights = new FieldLights()
scene.add(fieldLights.root)
let fieldFollow = true
scene.background = new THREE.Color('#a6bbd5')
scene.fog = new THREE.Fog('#a6bbd5', 70, 160)
// A small diffuse fill lifts shadows without adding an environment reflection.
scene.environment = null
scene.environmentIntensity = 0
const sun = new THREE.DirectionalLight('#ffe1b1', 3.2)
sun.position.set(-25, 45, 25)
sun.castShadow = false
scene.add(sun)
const ambientFill = new THREE.AmbientLight('#dce7f5', 0.22)
scene.add(ambientFill)

const grid = new THREE.GridHelper(100, 100, '#9eb9ae', '#829b93')
grid.position.y = 0.035
;(grid.material as THREE.Material).opacity = 0.18
;(grid.material as THREE.Material).transparent = true
scene.add(grid)
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 250)
camera.position.set(10, 5, 12)

const shadowManager = new ShadowManager()
const sunDirection = new THREE.Vector3(25, -45, -25).normalize()
const shadowTier = shadowTiers[performanceSettings.shadows]
if (shadowTier) {
  shadowManager.init({
    camera,
    scene,
    lightDirection: sunDirection,
    lightIntensity: 3.2,
    tier: shadowTier,
  })
}

const orbit = new OrbitControls(camera, renderer.domElement)
orbit.target.fromArray(editor.document.cursor ?? [0, 0, 0])
orbit.enableDamping = true
orbit.maxPolarAngle = Math.PI * 0.48
orbit.minDistance = 3
orbit.maxDistance = 100000000
orbit.update()
orbit.addEventListener('change', () => {
  needsRender = true
})
const gizmo = new TransformControls(camera, renderer.domElement)
gizmo.setSpace('local')
gizmo.setSize(0.8)
scene.add(gizmo.getHelper())
gizmo.addEventListener('change', () => {
  needsRender = true
})
const worldCursor = new THREE.Group()
const cursorAxes = new THREE.AxesHelper(1)
worldCursor.add(cursorAxes)
const cursorRing = new THREE.Mesh(
  new THREE.TorusGeometry(0.3, 0.025, 6, 24),
  new THREE.MeshBasicMaterial({ color: 0xffd36e, depthTest: false, depthWrite: false }),
)
cursorRing.renderOrder = 50
worldCursor.add(cursorRing)
worldCursor.renderOrder = 50
scene.add(worldCursor)
function syncCursor(position: Vec3Tuple = editor.document.cursor ?? [0, 0, 0]): void {
  worldCursor.position.fromArray(position)
  for (const [i, axis] of ['x', 'y', 'z'].entries())
    $<HTMLInputElement>(`cursor-${axis}`).value = String(position[i])
  needsRender = true
}
/** Recenter without changing the user's viewing angle or zoom. */
function focusCursor(resetDistance = false): void {
  if (sim) return
  const target = new THREE.Vector3(...(editor.document.cursor ?? [0, 0, 0]))
  if (resetDistance) camera.position.copy(target).add(new THREE.Vector3(35, 32, 40))
  else camera.position.add(target.clone().sub(orbit.target))
  orbit.target.copy(target)
  orbit.update()
  needsRender = true
}
function placeCursor(position: Vec3Tuple): void {
  editor.setCursor(position)
  syncCursor()
  focusCursor()
  $('status').textContent = 'Cambios sin guardar'
  if (cursorTool.value) refreshUi()
}
bindAction('cursor-apply', () =>
  action(() =>
    placeCursor(
      ['x', 'y', 'z'].map((a) => $<HTMLInputElement>(`cursor-${a}`).valueAsNumber) as Vec3Tuple,
    ),
  ),
)
bindAction('cursor-selection', () =>
  action(() =>
    placeCursor(SceneGraph.fromValidated(editor.document).worldTransform(selectedId).position),
  ),
)
bindAction('cursor-view', () => action(() => placeCursor(orbit.target.toArray())))
bindAction('selection-cursor', () =>
  action(() => {
    const entity = editor.document.entities.find((e) => e.id === selectedId)!
    if (isMapEnvironment(entity) && !entity.mapEditable)
      throw new Error('Pulsa Crear modificación antes de editar el edificio')
    editor.moveToCursor(selectedId)
    rebuild()
  }),
)
bindAction('origin-cursor', () =>
  action(() => {
    const entity = editor.document.entities.find((e) => e.id === selectedId)!
    if (isMapEnvironment(entity) && !entity.mapEditable)
      throw new Error('Pulsa Crear modificación antes de editar el edificio')
    editor.originToCursor(selectedId)
    rebuild()
  }),
)
function lockAxis(axis: string): void {
  $<HTMLSelectElement>('transform-axis').value = axis
  gizmo.showX = (axis === 'all' || axis === 'X') && !axisLocked(selectedId, 0)
  gizmo.showY = (axis === 'all' || axis === 'Y') && !axisLocked(selectedId, 1)
  gizmo.showZ = (axis === 'all' || axis === 'Z') && !axisLocked(selectedId, 2)
  needsRender = true
}
$('transform-axis').onchange = () => lockAxis($<HTMLSelectElement>('transform-axis').value)
bindAction('transform-exact', () =>
  action(() => {
    const axis = $<HTMLSelectElement>('transform-axis').value,
      amount = $<HTMLInputElement>('transform-amount').valueAsNumber
    if (axis === 'all' || !Number.isFinite(amount))
      throw new Error('Elige X, Y o Z y una cantidad finita')
    const doc = view.document,
      graph = SceneGraph.fromValidated(doc),
      entity = doc.entities.find((e) => e.id === selectedId)!
    if (isMapEnvironment(entity) && !entity.mapEditable)
      throw new Error('Pulsa Crear modificación antes de editar el edificio')
    const pose = graph.worldTransform(selectedId),
      i = 'XYZ'.indexOf(axis)
    if (gizmo.getMode() === 'rotate') {
      const v = new THREE.Vector3()
      v.setComponent(i, 1)
      pose.rotation = new THREE.Quaternion(...pose.rotation)
        .multiply(new THREE.Quaternion().setFromAxisAngle(v, (amount * Math.PI) / 180))
        .toArray()
    } else {
      const delta = new THREE.Vector3()
        .setComponent(i, amount)
        .applyQuaternion(new THREE.Quaternion(...pose.rotation))
      pose.position = new THREE.Vector3(...pose.position).add(delta).toArray()
    }
    editor.update(selectedId, { transform: graph.localFromWorld(entity.parentId, pose) })
    finishPoseEdit(selectedId)
  }),
)
const silhouette = new SelectionSilhouette()
const outline = new SelectionOutline()
scene.add(outline)
const lastWorldInstallMs = 0
const worldEnvironment = new WorldEnvironment(scene, sun, ambientFill, () => {
  needsRender = true
})
let waterLevel = 0
let waterMode: 'manual' | 'tide' = 'tide'
let tideAmplitude = 1
let nextTideReadout = 0
const ocean = worldEnvironment.ocean
const seaRoot = ocean.mesh
shadowManager.setupMaterial(seaRoot.material)
scene.add(seaRoot)
const catchFloor = new CatchFloor()
shadowManager.setupMaterial(catchFloor.mesh.material)
scene.add(catchFloor.mesh)
let view = new SceneView(editor.document, performanceSettings.preset === 'ultra', true)
view.setupMaterials((material) => shadowManager.setupMaterial(material))
scene.add(view.root)
let geography = new GeographicView(
  editor.document,
  () => {
    needsRender = true
  },
  false,
)
attachGeography(geography)
let skyClock: SkyClock = editor.document.sky ?? { mode: 'live' }
const renderOrigin = new THREE.Vector3()
watchAssets(view)
function watchAssets(current: SceneView): void {
  renderer.domElement.dataset.assets = 'loading'
  current.ready
    .then(() => {
      if (view === current) {
        if (!startupPending) renderer.domElement.dataset.assets = 'loaded'
        current.setupMaterials((material) => shadowManager.setupMaterial(material))
        needsRender = true
      }
    })
    .catch((error) => {
      if (view !== current) return
      renderer.domElement.dataset.assets = 'failed'
      toast('No se pudo cargar un modelo: ' + String(error))
    })
}
let orbitStartPosition = camera.position.clone(),
  orbitStartTarget = orbit.target.clone()
let dragging = false

gizmo.addEventListener('dragging-changed', (event) => {
  dragging = Boolean(event.value)
  orbit.enabled = !dragging && !sim
})
gizmo.addEventListener('mouseUp', () => {
  if (sim) return
  action(() => {
    const object = view.objects.get(selectedId)
    if (!object) return
    const entity = view.document.entities.find((e) => e.id === selectedId)!
    const graph = SceneGraph.fromValidated(view.document)
    editor.update(selectedId, {
      transform: graph.localFromWorld(entity.parentId, {
        position: object.position.toArray(),
        rotation: object.quaternion.clone().normalize().toArray(),
      }),
    })
    finishPoseEdit(selectedId)
  })
})
const solidEditor = new SolidEditor(
  (geometry) => {
    editor.update(selectedId, { geometry })
    rebuild()
  },
  refreshUi,
  toast,
  () => editor.document.cursor ?? [0, 0, 0],
)

function finishPoseEdit(id: string): void {
  view.updateEntityPose(editor.entity(id))
  refreshUi(view.document, true)
}

function rebuild(prepared?: PreparedMapGeometry): void {
  groundPlacementDirty = true
  const migrated = planetaryScene(editor.document)
  if (migrated !== editor.document) editor.load(migrated)
  const document = editor.document
  if (!prepared && view.updateEditorPoses(document)) {
    refreshUi()
    return
  }
  remotePortalViews?.dispose()
  syncCursor()
  gizmo.detach()
  if (
    JSON.stringify(view.document.geography) !== JSON.stringify(document.geography) ||
    view.document.entities.some((e) => !!e.terrain) !== document.entities.some((e) => !!e.terrain)
  ) {
    geography.dispose()
    geography = new GeographicView(
      document,
      () => {
        needsRender = true
      },
      false,
    )
    attachGeography(geography)
  }
  view.dispose()
  if (prepared) receiveMapGeometry(document.entities, prepared)
  view = new SceneView(document, performanceSettings.preset === 'ultra', true)
  view.setupMaterials((material) => shadowManager.setupMaterial(material))
  renderer.domElement.dataset.impacts = '0'
  scene.add(view.root)
  watchAssets(view)
  setupWorldStream()
  if (!document.entities.some((e) => e.id === selectedId))
    selectedId = document.entities.find((e) => !isMapEnvironment(e))?.id ?? document.entities[0].id
  refreshUi()
}
function setupWorldStream(): void {
  streamSample = null
  const doc = editor.document
  seaRoot.visible = !!doc.geography && sceneLayer('layer-sea')
  $('stream-status').textContent = ''
  const identity = doc.geography?.planetary ? JSON.stringify(doc.geography) : ''
  if (worldStream && streamGeography === identity) return
  tileDebug?.dispose()
  tileDebug = null
  worldStream?.dispose()
  worldStream = null
  setPlanetCharts(() => worldStream?.chartTiles ?? [])
  setNavigationPlaces(() => worldStream?.navigationPlaces ?? [])
  streamGeography = identity
  if (!doc.geography?.planetary) return
  worldStream = new PlanetWorld(
    doc.geography,
    () => {
      needsRender = true
      $('stream-status').textContent = worldStream?.status ?? ''
      groundPlacementDirty = true
    },
    (material) => shadowManager.setupMaterial(material),
  )
  worldStream.useSea(() => ocean.surface())
  worldStream.setDistance(performanceSettings.distance)
  worldStream.setRelief(performanceSettings.relief)
  const budget = streamBudget(performanceSettings)
  worldStream.setQuality(budget.concurrent, budget.ahead, budget.retain, budget.tiles)
  tileDebug = new TileDebugView(doc.geography)
  worldStream.root.add(tileDebug.root)
  worldStream.setStreamMode(streamMode)
  scene.add(worldStream.root)
  $('stream-status').textContent = 'Exploración conectada · editor y juego'
}
let mapInspection = false
function select(id: string): void {
  mapInspection = false
  worldStream?.clearSelection()
  selectedId = id
  cursorTool.value = false
  refreshUi()
}
function refreshUi(doc: SceneDocument = editor.document, poseEdited = false): void {
  if (
    restoredLockState !== project?.editorState ||
    restoredLockLocation !== project?.activeLocation
  ) {
    axisLocks.clear()
    for (const [id, axes] of Object.entries(
      project?.editorState?.axisLocks[project.activeLocation] ?? {},
    ))
      axisLocks.set(id, new Set(axes))
    restoredLockState = project?.editorState
    restoredLockLocation = project?.activeLocation ?? ''
  }
  refreshPortalEntries(doc)
  const places = $<HTMLSelectElement>('project-places')
  places.replaceChildren(
    ...(project!.bookmarks ?? []).map((place, index) => {
      const option = document.createElement('option')
      option.value = `bookmark:${index}`
      option.textContent = place.name
      return option
    }),
    ...project!.locations
      .filter((p) => p.id !== 'planet')
      .map((place) => {
        const option = document.createElement('option')
        option.value = place.id
        option.textContent = place.scene.name
        option.selected = place.id === project!.activeLocation
        return option
      }),
  )
  $<HTMLButtonElement>('project-place-open').disabled = loadingWorld

  syncCursor(doc.cursor ?? [0, 0, 0])
  $('cursor-menu')
    .querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
      'input,button,select',
    )
    .forEach((el) => (el.disabled = !!sim || loadingWorld))
  needsRender = true
  let parentId = doc.entities.find((e) => e.id === selectedId)?.parentId
  while (parentId) {
    collapsed.delete(parentId)
    parentId = doc.entities.find((e) => e.id === parentId)?.parentId
  }
  setAddMenu(false)
  $('scene-name').textContent = doc.name
  $('view-subtitle').textContent = doc.name
  grid.visible = !sim && !doc.geography?.planetary && !doc.entities.some((e) => e.terrain)
  $('world-note').hidden = !doc.geography?.planetary && !doc.entities.some((e) => e.terrain)
  const water = doc.water ?? { mode: 'tide' as const, level: 0, amplitude: 1 }
  waterMode = water.mode
  tideAmplitude = water.amplitude
  $<HTMLSelectElement>('water-mode').value = waterMode
  $<HTMLInputElement>('tide-amplitude').value = String(tideAmplitude)
  if (waterMode === 'manual') {
    waterLevel = water.level
    ocean.setLevel(waterLevel)
    sim?.setWaterLevel(waterLevel)
  }
  $<HTMLInputElement>('water-level').value = String(waterLevel)
  $<HTMLInputElement>('water-level-number').value = String(waterLevel)
  nextTideReadout = 0
  skyClock = doc.sky ?? { mode: 'live' }
  $<HTMLInputElement>('sky-time').value = localTimeInput(skyTime(skyClock))
  syncSkyHour()
  $('sky-live').classList.toggle('active', skyClock.mode === 'live')
  $('sky-timezone').textContent = Intl.DateTimeFormat().resolvedOptions().timeZone
  const geo = doc.geography ?? MADRID
  $<HTMLInputElement>('latitude').value = String(geo.latitude)
  $<HTMLInputElement>('longitude').value = String(geo.longitude)
  $<HTMLSelectElement>('imagery').value = doc.geography?.imagery ?? 'satellite'
  for (const id of ['latitude', 'longitude', 'imagery', 'apply-location', 'locate'])
    $<HTMLInputElement>(id).disabled = Boolean(sim) || loadingWorld || id === 'imagery'
  $('entity-count').textContent = String(doc.entities.length)
  $('status').textContent =
    !editorMetadataDirty && !poseEdited && editor.serialize() === savedDocument
      ? 'Guardado local'
      : 'Cambios sin guardar'
  sceneNodes.value = sceneTree(doc.entities, !!sim)
  hierarchyNodes.value = sceneHierarchy(doc.entities, !!sim)
  selection.value = selectedId
  selectEntity.value = select
  $('entity-count').textContent = String([...authoredTree(doc.entities).values()].flat().length)
  const e = doc.entities.find((item) => item.id === selectedId)!
  selectedGeometry = e.geometry
  const context = {
    doc,
    entity: e,
    editor,
    disabled: !!sim || loadingWorld,
    canEdit: () => !sim && !loadingWorld,
    refresh: refreshUi,
    rebuild,
    finishPose: finishPoseEdit,
    locksChanged: () => {
      if (project) {
        project.editorState = {
          axisLocks: {
            ...project.editorState?.axisLocks,
            [project.activeLocation]: Object.fromEntries(
              [...axisLocks].map(([id, axes]) => [id, [...axes]]),
            ),
          },
        }
      }
      restoredLockState = project?.editorState
      editorMetadataDirty = true
      lockAxis('all')
    },
  }
  inspector.value = objectProperties(context)
  inspectCapability.value = () => chooseCapability(context)
  transformSelection.value = () => openExactTransform(context)
  let props = document.getElementById('properties-extras')
  if (!props) {
    props = document.createElement('div')
    props.id = 'properties-extras'
    $('properties').append(props)
  }
  props.replaceChildren()
  if (e.road && !sim && (!e.road.elevation || e.road.elevation === 'terrain')) {
    const label = document.createElement('label')
    label.className = 'field-label'
    label.textContent = 'Superficie de conducción'
    label.htmlFor = 'road-surface-mode'
    const control = document.createElement('select')
    control.id = 'road-surface-mode'
    control.innerHTML =
      '<option value="raw">Terreno original</option><option value="smooth-float">Suavizada · experimental</option>'
    control.value = e.road.mode ?? 'raw'
    control.onchange = () =>
      action(() => {
        editor.update(e.id, { road: { ...e.road!, mode: control.value as 'raw' | 'smooth-float' } })
        rebuild()
      })
    const note = document.createElement('p')
    note.textContent =
      'Aplana el ancho y suaviza pendientes elevando la calzada. Revisa sus extremos y cruces; no une otras carreteras automáticamente.'
    props.append(label, control, note)
  }
  if (e.road && !sim && e.road.elevation !== 'tunnel') {
    const button = document.createElement('button')
    button.textContent = 'Convertir carretera en sólido editable'
    button.onclick = () =>
      action(() => {
        const doc = editor.document,
          road = doc.entities.find((item) => item.id === e.id)!,
          terrain = doc.entities.find((item) => item.id === road.road!.terrainId)?.terrain
        if (!terrain) throw new Error('Carga el terreno de esta carretera')
        const geometry = roadGeometry(terrain, road.road!.paths, road.road!.width, road.road)
        delete road.road
        road.kind = 'solid'
        road.geometry = geometry
        road.motion = 'static'
        editor.load(doc)
        rebuild()
      })
    props.append(button)
  }
  const mapReadOnly = isMapEnvironment(e) && !e.mapEditable
  if (mapReadOnly) solidEditor.close()
  else solidEditor.mount(e, view.objects.get(e.id)!, props, !!sim)
  const modeControl = $<HTMLSelectElement>('studio-object-mode')
  modeControl.value = solidEditor.active ? 'edit' : 'object'
  modeControl.disabled = !!sim || loadingWorld
  modeControl.querySelector<HTMLOptionElement>('[value=edit]')!.disabled =
    !e.geometry || mapReadOnly
  modeControl.title = e.geometry
    ? 'Editar el objeto o su geometría'
    : 'Este objeto no contiene un sólido editable'
  modeControl.onchange = () => {
    if ((modeControl.value === 'edit') !== solidEditor.active)
      document.getElementById('edit-solid')?.click()
  }
  if (e.portal) {
    const sourceEntry = registrySource(e.id)
    const connection = project!.connections?.find((c) => c.source === sourceEntry?.id)
    const options = [
      { value: '', label: 'Sin enlace' },
      ...doc.entities
        .filter(
          (x) =>
            x.portal && x.id !== e.id && x.size.every((n, i) => Math.abs(n - e.size[i]) < 1e-6),
        )
        .map((x) => ({ value: x.id, label: x.name })),
      ...projectPortalEntries()
        .filter(
          (p) =>
            (p.locationId !== project!.activeLocation ||
              project!.connections?.some(
                (c) => c.source === sourceEntry?.id && c.destination === p.id,
              )) &&
            p.size.every((n, i) => Math.abs(n - e.size[i]) < 1e-6),
        )
        .map((p) => ({ value: 'global:' + p.id, label: p.name + ' · ' + p.place })),
    ]
    inspector.value = [
      ...inspector.value,
      {
        id: 'portal',
        label: 'Portal',
        note:
          !connection && !e.portal.pairId
            ? 'Elige un destino para activar la ventana o el paso.'
            : undefined,
        fields: [
          {
            id: 'portal-destination',
            label: 'Destino',
            type: 'select',
            value: connection ? 'global:' + connection.destination : (e.portal.pairId ?? ''),
            options,
            disabled: !!sim || loadingWorld,
            change: (value) => {
              const target = String(value)
              if (target.startsWith('global:')) {
                editor.linkPortals(e.id, null)
                configureProjectPortal(e.id, target.slice(7), false)
              } else {
                if (connection) configureProjectPortal(e.id, null, false)
                editor.linkPortals(e.id, target || null)
              }
              rebuild()
            },
          },
          {
            id: 'portal-mode',
            label: 'Conexión',
            type: 'select',
            value: connection?.mode ?? e.portal.mode,
            disabled: !!sim || loadingWorld || (!connection && !e.portal.pairId),
            options: [
              { value: 'closed', label: 'Cerrado' },
              { value: 'window', label: 'Ventana' },
              ...(!connection ? [{ value: 'open', label: 'Paso abierto' }] : []),
            ],
            change: (value) => {
              if (connection) {
                configureProjectPortal(e.id, connection.destination, value === 'window')
                refreshUi()
              } else {
                editor.setPortalMode(e.id, value as 'open' | 'closed' | 'window')
                rebuild()
              }
            },
          },
        ],
      },
    ]
  }
  objectMode.value = solidEditor.active ? 'edit' : 'object'
  if (!sim) {
    if (solidEditor.active || mapReadOnly || cursorTool.value) gizmo.detach()
    else if (view.objects.has(e.id)) gizmo.attach(view.objects.get(e.id)!)
    else gizmo.detach()
  }
  bindAction(
    'duplicate',
    () =>
      action(() => {
        selectedId = editor.duplicate(e.id)
        rebuild()
      }),
    'Duplicar',
  )
  bindAction(
    'delete',
    () =>
      action(() => {
        editor.remove(e.id)
        rebuild()
      }),
    'Eliminar',
  )
  for (const id of ['duplicate', 'delete'])
    commands.get(id)!.enabled = () =>
      !sim && !loadingWorld && !mapReadOnly && e.kind !== 'spawn' && !cursorTool.value
  if (cursorTool.value) {
    const cursor = doc.cursor ?? [0, 0, 0]
    inspector.value = [
      {
        id: 'information',
        label: 'Información',
        fields: [
          {
            id: 'cursor-name',
            label: 'Nombre',
            value: 'Cursor 3D',
            readonly: true,
            change: () => {},
          },
        ],
      },
      {
        id: 'position',
        label: 'Situación',
        fields: cursor.map((value, i) => ({
          id: 'cursor-position-' + i,
          label: 'Posición ' + 'XYZ'[i],
          type: 'number' as const,
          value,
          unit: 'm',
          disabled: !!sim || loadingWorld,
          change: (value: string | number | boolean) => {
            const next = [...cursor] as Vec3Tuple
            next[i] = Number(value)
            placeCursor(next)
            refreshUi()
          },
        })),
      },
    ]
  }
  lockAxis($<HTMLSelectElement>('transform-axis').value)
  if (commands.get('play')) commands.get('play')!.icon = sim ? 'stop' : 'play'
  commands.notify()
  $<HTMLButtonElement>('undo').disabled = !!sim || loadingWorld || !editor.canUndo
  $<HTMLButtonElement>('redo').disabled = !!sim || loadingWorld || !editor.canRedo
  for (const id of [
    'add-entity',
    'add-solid',
    'add-box',
    ...entityCatalog.map((entry) => `add-${entry.id}`),
    'add-group',
    'add-sprite',
    'sample-gallery',
    'translate',
    'rotate',
    'import',
    'world-irun',
    'world-irun-official',
    'sample-assets',
    'save-as',
    'sample-portals',
    'focus',
  ])
    $<HTMLButtonElement>(id).disabled = !!sim || loadingWorld
}
function setTool(mode: 'translate' | 'rotate'): void {
  if (sim) return
  if (cursorTool.value) {
    cursorTool.value = false
    refreshUi()
  }
  if (solidEditor.active) {
    solidEditor.close()
    refreshUi()
  }
  gizmo.setMode(mode)
  $('translate').classList.toggle('active', mode === 'translate')
  $('rotate').classList.toggle('active', mode === 'rotate')
  commands.notify()
}
bindAction('translate', () => setTool('translate'))
bindAction('rotate', () => setTool('rotate'))
commands.get('translate')!.checked = () => !cursorTool.value && gizmo.mode === 'translate'
commands.get('rotate')!.checked = () => !cursorTool.value && gizmo.mode === 'rotate'
function setAddMenu(open: boolean): void {
  $('add-menu').hidden = !open
  $('add-entity').setAttribute('aria-expanded', String(open))
}
bindAction('add-entity', () => setAddMenu(Boolean($('add-menu').hidden)))
document.addEventListener('click', (event) => {
  const target = event.target as Node
  if (!$('add-menu').contains(target) && !$('add-entity').contains(target)) setAddMenu(false)
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('add-menu').hidden) {
    setAddMenu(false)
    $('add-entity').focus()
  }
})
function undoScene(): void {
  editor.undo()
  rebuild()
}
function redoScene(): void {
  editor.redo()
  rebuild()
}
bindAction('undo', undoScene)
bindAction('redo', redoScene)
for (const [id, kind] of [
  ['add-solid', 'solid'],
  ['add-box', 'box'],
  ['add-group', 'group'],
] as const) {
  bindAction(id, () =>
    action(() => {
      selectedId = editor.add(kind)
      if (worldStream && editor.document.cursorOnGround) {
        const entity = editor.entity(selectedId)
        editor.update(selectedId, { groundOffset: kind === 'group' ? 0 : entity.size[1] / 2 })
      }
      setAddMenu(false)
      rebuild()
    }),
  )
}
const catalogAnchor = document.getElementById('add-box')
if (catalogAnchor)
  for (const entry of [...entityCatalog].reverse()) {
    const button = document.createElement('button')
    button.id = `add-${entry.id}`
    button.textContent = entry.label
    catalogAnchor.after(button)
  }
for (const entry of entityCatalog) {
  bindAction(`add-${entry.id}`, () =>
    action(() => {
      const ground = new THREE.Vector3(...(editor.document.cursor ?? [0, 0, 0]))
      const terrain = worldStream?.groundHeight(ground.toArray())
      const onSurface =
        !!worldStream &&
        (editor.document.cursorOnGround || terrain === undefined || ground.y <= terrain + 0.05)
      if (onSurface && terrain !== undefined) ground.y = terrain
      const entities = createCatalogEntities(entry.id, randomUUID(), ground.toArray())
      if (onSurface) entities[0].groundOffset = entry.clearance
      const doc = editor.document
      doc.entities.push(...entities)
      editor.load(doc)
      selectedId = entities[0].id
      setAddMenu(false)
      rebuild()
      view.ready.then(focusSelection).catch(() => undefined)
      toast(`${entry.label} añadido · G mover · R girar`)
    }),
  )
}
function focusSelection(): void {
  if (sim) return
  const object = view.objects.get(selectedId)
  if (!object) return
  const bounds = new THREE.Box3().setFromObject(object)
  if (bounds.isEmpty()) return
  const centre = bounds.getCenter(new THREE.Vector3())
  const extent = bounds.getSize(new THREE.Vector3()).length()
  orbit.target.copy(centre)
  camera.position
    .copy(centre)
    .add(new THREE.Vector3(1, 0.6, 1.1).normalize().multiplyScalar(Math.max(4, extent * 1.3)))
  orbit.update()
}
bindAction('focus', focusSelection)
bindAction('sample-assets', () =>
  action(() => {
    project = retainLocation(project!, editor.document)
    const sample = parseScene(createSampleScene())
    project = visitLocation(project, sample)
    editor.load(sample)
    selectedId = 'car-a'
    rebuild()
    view.ready.then(focusSelection).catch(() => undefined)
    toast('A3 y container listos. Puedes deshacer para volver a tu escena.')
  }),
)
bindAction('add-sprite', () =>
  action(() => {
    const doc = editor.document
    const sprite = createEntity(randomUUID(), 'group', doc.cursor ?? [0, 0, 0])
    sprite.name = 'Sprite · árbol'
    sprite.size = [7, 7, 0.1]
    sprite.sprite = treeSprite(0)
    if (worldStream && doc.cursorOnGround) sprite.groundOffset = 0
    doc.entities.push(sprite)
    editor.load(doc)
    selectedId = sprite.id
    rebuild()
  }),
)
bindAction('sample-gallery', () =>
  action(() => {
    const doc = editor.document
    const entities = createGallery(randomUUID())
    for (const e of entities)
      if (!e.parentId)
        e.transform.position = e.transform.position.map(
          (v, i) => v + (doc.cursor?.[i] ?? 0),
        ) as Vec3Tuple
    doc.entities.push(...entities)
    editor.load(doc)
    selectedId = entities[0].id
    rebuild()
    toast('Galería añadida · dispara por la ventana · N reinicia la ronda')
  }),
)
bindAction('sample-portals', () =>
  action(() => {
    const next = editor.document
    const id = randomUUID()
    const portal = createPortal(id, next.cursor ?? [0, 0, 0])
    if (worldStream && next.cursorOnGround) portal.groundOffset = 0
    next.entities.push(portal)
    editor.load(next)
    project = retainLocation(project!, editor.document)
    selectedId = id
    setAddMenu(false)
    rebuild()
    view.ready.then(focusSelection).catch(() => undefined)
    toast('Portal colocado en el cursor 3D · dale un nombre y elige su destino.')
  }),
)
async function loadIrun(_combined = false): Promise<void> {
  if (sim || loadingWorld) return
  $<HTMLSelectElement>('travel-city').value = '43.32969,-1.819606'
  $<HTMLInputElement>('travel-latitude').value = '43.32969'
  $<HTMLInputElement>('travel-longitude').value = '-1.819606'
  await travelTo()
}
let travelController: AbortController | null = null
$('travel-city').onchange = () => {
  const city = $<HTMLSelectElement>('travel-city').value
  if (!city) return
  const [latitude, longitude] = city.split(',')
  $<HTMLInputElement>('travel-latitude').value = latitude
  $<HTMLInputElement>('travel-longitude').value = longitude
}
for (const id of ['travel-latitude', 'travel-longitude']) {
  $<HTMLInputElement>(id).value = String(
    id === 'travel-latitude'
      ? (editor.document.geography?.latitude ?? 40.4168)
      : (editor.document.geography?.longitude ?? -3.7038),
  )
  $(id).addEventListener('input', () => {
    $<HTMLSelectElement>('travel-city').value = ''
  })
}
bindAction('travel-cancel', () => travelController?.abort())
$('travel-form').onsubmit = (event) => {
  event.preventDefault()
  void travelTo()
}
async function travelTo(): Promise<void> {
  if (loadingWorld) return
  const latitude = $<HTMLInputElement>('travel-latitude').valueAsNumber
  const longitude = $<HTMLInputElement>('travel-longitude').valueAsNumber
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 85 ||
    Math.abs(longitude) > 180
  ) {
    $('travel-status').textContent = 'Introduce coordenadas válidas (latitud entre −85 y 85).'
    toast($('travel-status').textContent!)
    return
  }
  const city = $<HTMLSelectElement>('travel-city')
  const name = city.value
    ? city.selectedOptions[0].textContent!
    : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
  if (sim) await togglePlay()
  loadingWorld = true
  refreshUi()
  const controller = new AbortController()
  travelController = controller
  for (const id of ['save', 'export', 'play', 'travel-go']) $<HTMLButtonElement>(id).disabled = true
  $('travel-cancel').hidden = false
  $('world-loading').hidden = false
  const message = `Cargando ${name} · terreno y edificios. Una zona nueva puede tardar varios minutos; los fallos temporales se reintentan…`
  $('world-loading').textContent = message
  $('travel-status').textContent = message
  try {
    project = retainLocation(project!, editor.document)
    const nextProject = travelPlanet(project!, latitude, longitude, name)
    const next = nextProject.locations.find((p) => p.id === nextProject.activeLocation)!.scene
    if (controller.signal.aborted) return
    await writeScene(PROJECT_KEY, JSON.stringify(nextProject))
    project = nextProject
    $('travel-cancel').hidden = true
    editor.load(next)
    for (const e of next.entities) if (e.kind === 'group') collapsed.add(e.id)
    if (!next.entities.some((e) => e.id === selectedId)) selectedId = next.entities[0].id
    rebuild()
    $('welcome').hidden = true
    await view.ready
    focusCursor(true)
    renderer.domElement.dataset.world = 'destination'
    $('travel-status').textContent = `${name} · mismo planeta. Tus objetos conservan su ubicación.`
    toast(`${name} · destino cargado`)
    $('travel-menu').hidePopover()
    void placeNewWorldObjects()
  } catch (error) {
    const message = controller.signal.aborted
      ? 'Viaje cancelado. Se conserva la escena anterior.'
      : `No se pudo cargar el destino: ${error instanceof Error ? error.message : String(error)}. Se conserva la escena anterior; puedes reintentar.`
    $('travel-status').textContent = message
    toast(message)
  } finally {
    travelController = null
    loadingWorld = false
    refreshUi()
    for (const id of ['save', 'export', 'play', 'travel-go'])
      $<HTMLButtonElement>(id).disabled = false
    $('travel-cancel').hidden = true
    $('world-loading').hidden = true
  }
}
bindAction('world-irun', () => void loadIrun())
$('world-irun-official').hidden = true

bindAction('welcome-close', () => {
  $('welcome').hidden = true
})
bindAction('new-planet', async () => {
  await startupDone
  if (loadingWorld || playTransition) return
  if (
    !confirm(
      '¿Empezar un planeta nuevo? Se conservará una copia de seguridad del planeta actual en este navegador. Para conservar un archivo, usa Guardar como antes de continuar.',
    )
  )
    return
  if (sim) await togglePlay()
  try {
    const backup = retainLocation(project!, editor.document)
    await writeScene(PROJECT_KEY + '.backup.' + Date.now(), JSON.stringify(backup))
    const fresh = createProject(
      parseScene(
        createPlanetScene({ latitude: 42.3601, longitude: -71.0589, altitude: 0 }, 'Boston'),
      ),
    )
    await writeScene(PROJECT_KEY, JSON.stringify(fresh))
    const url = new URL(location.href)
    for (const key of ['lat', 'lon', 'latitude', 'longitude', 'alt', 'play', 'scene', 'world'])
      url.searchParams.delete(key)
    location.assign(url.href)
  } catch (error) {
    toast(`No se pudo crear el planeta: ${String(error)}`)
  }
})
bindAction('save', async () => {
  const snapshot = editor.serialize()
  try {
    await writeScene(STORAGE_KEY, snapshot)
    project = retainLocation(project!, editor.document)
    const metadataSnapshot = JSON.stringify(project.editorState)
    await writeScene(PROJECT_KEY, JSON.stringify(project))
    editorMetadataDirty = JSON.stringify(project.editorState) !== metadataSnapshot
    savedDocument = snapshot
    $('status').textContent = 'Guardado local'
    toast('Planeta guardado en este navegador')
  } catch (error) {
    toast(error instanceof Error ? error.message : 'No se pudo guardar; puedes exportar la escena')
  }
})
bindAction('export', () => {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(retainLocation(project!, editor.document))], {
      type: 'application/json',
    }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = projectFilename(project!.name)
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})
bindAction('import', () => $<HTMLInputElement>('file').click())
$('file').onchange = async () => {
  await startupDone
  const file = $<HTMLInputElement>('file').files?.[0]
  if (!file || loadingWorld || playTransition) return
  if (file.size > 40_000_000) {
    toast('La escena supera el límite de 40 MB')
    return
  }
  if (sim) await togglePlay()
  loadingWorld = true
  refreshUi()
  try {
    const raw = JSON.parse(await file.text())
    const opened =
      raw?.format === 'nabla-project'
        ? parseProject(raw, performanceSettings.preset === 'ultra')
        : createProject(parseScene(raw))
    const scene = opened.locations.find((p) => p.id === opened.activeLocation)!.scene
    editor = new SceneEditor(scene, performanceSettings.preset === 'ultra')
    project = opened
    savedDocument = editor.serialize()
    editorMetadataDirty = false
    $('welcome').hidden = true
    rebuild()
    focusCursor(true)
    toast('Escena abierta')
  } catch {
    toast('Archivo no válido. La escena actual se conserva.')
  }
  loadingWorld = false
  refreshUi()
  $<HTMLInputElement>('file').value = ''
}
/** Loading a scene stays nonblocking; each new terrain result retries its pending placements. */
function placeNewWorldObjects(): void {
  groundPlacementDirty = true
}
function settlePendingGround(): void {
  if (!worldStream || sim || startupPending || loadingWorld || !groundPlacementDirty) return
  groundPlacementDirty = false
  const doc = editor.document
  const cursor = doc.cursor ?? [0, 0, 0]
  const followCursor =
    doc.cursorOnGround &&
    Math.hypot(orbit.target.x - cursor[0], orbit.target.z - cursor[2]) < 50 &&
    Math.abs(orbit.target.y - cursor[1]) < 10
  const previousTarget = followCursor
    ? cursor[1]
    : doc.entities.find((e) => e.id === selectedId)?.transform.position[1]
  if (!settleGroundPlacement(doc, (p) => worldStream!.groundHeight(p))) return
  editor.load(doc)
  rebuild()
  groundPlacementDirty = false
  const nextTarget = followCursor
    ? doc.cursor?.[1]
    : doc.entities.find((e) => e.id === selectedId)?.transform.position[1]
  if (previousTarget !== undefined && nextTarget !== undefined) {
    const delta = nextTarget - previousTarget
    camera.position.y += delta
    orbit.target.y += delta
    orbit.update()
  }
}
let playTransition = false
async function togglePlay(startFlight = false): Promise<void> {
  if (loadingWorld || playTransition) return
  playTransition = true
  const button = $<HTMLButtonElement>('play')
  button.disabled = true
  button.textContent = sim ? 'Saliendo…' : 'Loading…'
  button.setAttribute('aria-busy', 'true')
  commands.notify()
  try {
    // Yield through a paint before constructing or disposing the synchronous simulation.
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    if (!sim && worldStream) {
      const spawn = editor.document.entities.find((e) => e.kind === 'spawn')!
      const car = startFlight
        ? editor.document.entities.find((e) => e.kind === 'vehicle' && !e.vehicle?.flight)
        : undefined
      await worldStream.ensureGround(
        car
          ? SceneGraph.fromValidated(editor.document).worldTransform(car.id).position
          : spawn.transform.position,
      )
      const adjusted = editor.document
      for (const e of adjusted.entities)
        if (e.kind === 'vehicle' || e.kind === 'spawn') {
          const ground = worldStream.groundHeight(e.transform.position)
          if (ground !== undefined) {
            const ride = playGroundClearance(e)
            e.transform.position[1] = Math.max(e.transform.position[1], ground + ride)
          }
        }
      editor.load(adjusted)
    }
    await togglePlayNow(startFlight)
    if (sim && worldStream) {
      worldStream.renderUpdate(renderOrigin, !!performanceSettings.buildings, sim)
      while (!sim.preparePlanetCollisions())
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
  } catch (error) {
    toast(String(error))
  } finally {
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    playTransition = false
    button.disabled = loadingWorld
    button.removeAttribute('aria-busy')
    button.innerHTML = sim ? '■ Detener <kbd>F8</kbd>' : '▶ Jugar <kbd>F8</kbd>'
    commands.notify()
  }
}
async function togglePlayNow(startFlight = false): Promise<void> {
  game.releaseInput()
  if (sim) {
    game.stop()
    sim = null
    view.setPlaying(false)
    renderer.domElement.dataset.impacts = '0'
    renderer.domElement.dataset.vehicle = ''
    document.exitPointerLock()
    camera.up.set(0, 1, 0)
    document.querySelector('.caption-tag')!.textContent = 'PERSPECTIVA'
    camera.fov = 48
    camera.updateProjectionMatrix()
    camera.position.copy(orbitStartPosition)
    orbit.target.copy(orbitStartTarget)
    orbit.enabled = true
    if (wheelDebug.isEnabled) wheelDebug.toggle()
    $('wheel-debug-hud').hidden = true
    rebuild()
  } else {
    orbitStartPosition = camera.position.clone()
    orbitStartTarget = orbit.target.clone()
    project = retainLocation(project!, editor.document)
    portalControls.rebuild(editor.document)
    const entry = startFlight ? flightEntry(editor.document) : null
    sim = await game.play(entry?.scene ?? editor.document, {
      playerMode: 'hover',
      planetaryTerrain: !!editor.document.geography?.planetary,
      experimentalLargeScene: performanceSettings.preset === 'ultra',
      mapBuildingsEnabled: true,
    })
    sim.setMapBuildingsEnabled(true)
    sim.setCollisionDistance(performanceSettings.collisions)
    firstPerson = true
    fireRequested = false
    weaponDrawn = false
    sidearm.reset()
    gallery.reset()
    drivingTelemetry.update(null, 0, 0, 0, true)
    delete renderer.domElement.dataset.portalCrossings
    vehicleEntrance = null
    cameraMode = entry ? 'cockpit' : 'chase'
    if (entry) {
      sim.startInVehicle(entry.vehicleId)
      sim.toggleFlight()
    }
    const spawn = editor.document.entities.find((e) => e.kind === 'spawn')!
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
      new THREE.Quaternion(...spawn.transform.rotation),
    )
    yaw = Math.atan2(-forward.x, -forward.z)
    pitch = 0.24
    orbit.enabled = false
    gizmo.detach()
    view.setPlaying(true)
    refreshUi()
  }
  document.body.classList.toggle('playing', !!sim)
  if (!playTransition)
    $('play').innerHTML = sim ? '■ Detener <kbd>F8</kbd>' : '▶ Jugar <kbd>F8</kbd>'
  $('mode-label').textContent = sim ? 'Jugando' : 'Edición'
  $('game-hud').hidden = !sim
  $('view-hint').textContent = sim
    ? 'Clic para mirar con el ratón · E entrar / salir · Tab sacar / guardar arma · F8 detener'
    : 'Arrastra para orbitar · Rueda para acercar · Clic para seleccionar'
  $('footer-mode').textContent = sim
    ? 'Simulación compartida · 60 Hz'
    : 'Edición · metros · Y arriba'
  grid.visible =
    !sim &&
    !editor.document.geography?.planetary &&
    !editor.document.entities.some((e) => e.terrain)
  outline.visible = !sim
}
for (const [id, key] of [
  ['map-buildings', 'buildings'],
  ['draw-distance', 'distance'],
  ['fog-distance', 'fog'],
  ['relief-span', 'relief'],
  ['road-distance', 'roads'],
  ['collision-distance', 'collisions'],
  ['render-resolution', 'resolution'],
  ['shadow-quality', 'shadows'],
  ['vehicle-shadows', 'vehicleShadows'],
  ['mirror-quality', 'mirrors'],
] as const) {
  const control = $<HTMLSelectElement>(id)
  control.value = String(performanceSettings[key])
  control.onchange = () => {
    performanceSettings[key] = Number(control.value)
    performanceSettings.preset = 'custom'
    editor.experimentalLargeScene = false
    $<HTMLSelectElement>('performance-preset').value = 'custom'
    const budget = streamBudget(performanceSettings)
    worldStream?.setQuality(budget.concurrent, budget.ahead, budget.retain, budget.tiles)
    try {
      localStorage.setItem('nabla.performance.v1', JSON.stringify(performanceSettings))
    } catch {
      /* Current session remains usable. */
    }
    worldStream?.setDistance(performanceSettings.distance)
    worldStream?.setRelief(performanceSettings.relief)
    if (worldStream)
      $('world-note').textContent =
        `${editor.document.name} · OSM + ESRI · Vista ≈ ${performanceSettings.distance / 1000} km`
    sim?.setMapBuildingsEnabled(true)
    sim?.setCollisionDistance(performanceSettings.collisions)
    renderer.setPixelRatio(Math.min(devicePixelRatio, performanceSettings.resolution))
    renderer.setSize(viewport.clientWidth, viewport.clientHeight)
    renderer.shadowMap.enabled = performanceSettings.shadows > 0
    if (id === 'map-buildings')
      $<HTMLInputElement>('layer-buildings').checked = control.value !== '0'
    shadowManager.reconfigure(
      performanceSettings.shadows,
      camera,
      scene,
      sunDirection,
      sun.intensity,
    )
    needsRender = true
  }
}
function setWaterLevel(value: number, persist = true): void {
  if (!Number.isFinite(value)) return
  waterMode = 'manual'
  $<HTMLSelectElement>('water-mode').value = waterMode
  $('tide-status').textContent = 'Nivel manual'
  waterLevel = Math.round(Math.max(-5, Math.min(50, value)) * 10) / 10
  ocean.setLevel(waterLevel)
  sim?.setWaterLevel(waterLevel)
  $<HTMLInputElement>('water-level').value = String(waterLevel)
  $<HTMLInputElement>('water-level-number').value = String(waterLevel)
  renderer.domElement.dataset.waterLevel = String(waterLevel)
  needsRender = true
  if (persist) saveWater()
}
$<HTMLInputElement>('water-level').oninput = (event) =>
  setWaterLevel((event.target as HTMLInputElement).valueAsNumber, false)
$<HTMLInputElement>('water-level-number').oninput = (event) =>
  setWaterLevel((event.target as HTMLInputElement).valueAsNumber, false)
bindAction('water-level-reset', () => setWaterLevel(0))
$('water-mode').onchange = () => {
  waterMode = $<HTMLSelectElement>('water-mode').value as typeof waterMode
  if (waterMode === 'manual') setWaterLevel(waterLevel, false)
  saveWater()
  nextTideReadout = 0
  needsRender = true
}
$<HTMLInputElement>('tide-amplitude').oninput = (event) => {
  const value = (event.target as HTMLInputElement).valueAsNumber
  if (Number.isFinite(value)) tideAmplitude = Math.max(0, Math.min(3, value))
  nextTideReadout = 0
}
function saveWater(): void {
  editor.load({
    ...editor.document,
    water: { mode: waterMode, level: waterLevel, amplitude: tideAmplitude },
  })
  refreshUi()
}
for (const id of ['water-level', 'water-level-number', 'tide-amplitude'])
  $(id).onchange = () => action(saveWater)
function updateTide(now: number): void {
  if (waterMode !== 'tide') return
  const tide = simplifiedTide(skyTime(skyClock).getTime(), tideAmplitude)
  waterLevel = tide.level
  ocean.setLevel(waterLevel)
  if (now >= nextTideReadout) {
    nextTideReadout = now + 500
    const value = String(Number(waterLevel.toFixed(2)))
    $<HTMLInputElement>('water-level').value = value
    $<HTMLInputElement>('water-level-number').value = value
    $('tide-status').textContent =
      `${tide.state} · ${waterLevel.toFixed(2)} m · ±${tideAmplitude.toFixed(1)} m${skyClock.mode === 'fixed' ? ' · hora fija' : ''}`
    renderer.domElement.dataset.waterLevel = value
  }
}

$('tile-debug').onchange = () => {
  needsRender = true
}
$('tile-debug-labels').onchange = () => {
  needsRender = true
}
$('stream-mode').onchange = () => {
  streamMode = $<HTMLSelectElement>('stream-mode').value as typeof streamMode
  worldStream?.setStreamMode(streamMode)
  streamSample = null
  needsRender = true
  if (streamMode === 'model')
    toast('Maqueta: física pausada. Vuelve a conducción o vuelo para reanudar.')
}
$('performance-hud-toggle').onchange = () => {
  performanceHud.hidden = !$<HTMLInputElement>('performance-hud-toggle').checked
  needsRender = true
}
bindAction('performance-reset', () => performanceMonitor.reset())
bindAction('performance-export', () => {
  const url = URL.createObjectURL(new Blob([performanceMonitor.csv()], { type: 'text/csv' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'nabla-performance.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})
const dofControl = $<HTMLSelectElement>('depth-of-field')
dofControl.value = String(performanceSettings.dof)
dofControl.onchange = () => {
  performanceSettings.dof = Number(dofControl.value)
  if (!performanceSettings.dof) depthOfField.release()
  try {
    localStorage.setItem('nabla.performance.v1', JSON.stringify(performanceSettings))
  } catch {
    /* Current session remains usable. */
  }
  needsRender = true
}
$<HTMLSelectElement>('performance-preset').value = performanceSettings.preset
const optionTabs = [
  ['options-tab-layers', 'options-panel-layers'],
  ['options-tab-drape', 'options-panel-drape'],
  ['options-tab-performance', 'options-panel-performance'],
  ['options-tab-sky', 'options-panel-sky'],
  ['options-tab-place', 'options-panel-place'],
] as const
function showOptionsPanel(panelId: string) {
  for (const [tab, panel] of optionTabs) {
    const on = panel === panelId
    $(panel).hidden = !on
    $(tab).setAttribute('aria-selected', String(on))
  }
}
for (const [tab, panel] of optionTabs) bindAction(tab, () => showOptionsPanel(panel))
function sceneLayer(id: string) {
  return $<HTMLInputElement>(id).checked
}
function applySceneLayers() {
  const sky = sceneLayer('layer-sky')
  const sunOn = sceneLayer('layer-sun')
  const planets = sceneLayer('layer-planets')
  geography.setLayers({ sky, planets, sun: sunOn, clouds: sceneLayer('layer-clouds') })
  geography.tiles.visible = sceneLayer('layer-maps')
  if (!sky) scene.fog = null
  if (!sunOn) {
    sun.intensity = 0
    sun.visible = false
    ambientFill.intensity = 0
    for (const light of shadowManager.lights) light.visible = false
  }
  seaRoot.visible = !!view.document.geography && sceneLayer('layer-sea')
  fieldLayers.lamps = lampLook.armed && lampLook.level > 0
  worldStream?.applyViewLayers({
    glb: true,
    relief: sceneLayer('layer-relief'),
    photo14: sceneLayer('layer-z14'),
    photo12: sceneLayer('layer-z12'),
    trees: sceneLayer('layer-trees'),
    terrain: sceneLayer('layer-terrain'),
    buildings: sceneLayer('layer-buildings'),
  })
  view.root.visible = sceneLayer('layer-entities')
  fieldLights.root.visible =
    sceneLayer('layer-entities') || (lampLook.armed && lampLook.level > 0) || fieldLayers.navigation
  if (!sceneLayer('layer-grid')) grid.visible = false
}
$<HTMLSelectElement>('cloud-style').value =
  localStorage.getItem('nabla.cloud-style') === 'low' ? 'low' : 'artistic'
geography.setCloudStyle(readCloudStyle())
$('cloud-style').onchange = () => {
  const style = readCloudStyle()
  localStorage.setItem('nabla.cloud-style', style)
  geography.setCloudStyle(style)
  syncCloudWeatherEnabled()
  needsRender = true
}
bindCloudWeather()
bindMoonSize()
syncCloudWeatherEnabled()
for (const box of document.querySelectorAll<HTMLInputElement>(
  '#options-panel-layers input[type=checkbox], #layer-clouds',
))
  box.onchange = () => {
    needsRender = true
  }
const buildingsLayer = $<HTMLInputElement>('layer-buildings')
buildingsLayer.checked = $<HTMLSelectElement>('map-buildings').value !== '0'
buildingsLayer.onchange = () => {
  const select = $<HTMLSelectElement>('map-buildings')
  const next = buildingsLayer.checked ? '1' : '0'
  if (select.value !== next) {
    select.value = next
    select.dispatchEvent(new Event('change'))
  }
  needsRender = true
}
function bindLampSlider(id: 'lamp-level' | 'lamp-reach', key: 'level' | 'reach', fallback: number) {
  const input = $<HTMLInputElement>(id)
  const stored = localStorage.getItem('nabla.' + id)
  const value = stored == null || stored === '' ? fallback : Number(stored)
  input.value = String(Number.isFinite(value) ? value : fallback)
  lampLook[key] = Number(input.value)
  input.oninput = () => {
    lampLook[key] = Number(input.value)
    localStorage.setItem('nabla.' + id, input.value)
    needsRender = true
  }
}
bindLampSlider('lamp-level', 'level', 10)
bindLampSlider('lamp-reach', 'reach', 28)
const lampToggle = $<HTMLInputElement>('layer-lamps')
lampToggle.checked = localStorage.getItem('nabla.layer-lamps') !== '0'
lampLook.armed = lampToggle.checked
$<HTMLInputElement>('lamp-level').disabled = !lampToggle.checked
$<HTMLInputElement>('lamp-reach').disabled = !lampToggle.checked
lampToggle.onchange = () => {
  lampLook.armed = lampToggle.checked
  localStorage.setItem('nabla.layer-lamps', lampToggle.checked ? '1' : '0')
  $<HTMLInputElement>('lamp-level').disabled = !lampToggle.checked
  $<HTMLInputElement>('lamp-reach').disabled = !lampToggle.checked
  needsRender = true
}
for (const [id, on] of [
  ['layers-all', true],
  ['layers-none', false],
] as const)
  bindAction(id, () => {
    for (const box of document.querySelectorAll<HTMLInputElement>(
      '#models input[type=checkbox], #tiles input[type=checkbox], #planet-layers input[type=checkbox], #interface-layers input[type=checkbox], #layer-clouds',
    ))
      box.checked = on
    lampLook.armed = on
    localStorage.setItem('nabla.layer-lamps', on ? '1' : '0')
    $<HTMLInputElement>('lamp-level').disabled = !on
    $<HTMLInputElement>('lamp-reach').disabled = !on
    const level = $<HTMLInputElement>('lamp-level')
    level.value = on ? '10' : '0'
    level.dispatchEvent(new Event('input'))
    const buildings = $<HTMLSelectElement>('map-buildings')
    const wanted = on ? '1' : '0'
    if (buildings.value !== wanted) {
      buildings.value = wanted
      buildings.dispatchEvent(new Event('change'))
    }
    needsRender = true
  })
for (const box of document.querySelectorAll<HTMLInputElement>('#drape-layers input')) {
  const id = box.dataset.drape ?? ''
  box.checked = projectedLayers.has(id)
  box.onchange = () => {
    if (box.checked) projectedLayers.add(id)
    else projectedLayers.delete(id)
    worldStream?.applyProjection()
  }
}
for (const box of document.querySelectorAll<HTMLInputElement>('#light-layers input')) {
  const key = box.dataset.field as 'lamps' | 'navigation'
  box.checked = fieldLayers[key]
  box.onchange = () => {
    fieldFollow = false
    fieldLayers[key] = box.checked
  }
}
$('performance-preset').onchange = async () => {
  const id = $<HTMLSelectElement>('performance-preset').value as keyof typeof performancePresets
  const preset = performancePresets[id]
  if (!preset) return
  Object.assign(performanceSettings, preset.settings)
  dofControl.value = String(performanceSettings.dof)
  if (!performanceSettings.dof) depthOfField.release()
  for (const [control, key] of [
    ['map-buildings', 'buildings'],
    ['draw-distance', 'distance'],
    ['fog-distance', 'fog'],
    ['relief-span', 'relief'],
    ['road-distance', 'roads'],
    ['collision-distance', 'collisions'],
    ['render-resolution', 'resolution'],
    ['shadow-quality', 'shadows'],
    ['vehicle-shadows', 'vehicleShadows'],
    ['mirror-quality', 'mirrors'],
  ] as const)
    $<HTMLSelectElement>(control).value = String(performanceSettings[key])
  $<HTMLInputElement>('layer-buildings').checked = performanceSettings.buildings > 0
  $('draw-distance').dispatchEvent(new Event('change'))
  performanceSettings.preset = id
  editor.experimentalLargeScene = id === 'ultra'
  $<HTMLSelectElement>('performance-preset').value = id
  try {
    localStorage.setItem('nabla.performance.v1', JSON.stringify(performanceSettings))
  } catch {
    /* Optional persistence. */
  }
  worldStream?.setQuality(preset.concurrent, preset.ahead, id === 'ultra', preset.tiles)
  try {
    await setMapCacheBudget(Math.max(preset.cache, (await mapCacheStats()).budget / 1_000_000))
    await refreshMapCacheUi()
  } catch {
    toast('Calidad aplicada; caché no disponible')
  }
}
const tabbedSections = new Set([
  'drape-section',
  'performance-section',
  'sky-section',
  'geography-section',
])
for (const section of document.querySelectorAll<HTMLDetailsElement>('.app-menu details')) {
  if (tabbedSections.has(section.id)) {
    section.open = true
    continue
  }
  try {
    section.open = localStorage.getItem(`nabla.panel.${section.id}`) === 'open'
  } catch {
    /* Closed defaults. */
  }
  section.addEventListener('toggle', () => {
    try {
      localStorage.setItem(`nabla.panel.${section.id}`, section.open ? 'open' : 'closed')
    } catch {
      /* Optional preference. */
    }
  })
}
for (const menu of document.querySelectorAll<HTMLElement>('.app-menu')) {
  menu.addEventListener('beforetoggle', () => {
    game.releaseInput()
    sim?.setInput(idleInput())
    if (document.pointerLockElement) document.exitPointerLock()
  })
}
$('file-menu').addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('button')) $('file-menu').hidePopover()
})
bindAction('play', () => void togglePlay())
remotePortalViews = new RemotePortalViews(
  () => {
    needsRender = true
  },
  toast,
  (doc) => new SceneView(doc),
)
const portalControls = new PortalControls(viewport, toast)
portalControls.onShipSwitch = (id, kind) => view.pressShipSwitch(id, kind)
portalControls.projectRegistry = {
  entries: () => projectPortalEntries().filter((p) => p.locationId !== project!.activeLocation),
  selected: (id) =>
    project!.connections?.find((c) => c.source === registrySource(id)?.id)?.destination,
  configure: configureProjectPortal,
  status: (id) => {
    const connection = project!.connections?.find((c) => c.source === registrySource(id)?.id)
    return connection
      ? `${connection.mode === 'window' ? 'Ventana remota' : 'Cerrado'} · ${projectPortalEntries().find((p) => p.id === connection.destination)?.name ?? ''}`
      : undefined
  },
}
portalControls.rebuild(editor.document)
const gallery = new Gallery(viewport)
const sidearm = new Sidearm(viewport)
const wheelDebug = new WheelDebugOverlay()
scene.add(wheelDebug.root)
const raycaster = new THREE.Raycaster()
let down = new THREE.Vector2()
function pressShipSwitch(e: PointerEvent): boolean {
  if (document.pointerLockElement) return false
  const bounds = renderer.domElement.getBoundingClientRect()
  const pickCamera = camera.clone()
  pickCamera.position.sub(renderOrigin)
  pickCamera.updateMatrixWorld(true)
  raycaster.setFromCamera(
    new THREE.Vector2(
      ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(e.clientY - bounds.top) / bounds.height) * 2 + 1,
    ),
    pickCamera,
  )
  for (const hit of raycaster.intersectObjects([...view.objects.values()], true)) {
    let node: THREE.Object3D | null = hit.object
    let kind = node.userData.shipSwitch as string | undefined
    let id: string | undefined
    while (node) {
      kind ??= node.userData.shipSwitch as string | undefined
      id ??= node.userData.entityId as string | undefined
      node = node.parent
    }
    if (kind && id) {
      view.pressShipSwitch(id, kind as 'nav' | 'beacon' | 'spots' | 'cabin' | 'shutters')
      return true
    }
  }
  return false
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  down.set(e.clientX, e.clientY)
  if (
    e.button === 0 &&
    sim &&
    !sim.player.vehicleId &&
    weaponDrawn &&
    document.pointerLockElement === renderer.domElement
  )
    fireRequested = true
})
renderer.domElement.addEventListener('pointerup', (e) => {
  const click =
    e.button === 0 &&
    !dragging &&
    !gizmo.axis &&
    down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) <= 4
  if (click && pressShipSwitch(e)) return
  if (sim) {
    if (e.pointerType === 'touch') return
    renderer.domElement
      .requestPointerLock()
      ?.catch(() => toast('No se pudo capturar el ratón. Puedes seguir jugando con el teclado.'))
    return
  }
  if (!click) return
  const bounds = renderer.domElement.getBoundingClientRect()
  // The camera is restored to world coordinates after rendering, while scene roots
  // remain relative to the floating origin. Pick in the same frame as those roots.
  const pickCamera = camera.clone()
  pickCamera.position.sub(renderOrigin)
  pickCamera.updateMatrixWorld(true)
  raycaster.setFromCamera(
    new THREE.Vector2(
      ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(e.clientY - bounds.top) / bounds.height) * 2 + 1,
    ),
    pickCamera,
  )
  if (e.shiftKey || cursorTool.value) {
    const hit = raycaster.intersectObjects(
      [...view.objects.values(), ...(worldStream ? [worldStream.root] : [])],
      true,
    )[0]
    const point =
      hit?.point ??
      raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), renderOrigin.y),
        new THREE.Vector3(),
      )
    if (point) action(() => placeCursor(point.add(renderOrigin).toArray()))
    return
  }
  if (solidEditor.active) {
    solidEditor.click(
      raycaster,
      editor.document.entities.find((e) => e.id === selectedId)!,
      view.objects.get(selectedId)!,
    )
    needsRender = true
    return
  }
  const hits = raycaster.intersectObjects([...view.objects.values()], true).filter((hit) => {
    for (let node: THREE.Object3D | null = hit.object; node; node = node.parent)
      if (!node.visible) return false
    return true
  })
  if (worldStream?.inspect(raycaster, $('properties-extras'), hits[0]?.distance)) {
    mapInspection = true
    gizmo.detach()
    needsRender = true
    inspector.value = []
    return
  }
  for (const hit of hits) {
    let object: THREE.Object3D | null = hit.object
    while (object && !object.userData.entityId) object = object.parent
    if (object) {
      select(object.userData.entityId as string)
      break
    }
  }
})
renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    if (!sim?.player.vehicleId || cameraMode !== 'map') return
    e.preventDefault()
    mapZoom = THREE.MathUtils.clamp(mapZoom * Math.exp(e.deltaY * 0.001), 0.75, 3)
  },
  { passive: false },
)
document.addEventListener('mousemove', (e) => {
  if (
    sim &&
    !(cameraMode === 'map' && sim.player.vehicleId) &&
    document.pointerLockElement === renderer.domElement
  ) {
    lastLookTime = performance.now()
    if (cameraMode === 'cockpit' && sim.player.vehicleId) {
      headYaw -= e.movementX * 0.0025
      headPitch = THREE.MathUtils.clamp(headPitch + e.movementY * 0.002, -1.45, 1.45)
    } else {
      yaw -= e.movementX * 0.0025
      pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.002, -1.45, 1.45)
    }
  }
})
window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || !studioInput.acceptsInput) return
  if (document.querySelector('.app-menu:popover-open, dialog[open]')) return
  if ((e.target as HTMLElement)?.matches('input,select,textarea,[contenteditable]')) return
  const menuVehicle = sim?.player.vehicleId
  if (menuVehicle && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const result = vehicleMenuKey(
      view,
      editor.document,
      menuVehicle,
      e.code,
      e.repeat,
      toast,
      (id, patch) => editor.update(id, patch),
    )
    if (result.handled) {
      e.preventDefault()
      if (result.opened !== undefined) game.releaseInput()
      if (result.opened) cameraMode = 'cockpit'
      return
    }
  }
  if (e.code === 'Tab' && sim) {
    e.preventDefault()
    if (!e.repeat && !sim.player.vehicleId) {
      weaponDrawn = !weaponDrawn
      fireRequested = false
      toast(weaponDrawn ? 'Arma desenfundada' : 'Arma guardada')
    }
    return
  }
  if (e.code === 'F8') {
    e.preventDefault()
    if (!e.repeat) togglePlay()
    return
  }
  if (e.code === 'F9' && sim) {
    e.preventDefault()
    if (!e.repeat) {
      const enabled = wheelDebug.toggle()
      toast(enabled ? 'Debug ruedas ON · verde=física, naranja=visual' : 'Debug ruedas OFF')
    }
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
    e.preventDefault()
    $('save').click()
    return
  }
  if (!sim) {
    if (e.code === 'KeyE' && !e.repeat) {
      toast('Estás en edición: pulsa Jugar (F8), acércate al vehículo y pulsa E')
      return
    }
    if (e.code === 'Escape' && solidEditor.active) {
      solidEditor.close()
      refreshUi()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault()
      if (e.shiftKey) editor.redo()
      else editor.undo()
      rebuild()
    }
    if (['KeyX', 'KeyY', 'KeyZ'].includes(e.code) && !e.ctrlKey && !e.metaKey)
      lockAxis(e.code.slice(-1))
    if (e.code === 'Escape') lockAxis('all')
    if (e.code === 'KeyF') focusSelection()
    if (e.code === 'KeyG') setTool('translate')
    if (e.code === 'KeyR') setTool('rotate')
    return
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault()
  if (e.code === 'PageUp' || e.code === 'PageDown') {
    e.preventDefault()
    if (!e.repeat) toast(gameAction(e.code))
    return
  }
  if (e.code === 'KeyB' && !e.repeat) {
    toast(gameAction('KeyB'))
    return
  }
  if (e.code === 'KeyR' && !e.repeat) {
    if (sim) toast(gameAction('KeyR'))
    return
  }
  if ((e.code === 'Comma' || e.code === 'Period') && !e.repeat && sim?.player.vehicleId) {
    view.signal(sim.player.vehicleId, e.code === 'Comma' ? -1 : 1)
    return
  }
  if (e.code === 'KeyH' && sim.player.vehicleId) {
    e.preventDefault()
    if (!e.repeat) {
      const open = view.toggleVehicleGps(sim.player.vehicleId)
      if (open !== null) toast(open ? 'GPS encendido · desplegando' : 'GPS apagado · recogiendo')
    }
    return
  }
  if (e.code === 'KeyN' && !e.repeat) {
    gallery.reset()
    return
  }
  if (e.code === 'KeyG' && !e.repeat) {
    document.exitPointerLock()
    return
  }
  if (e.code === 'KeyC' && !e.repeat) {
    cycleCamera()
    return
  }
  if (e.code === 'KeyV' && !e.repeat) {
    toast(gameAction('KeyV'))
    return
  }
  if (e.code === 'KeyM' && !e.repeat) {
    toast(gameAction('KeyM'))
    return
  }
  if (e.code === 'KeyF' && !e.repeat) {
    toast(gameAction('KeyF'))
    return
  }
  if (e.code === 'KeyT' && !e.repeat) {
    toast(gameAction('KeyT'))
    cameraMode = 'chase'
    return
  }
  game.keys.press(e.code, e.repeat, performance.now())
  if (e.code === 'Space' && !e.repeat && !sim.player.vehicleId) game.action('Space')
  if (e.code === 'KeyE' && !e.repeat) toast(gameAction('KeyE'))
})
window.addEventListener('keyup', (e) => game.keys.release(e.code), { capture: true })
window.addEventListener('blur', () => {
  game.releaseInput()
  sim?.setInput(idleInput())
})
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement) game.releaseInput()
})
let previousButtons: boolean[] = []
let previousPadIndex: number | null = null
function pollGamepad(): Gamepad | null {
  if (
    !studioInput.acceptsInput ||
    !document.hasFocus() ||
    document.hidden ||
    document.querySelector('.app-menu:popover-open, dialog[open]')
  ) {
    previousButtons = []
    return null
  }
  const pad = availableGamepads().find((p) => p?.connected && p.mapping === 'standard') ?? null
  if (pad?.index !== previousPadIndex) previousButtons = []
  previousPadIndex = pad?.index ?? null
  if (!pad) return null
  const pressed = (i: number) => Boolean(pad.buttons[i]?.pressed && !previousButtons[i])
  if (sim) {
    if (pressed(0)) toast(gameAction('KeyE'))
    if (pressed(1)) {
      cycleCamera()
    }
    if (pressed(2)) toast(gameAction('KeyF'))
    if (pressed(3)) toast(gameAction('KeyV'))
    if (pressed(4)) {
      toast(gameAction('KeyT'))
      cameraMode = 'chase'
    }
  }
  previousButtons = pad.buttons.map((b) => b.pressed)
  return pad
}
function currentInput(pad: Gamepad | null = null, elapsed = 0) {
  pushGameCamera()
  game.keys.expire(performance.now())
  const input = game.readInput(
    elapsed,
    {
      keys,
      yaw,
      pad,
      menuOpen: !!(sim?.player.vehicleId && view.vehicleMenu(sim.player.vehicleId)?.open),
      enabled:
        studioInput.acceptsInput &&
        document.hasFocus() &&
        !document.hidden &&
        !document.querySelector('.app-menu:popover-open, dialog[open]'),
      touch: portalControls.flightInput(),
      driving: touchDriving.input(),
    },
    view.document,
  )
  pullGameCamera()
  return input
}
new ResizeObserver(() => {
  const w = viewport.clientWidth,
    h = viewport.clientHeight
  if (w <= 0 || h <= 0) return
  renderer.setSize(w, h)
  camera.aspect = w / Math.max(h, 1)
  camera.updateProjectionMatrix()
  needsRender = true
}).observe(viewport)
let previous = performance.now()
const frameTimes: number[] = []
let performanceText = ''
let nextPerformanceReadout = 0
renderer.info.autoReset = false
let photoBusy = false
let photoExternalViews = new Map<string, ExternalPortalView>()
bindAction('photo', async () => {
  if (photoBusy || startupPending || loadingWorld || playTransition) return
  photoBusy = true
  const dialog = $<HTMLDialogElement>('photo-progress')
  const controller = new AbortController()
  const cancel = () => controller.abort(new DOMException('Foto cancelada', 'AbortError'))
  const onCancel = (event: Event) => {
    event.preventDefault()
    cancel()
  }
  dialog.addEventListener('cancel', onCancel)
  $('photo-cancel').onclick = cancel
  $<HTMLProgressElement>('photo-bar').value = 0
  $('photo-status').textContent = 'Preparando la imagen…'
  dialog.showModal()
  const photoCamera = camera.clone()
  photoCamera.position.sub(renderOrigin)
  photoCamera.updateMatrixWorld(true)
  const longest = 15360
  const width = Math.round(camera.aspect >= 1 ? longest : longest * camera.aspect)
  const height = Math.round(camera.aspect >= 1 ? longest / camera.aspect : longest)
  const helpers = [grid, outline, worldCursor, gizmo.getHelper()]
  const visible = helpers.map((object) => object.visible)
  helpers.forEach((object) => (object.visible = false))
  const shadows = shadowManager.lights.map((light) => ({
    light,
    size: light.shadow.mapSize.clone(),
  }))
  const shadowsActive = renderer.shadowMap.enabled
  const shadowUpdate = renderer.shadowMap.needsUpdate
  try {
    for (const { light } of shadows) {
      light.shadow.mapSize.set(2048, 2048)
      light.shadow.map?.dispose()
      light.shadow.map = null
    }
    let first = true
    const blob = await capturePng(
      renderer,
      photoCamera,
      (tile) => {
        renderPortals(
          view.portals,
          renderer,
          scene,
          tile,
          (remote) => {
            if (!geography.enabled) return
            const position = remote.position.clone().add(renderOrigin)
            const restore = portalEnvironment(
              geography,
              scene,
              position,
              camera.position,
              renderOrigin,
              skyClock,
              ambientFill,
              [sun, ...shadowManager.lights],
            )
            geography.render(renderer, remote, position)
            renderer.autoClear = false
            return restore
          },
          photoExternalViews,
        )
        renderer.autoClear = true
        if (geography.enabled && (sceneLayer('layer-sky') || sceneLayer('layer-planets'))) {
          geography.render(renderer, tile, camera.position)
          renderer.autoClear = false
          renderer.clearDepth()
        }
        renderer.shadowMap.needsUpdate = first && shadowsActive
        renderer.render(scene, tile)
        if (geography.enabled) geography.renderClouds(renderer, tile)
        first = false
      },
      {
        width,
        height,
        signal: controller.signal,
        progress: (fraction) => {
          $<HTMLProgressElement>('photo-bar').value = fraction
          $('photo-status').textContent = `${width} × ${height} · ${Math.round(fraction * 100)} %`
        },
      },
    )
    const url = URL.createObjectURL(blob),
      link = document.createElement('a')
    link.href = url
    link.download = `nabla-${new Date().toISOString().replace(/[:.]/g, '-')}-${width}x${height}.png`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    toast(`Foto descargada · ${width} × ${height}`)
  } catch (error) {
    toast(
      controller.signal.aborted ? 'Foto cancelada' : `No se pudo guardar la foto: ${String(error)}`,
    )
  } finally {
    for (const { light, size } of shadows) {
      light.shadow.mapSize.copy(size)
      light.shadow.map?.dispose()
      light.shadow.map = null
    }
    renderer.shadowMap.needsUpdate = shadowUpdate || shadowsActive
    helpers.forEach((object, i) => (object.visible = visible[i]))
    dialog.removeEventListener('cancel', onCancel)
    dialog.close()
    photoBusy = false
    previous = performance.now()
    needsRender = true
  }
})

function renderDrone() {
  if (!droneOn || !view.document.geography) return
  const picture = document.querySelector<HTMLCanvasElement>('#studio-map .drone canvas')
  const ctx = picture?.getContext('2d')
  if (!picture || !ctx) return
  const flat = geoToLocal(view.document.geography, {
    latitude: droneLat,
    longitude: droneLon,
    altitude: 0,
  })
  const ground = worldStream?.groundHeight([flat[0], 0, flat[2]])
  const floor = ground !== undefined && Number.isFinite(ground) ? ground : 0
  const eye = new THREE.Vector3(flat[0], floor + 55, flat[2] + 40)
  const look = new THREE.Vector3(flat[0], floor + 4, flat[2])
  droneCamera.position.copy(eye).sub(renderOrigin)
  droneCamera.up.set(0, 1, 0)
  droneCamera.lookAt(look.clone().sub(renderOrigin))
  droneCamera.updateProjectionMatrix()
  const previous = renderer.getRenderTarget()
  const previousClear = renderer.autoClear
  renderer.getClearColor(droneClear)
  const previousAlpha = renderer.getClearAlpha()
  try {
    renderer.setRenderTarget(droneTarget)
    renderer.setClearColor('#070b10', 1)
    renderer.clear()
    if (geography.enabled && (sceneLayer('layer-sky') || sceneLayer('layer-planets'))) {
      geography.render(renderer, droneCamera, eye)
      renderer.autoClear = false
      renderer.clearDepth()
    }
    renderer.shadowMap.needsUpdate = false
    renderer.render(scene, droneCamera)
    if (geography.enabled) geography.renderClouds(renderer, droneCamera)
    renderer.readRenderTargetPixels(droneTarget, 0, 0, DRONE_W, DRONE_H, dronePixels)
  } finally {
    renderer.setClearColor(droneClear, previousAlpha)
    renderer.autoClear = previousClear
    renderer.setRenderTarget(previous)
  }
  const row = DRONE_W * 4
  for (let y = 0; y < DRONE_H; y++) {
    droneImage.data.set(dronePixels.subarray((DRONE_H - 1 - y) * row, (DRONE_H - y) * row), y * row)
  }
  ctx.putImageData(droneImage, 0, 0)
}
function frame(now: number): void {
  if (photoBusy) {
    previous = now
    return
  }
  const frameStart = performance.now()
  updateTide(now)
  touchDriving.setActive(!!sim && studioInput.acceptsInput && streamMode !== 'model')
  if (worldStream?.flushInstall(performanceSettings.preset === 'mobile' ? 1 : 1.5))
    needsRender = true
  settlePendingGround()
  if (view.flushMapInstall(4, 24, camera.position)) needsRender = true
  renderer.domElement.dataset.worldInstallPending = String(view.pendingMapInstall)
  const installStatus = $('map-install-status')
  installStatus.hidden = !startupPending && view.pendingMapInstall === 0
  if (view.pendingMapInstall) {
    const label = 'Cargando entorno · ' + view.pendingMapInstall + ' elementos pendientes'
    if (installStatus.textContent !== label) installStatus.textContent = label
  }
  let physicsMs = 0
  renderer.info.reset()
  frameTimes.push(now - previous)
  if (frameTimes.length > 120) frameTimes.shift()
  const dt = (now - previous) / 1000
  previous = now
  tickSkyCycle(dt)
  if (sim) {
    const pad = pollGamepad()
    const input = currentInput(pad, dt)
    const physicsStart = performance.now()
    const crossing = game.step(
      document.hidden || playTransition || streamMode === 'model' ? 0 : dt,
      input,
      waterLevel,
      now,
      view.document,
    )
    pullGameCamera()
    physicsMs = performance.now() - physicsStart
    if (Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) {
      const c = sim.collisionStats
      $('performance-status').textContent =
        `${performanceText} · Colisiones: ${c.active} / ${c.total}`
    }
    if (worldStream && !document.hidden && (!streamSample || now - streamSample.at > 500)) {
      const position = sim.player.position
      const elapsed = streamSample ? (now - streamSample.at) / 1000 : 1
      const velocity = position.map((v, i) =>
        streamSample ? (v - streamSample.position[i]) / elapsed : 0,
      ) as Vec3Tuple
      const protectedPositions = view.document.entities
        .filter((e) => e.kind === 'vehicle' || e.portal)
        .map((e) => sim!.entityTransform(e.id).position)
      worldStream.update(position, velocity, protectedPositions)
      streamSample = { at: now, position: [...position] }
    }
    if (crossing) {
      renderer.domElement.dataset.portalCrossings = String(crossing.sequence)
      toast(
        crossing.blocked
          ? 'Paso bloqueado: comprueba el tamaño, el sentido y la salida'
          : 'Stargate atravesado',
      )
    }
    view.night = !!view.document.geography && geography.atmosphere.day < 0.15
    view.sync(
      sim,
      document.hidden ? 0 : dt,
      sim.player.vehicleId ? cameraMode === 'cockpit' : firstPerson,
      headYaw,
      headPitch,
    )
    if (wheelDebug.isEnabled) {
      const terrainMeshes: THREE.Object3D[] = []
      for (const e of view.document.entities) {
        if (e.terrain || e.road) {
          const obj = view.objects.get(e.id)
          if (obj) terrainMeshes.push(obj)
        }
      }
      worldStream?.root.traverseVisible((object) => {
        if (
          (object as THREE.Mesh).isMesh &&
          ['Terrain', 'Roads'].includes(object.userData.category)
        )
          terrainMeshes.push(object)
      })
      wheelDebug.setTerrainMeshes(terrainMeshes)
      wheelDebug.update(sim, sim.player.vehicleId, renderOrigin)
    }
    pushGameCamera()
    const cameraState = game.cameraState
    const {
      player: p,
      info,
      altitude,
    } = game.updateCamera(view, camera, now, dt, (body, activeCamera) => {
      if (preparedVehicles.has(body)) return
      preparedVehicles.add(body)
      void renderer.compileAsync(body, activeCamera, scene).catch((error) => {
        preparedVehicles.delete(body)
        console.warn('Vehicle material preparation failed', error)
      })
    })
    yaw = cameraState.yaw
    mapHeight = cameraState.mapHeight
    vehicleEntrance = cameraState.entrance
    renderer.domElement.dataset.vehicle = p.vehicleId ?? ''
    renderer.domElement.dataset.interior = p.interiorId ?? ''
    renderer.domElement.dataset.cameraMode = p.vehicleId
      ? cameraMode
      : firstPerson
        ? 'first-person'
        : 'chase'
    renderer.domElement.dataset.mapHeight = String(Math.round(mapHeight))
    renderer.domElement.dataset.vehicleEntrance = vehicleEntrance ? 'active' : 'complete'
    document.querySelector('.caption-tag')!.textContent =
      cameraMode === 'map' && p.vehicleId
        ? 'CENITAL · proa ↑'
        : cameraMode === 'cockpit' && p.vehicleId
          ? 'CONDUCTOR'
          : !p.vehicleId && firstPerson
            ? 'PRIMERA PERSONA'
            : 'PERSPECTIVA'
    $('player-mode').textContent = p.vehicleId
      ? view.document.entities.find((e) => e.id === p.vehicleId)!.name.toUpperCase() +
        (info?.dockedTo ? ' · SUJETO' : '') +
        (info?.flightMode ? ' · VUELO' : '')
      : p.interiorId
        ? 'MONITOR · INTERIOR DE LA NAVE'
        : 'MONITOR · VUELO'
    $('speed').textContent = p.vehicleId
      ? `${Math.round(p.speed * 3.6)} km/h` +
        (info && view.document.entities.find((e) => e.id === p.vehicleId)?.vehicle?.powertrain
          ? ` · ${info.gear < 0 ? 'R' : (info.manualTransmission ? 'M' : 'D') + info.gear} · ${Math.round(info.rpm)} rpm`
          : '')
      : 'Explora el distrito'
    $('flight-status').textContent = info?.canFly
      ? (info.flightMode
          ? `Altura ${altitude.toFixed(1)} m · objetivo ${info.targetAltitude!.toFixed(1)} m`
          : 'Modo tierra · V / Y para vuelo') + (pad ? ' · Mando modo 2' : '')
      : ''
    $('game-hud').hidden = false
    const wheelDebugText = wheelDebug.formatHud()
    $('wheel-debug-hud').hidden = !wheelDebugText
    $('wheel-debug-hud').textContent = wheelDebugText
    const near = sim.nearestVehicle()
    $('interaction').textContent =
      streamMode === 'model'
        ? 'Física pausada: cambia Maqueta por Conducción o Vuelo en Diagnóstico'
        : p.vehicleId
          ? info?.dockedTo
            ? 'E salir · F soltar · T conducir container · C cámara'
            : info?.isCarrier
              ? info.flightMode
                ? 'E salir · W/S altura · A/D giro · Flechas inclinar · Shift viaje'
                : 'V vuelo · T volver al A3 · C cámara · E salir'
              : sim.dockingCandidate()
                ? 'E salir · F sujetar al suelo del garaje · C cámara'
                : 'E salir · C cámara · F sujetar dentro del garaje'
          : near
            ? 'E para entrar en ' + view.document.entities.find((e) => e.id === near)!.name
            : 'WASD caminar · Espacio saltar · E entrar en vehículo · C cámara'
  } else {
    orbit.update()
    if (
      worldStream &&
      !dragging &&
      !solidEditor.active &&
      !document.hidden &&
      (!streamSample || now - streamSample.at > 500)
    ) {
      const position = orbit.target.toArray()
      worldStream.update(
        position,
        [0, 0, 0],
        [view.objects.get(selectedId)?.getWorldPosition(new THREE.Vector3()).toArray() ?? position],
        camera.position.toArray(),
      )
      streamSample = { at: now, position }
    }
    const object = view.objects.get(selectedId)
    outline.update(solidEditor.active ? object : undefined, selectedGeometry)
  }
  cursorRing.quaternion.copy(camera.quaternion)
  worldCursor.visible = !sim
  worldCursor.scale.setScalar(
    Math.max(0.25, camera.position.distanceTo(worldCursor.position) * 0.018),
  )
  gallery.update(view, !!sim, document.hidden ? 0 : dt)
  portalControls.update(
    sim,
    view.document,
    camera,
    view.portalTablets,
    view.helmScreens,
    view.touchScreens,
    view.flightScreens,
    view.placeScreens,
    view.systemScreens,
    renderOrigin,
    cameraMode === 'cockpit',
  )
  sidearm.visible = !!sim && !sim.player.vehicleId && weaponDrawn
  if (fireRequested && sim && sidearm.visible && document.hasFocus() && !document.hidden) {
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    if (sidearm.fire(now)) {
      // Preserve camera-to-monitor obstruction checks before transporting a shot through a window.
      const aimed = sim.shoot(camera.position.toArray(), direction.toArray(), sidearm.range, 0)
      const origin = new THREE.Vector3(...sim.renderPlayerPosition)
      const destination = aimed
        ? new THREE.Vector3(...aimed.point)
        : camera.position.clone().addScaledVector(direction, sidearm.range)
      const firing = camera.clone()
      if (!firstPerson) {
        firing.position.copy(origin)
        firing.lookAt(destination)
      }
      firing.updateMatrixWorld(true)
      sidearm.impact(gallery.shoot(sim, view, firing, sidearm.range, sidearm.impulse))
      renderer.domElement.dataset.impacts = String(view.impacts.count)
    }
  }
  vehicleEffects.updateAudio(sim, view.document, camera.position)
  fireRequested = false
  const worldCamera = camera.position.clone()
  const position = sim?.player.position ?? camera.position.toArray()
  renderOrigin.set(0, 0, 0)
  if (sim && new THREE.Vector3(...position).length() > 10000) renderOrigin.fromArray(position)
  const underSea =
    !!view.document.geography &&
    seaSeenFromBelow(worldCamera, view.document.geography.altitude, waterLevel)
  worldEnvironment.updateSea(
    view.document.geography,
    worldCamera,
    renderOrigin,
    Math.max(performanceSettings.distance, performanceSettings.fog * 2),
    now,
    sceneLayer('layer-sea'),
    !sim && sceneLayer('layer-catch') && underSea,
  )
  if (seaRoot.visible) needsRender = true
  renderer.domElement.dataset.sea = seaRoot.visible ? 'sheet' : 'off'
  const disk = sim?.catchDisk()
  const catchOn = sceneLayer('layer-catch')
  if (!catchOn || !view.document.geography) catchFloor.hide()
  else if (disk) catchFloor.show(disk.position, disk.rotation, renderOrigin)
  else if (!sim && underSea)
    catchFloor.showUnder(view.document.geography, worldCamera, waterLevel, renderOrigin)
  else catchFloor.hide()
  renderer.domElement.dataset.catchFloor = catchFloor.mesh.visible ? 'on' : 'off'
  view.buildingDistance =
    performanceSettings.preset === 'ultra' ? 20000 : Math.min(3000, performanceSettings.distance)
  // Fog is a horizontal fade, independent of how far geometry is drawn.
  const height = worldEnvironment.updateSky(
    geography,
    worldCamera,
    renderOrigin,
    skyClock,
    performanceSettings.fog,
  )
  if (geography.animatingClouds) needsRender = true
  worldStream?.renderUpdate(renderOrigin, !!performanceSettings.buildings, sim)
  if (worldStream) $('world-note').textContent = worldStream.status
  vehicleEffects.updateTires(sim, document.hidden ? 0 : dt, renderOrigin)
  renderer.domElement.dataset.tireMarks = String(tireMarks.root.geometry.drawRange.count / 6)
  renderer.domElement.dataset.tireSound = String(vehicleAudio.tireSoundLevel)
  view.root.position.copy(renderOrigin).negate()
  fieldLights.root.position.copy(renderOrigin).negate()
  const nightLights = !!view.document.geography && geography.atmosphere.day < 0.15
  if (fieldFollow && nightLights) {
    fieldLayers.navigation = true
    const box = document.querySelector<HTMLInputElement>('#light-layers [data-field="navigation"]')
    if (box) box.checked = true
    fieldFollow = false
  }
  fieldLayers.lamps = lampLook.armed && lampLook.level > 0
  fieldLights.update(
    view.document.geography,
    worldCamera.toArray(),
    nightLights,
    performance.now(),
    (p) => worldStream?.groundHeight(p),
    worldStream?.activeTiles.map((tile) => tile.manifest.tile) ?? [],
  )
  sim?.setPoles(fieldLights.poles())
  camera.position.sub(renderOrigin)
  for (const [id, hud] of view.shipHuds) {
    const inside =
      sim &&
      ((sim.player.interiorId === id && firstPerson) ||
        (sim.player.vehicleId === id && cameraMode === 'cockpit'))
    hud.update(camera, renderOrigin, now, inside ? sim!.vehicleInfo(id) : null)
  }
  if (view.document.geography) {
    const gps = localToGeo(view.document.geography, position)
    $('gps-status').textContent =
      `${gps.latitude.toFixed(5)}°, ${gps.longitude.toFixed(5)}° · ${height > 1000 ? (height / 1000).toFixed(1) + ' km' : height.toFixed(0) + ' m'}`
    $('map-status').textContent = geography.status
    renderer.domElement.dataset.geoLevel =
      height > 100000 ? 'space' : height > 250 ? 'map' : 'local'
    scene.background = null
    const air = geography.atmosphere
    const lightDirection = worldEnvironment.applyLighting(geography)
    sunDirection.copy(lightDirection).negate()
    shadowManager.setLightDirection(sunDirection)
    shadowManager.setLightIntensity(sun.intensity)
    shadowManager.setLightColor(sun.color)
    renderer.domElement.dataset.skyPhase =
      air.day > 0.8 ? 'day' : air.day < 0.1 ? 'night' : 'twilight'
    $('sky-status').textContent =
      `${skyClock.mode === 'live' ? 'Tiempo real' : 'Hora fija'} · ${skyTime(skyClock).toLocaleString()}`
    syncSkyHour()
    camera.far = worldStream
      ? Math.hypot(
          Math.max(height >= 2000 ? 80000 : 12000, performanceSettings.distance + 500),
          Math.max(0, height),
        )
      : Math.max(300, Math.min(100000000, height * 15))
    renderer.domElement.dataset.viewDistance = String(camera.far)
    camera.updateProjectionMatrix()
  } else {
    scene.background = new THREE.Color('#a6bbd5')
    ambientFill.intensity = 0.22
    const mapView = sim?.player.vehicleId && cameraMode === 'map'
    camera.far = mapView ? mapHeight * 4 : 300
    camera.updateProjectionMatrix()
    scene.fog = mapView
      ? new THREE.Fog('#a6bbd5', mapHeight * 2, mapHeight * 4)
      : new THREE.Fog('#a6bbd5', performanceSettings.fog * 0.75, performanceSettings.fog)
    $('gps-status').textContent = 'Sin ubicación · configura el punto GPS'
    $('map-status').textContent = ''
  }
  ocean.followFog(scene.fog instanceof THREE.Fog ? scene.fog : null)
  view.streetlights.update(
    camera.position,
    !!view.document.geography && geography.atmosphere.day < 0.15,
    performanceSettings.distance,
  )
  // Cascade reach is already camera-relative. Geographic elevation must not
  // disable shadows on high ground or after traveling to another origin.
  const shadowsActive = performanceSettings.shadows > 0
  sun.visible = !shadowsActive
  for (const light of shadowManager.lights) light.visible = shadowsActive
  renderer.domElement.dataset.shadowCascades = String(
    shadowsActive ? shadowManager.lights.length : 0,
  )
  renderer.domElement.dataset.depthOfField = performanceSettings.dof > 0 ? '1' : '0'
  if (sim || needsRender) {
    const outlineVisible = outline.visible
    outline.visible = false
    const mirrorVehicle =
      performanceSettings.mirrors && cameraMode === 'cockpit' && !document.hidden
        ? (sim?.player.vehicleId ?? null)
        : null
    if (mirrorVehicle)
      view.limitDrawDistance(
        worldCamera,
        performanceSettings.distance,
        !!sim,
        !!performanceSettings.buildings,
        performanceSettings.preset === 'ultra'
          ? 20000
          : Math.min(performanceSettings.distance, performanceSettings.roads),
      )
    const portalLive = [...view.portals.values()].map((p) => p.mesh.material.uniforms.live.value)
    try {
      for (const p of view.portals.values()) p.mesh.material.uniforms.live.value = 0
      view.renderMirrors(renderer, scene, camera, mirrorVehicle, now)
    } finally {
      ;[...view.portals.values()].forEach((p, i) => {
        p.mesh.material.uniforms.live.value = portalLive[i]
      })
    }
    const externalViews = new Map<string, ExternalPortalView>()
    for (const connection of project!.connections ?? []) {
      if (connection.mode !== 'window') continue
      const registry = projectPortalEntries()
      const source = registry.find((p) => p.id === connection.source)
      const target = registry.find((p) => p.id === connection.destination)
      if (!source || !target || source.locationId !== project!.activeLocation) continue
      const surface = view.portals.get(source.entityId)
      if (!surface || !surface.mesh.visible) continue
      const destination = project!.locations.find((p) => p.id === target.locationId)
      if (!destination) continue
      const remote = remotePortalViews?.resolve(
        target.locationId,
        destination.scene,
        target.entityId,
      )
      if (remote) externalViews.set(source.entityId, remote)
    }
    photoExternalViews = externalViews
    renderPortals(
      view.portals,
      renderer,
      scene,
      camera,
      (remote) => {
        view.limitDrawDistance(
          remote.position.clone().add(renderOrigin),
          performanceSettings.distance,
          !!sim,
          !!performanceSettings.buildings,
          performanceSettings.preset === 'ultra'
            ? 20000
            : Math.min(performanceSettings.distance, performanceSettings.roads),
        )
        if (geography.enabled) {
          const remotePosition = remote.position.clone().add(renderOrigin)
          const restore = portalEnvironment(
            geography,
            scene,
            remotePosition,
            worldCamera,
            renderOrigin,
            skyClock,
            ambientFill,
            [sun, ...shadowManager.lights],
          )
          try {
            geography.render(renderer, remote, remotePosition)
            renderer.autoClear = false
          } catch (error) {
            restore()
            throw error
          }
          return restore
        }
        return undefined
      },
      externalViews,
    )
    outline.visible = outlineVisible
    view.batchBuildings = !gizmo.dragging
    view.limitDrawDistance(
      worldCamera,
      performanceSettings.distance,
      !!sim,
      !!performanceSettings.buildings,
      performanceSettings.preset === 'ultra'
        ? 20000
        : Math.min(performanceSettings.distance, performanceSettings.roads),
    )
    applySceneLayers()
    geography.setViewAspect(camera.aspect)
    renderer.autoClear = true
    const dof = performanceSettings.dof > 0
    if (dof) depthOfField.begin(renderer)
    try {
      if (geography.enabled && (sceneLayer('layer-sky') || sceneLayer('layer-planets'))) {
        geography.render(renderer, camera, worldCamera)
        renderer.autoClear = false
        renderer.clearDepth()
      }
      shadowManager.update(camera, renderOrigin)
      portalControls.prepare(camera)
      renderer.shadowMap.needsUpdate = shadowsActive
      renderer.render(scene, camera)
      if (geography.enabled) geography.renderClouds(renderer, camera)
    } finally {
      portalControls.finish()
      if (dof) depthOfField.present(renderer, camera)
    }
    silhouette.render(
      renderer,
      camera,
      !sim && !solidEditor.active && !cursorTool.value
        ? mapInspection
          ? worldStream?.selectedSurface
          : view.objects.get(selectedId)
        : undefined,
      !!selectedGeometry,
    )
    sidearm.render(renderer, now, camera.aspect, firstPerson)
    renderDrone()
    needsRender = view.pendingBuildingBatches || !!remotePortalViews?.pending
  }
  camera.position.copy(worldCamera)
  performanceMonitor.add({
    time: now,
    frame: dt * 1000,
    cpu: performance.now() - frameStart,
    physics: physicsMs,
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    install: worldStream?.installMilliseconds ?? 0,
  })
  if (now >= nextPerformanceReadout) {
    nextPerformanceReadout = now + 500
    view.setVehicleShadowReceiving(!!performanceSettings.vehicleShadows)
    const summary = performanceMonitor.summary()
    performanceHud.textContent = summary
    $('diagnostics-readout').textContent = summary
    if (worldStream) {
      const diagnostics = worldStream.diagnostics
      const mode = $<HTMLSelectElement>('tile-debug').value as TileDebugMode
      tileDebug?.update(
        diagnostics,
        mode,
        $<HTMLInputElement>('tile-debug-labels').checked,
        new THREE.Vector3(...(streamSample?.position ?? worldCamera.toArray())),
      )
      const rows = [12, 13, 14, 15].map((z) => {
        const tiles = diagnostics.tiles.filter((t) => t.tile.z === z)
        return `Z${z}: ${tiles.filter((t) => t.state === 'visible').length} visibles / ${tiles.length} registradas · ${tiles.filter((t) => t.kind === 'mesh').length} mallas`
      })
      $('tile-counts').textContent =
        rows.join('\n') +
        `\n${diagnostics.pending} trabajos pendientes · ${(diagnostics.residentBytes / 1048576).toFixed(1)} MiB estimados de ciudad / ${(diagnostics.budgetBytes / 1048576).toFixed(0)} MiB de retención\nPico de instalación: ${diagnostics.maxInstallMs.toFixed(1)} ms`
      renderer.domElement.dataset.tileDebug = mode
      needsRender = true
    }
    if (sim && view.document.geography && $('properties').querySelector('#entity-latitude')) {
      const entity = view.document.entities.find((e) => e.id === selectedId)
      if (entity && (!entity.geoAnchor || entity.parentId)) {
        const live = geographicPose(
          view.document.geography,
          sim.entityTransform(selectedId, true),
        ).anchor
        for (const key of ['latitude', 'longitude', 'altitude'] as const) {
          const field = document.getElementById('entity-' + key) as HTMLInputElement | null
          if (field) field.value = String(Number(live[key].toFixed(key === 'altitude' ? 3 : 8)))
        }
      }
    }
    const clockLabel = document.getElementById('studio-clock')
    if (clockLabel)
      clockLabel.textContent = skyTime(skyClock).toLocaleTimeString('es-ES', { timeZone: 'UTC' })
    const sorted = [...frameTimes].sort((a, b) => a - b)
    const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] || 0
    const cpu = performance.now() - frameStart
    performanceText = `${p95.toFixed(0)} ms P95 · CPU ${cpu.toFixed(1)} ms · Física ${physicsMs.toFixed(1)} ms · Última zona ${lastWorldInstallMs.toFixed(0)} ms · ${renderer.info.render.calls} dibujos · ${(renderer.info.render.triangles / 1000).toFixed(0)}k triángulos`
    renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls)
    renderer.domElement.dataset.frameP95 = p95.toFixed(1)
  }
}
function readCloudStyle(): 'low' | 'artistic' {
  return $<HTMLSelectElement>('cloud-style').value === 'low' ? 'low' : 'artistic'
}
function storedUnit(key: string, fallback: number) {
  const raw = localStorage.getItem(key)
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback
}
function storedCloudAmount() {
  return storedUnit('nabla.cloud-amount', 0.4)
}
function storedCloudStorm() {
  return storedUnit('nabla.cloud-storm', 0.12)
}
function storedMoonSize() {
  const raw = localStorage.getItem('nabla.moon-size')
  if (raw == null || raw === '') return 9
  const n = Number(raw)
  return Number.isFinite(n) ? Math.min(16, Math.max(1, n)) : 9
}
function syncCloudWeatherEnabled() {
  const low = readCloudStyle() === 'low'
  for (const id of ['cloud-amount', 'cloud-storm']) {
    $<HTMLInputElement>(id).disabled = low
    document.querySelector(`label[for="${id}"]`)?.classList.toggle('is-off', low)
  }
}
function bindCloudWeather() {
  const amount = $<HTMLInputElement>('cloud-amount')
  const storm = $<HTMLInputElement>('cloud-storm')
  amount.value = String(Math.round(storedCloudAmount() * 100))
  storm.value = String(Math.round((1 - storedCloudStorm()) * 100))
  const apply = () => {
    const nextAmount = Number(amount.value) / 100
    const nextStorm = 1 - Number(storm.value) / 100
    localStorage.setItem('nabla.cloud-amount', String(nextAmount))
    localStorage.setItem('nabla.cloud-storm', String(nextStorm))
    geography.setCloudWeather(nextAmount, nextStorm)
    needsRender = true
  }
  amount.oninput = apply
  storm.oninput = apply
}
function bindMoonSize() {
  const input = $<HTMLInputElement>('moon-size')
  input.value = String(storedMoonSize())
  input.oninput = () => {
    const size = Number(input.value)
    localStorage.setItem('nabla.moon-size', String(size))
    geography.setMoonSize(size)
    needsRender = true
  }
}
function attachGeography(next: GeographicView) {
  next.setCloudStyle(readCloudStyle())
  next.setCloudWeather(storedCloudAmount(), storedCloudStorm())
  next.setMoonSize(storedMoonSize())
  scene.add(next.tiles, next.lensFlare)
}
function applyLocation(latitude: number, longitude: number): void {
  $<HTMLSelectElement>('travel-city').value = ''
  $<HTMLInputElement>('travel-latitude').value = String(latitude)
  $<HTMLInputElement>('travel-longitude').value = String(longitude)
  void travelTo()
}

function skyMinute(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}
function syncSkyHour(): void {
  const hour = $<HTMLInputElement>('sky-hour')
  if (document.activeElement === hour) return
  hour.value = String(skyMinute(skyTime(skyClock)))
}
function clockFromMinute(minutes: number): SkyClock {
  const typed = new Date($<HTMLInputElement>('sky-time').value)
  const next = Number.isFinite(typed.getTime()) ? new Date(typed) : new Date()
  next.setHours(0, 0, 0, 0)
  next.setMinutes(minutes)
  return { mode: 'fixed', at: next.toISOString() }
}
function previewSkyClock(clock: SkyClock): void {
  skyClock = clock
  $<HTMLInputElement>('sky-time').value = localTimeInput(skyTime(clock))
  $('sky-live').classList.remove('active')
  needsRender = true
}
function setSkyClock(clock: SkyClock): void {
  action(() => {
    editor.load({ ...editor.document, sky: clock })
    refreshUi()
    needsRender = true
  })
}
bindAction('sky-apply', () => {
  stopSkyCycle(false)
  const time = new Date($<HTMLInputElement>('sky-time').value)
  if (!Number.isFinite(time.getTime())) {
    toast('Introduce una fecha y hora válidas')
    return
  }
  setSkyClock({ mode: 'fixed', at: time.toISOString() })
})
const skyHour = $<HTMLInputElement>('sky-hour')
skyHour.addEventListener('input', () => {
  stopSkyCycle(false)
  previewSkyClock(clockFromMinute(skyHour.valueAsNumber))
})
skyHour.addEventListener('change', () => setSkyClock(clockFromMinute(skyHour.valueAsNumber)))
bindAction('sky-live', () => {
  stopSkyCycle(false)
  setSkyClock({ mode: 'live' })
})
let skyCycle: { from: number; elapsed: number } | null = null
function stopSkyCycle(commit: boolean) {
  const cycle = skyCycle
  if (!cycle) return
  skyCycle = null
  $('sky-cycle').classList.remove('active')
  if (!commit) return
  const at = new Date(cycle.from + cycle.elapsed * 3600000)
  setSkyClock({ mode: 'fixed', at: at.toISOString() })
}
function tickSkyCycle(dt: number) {
  if (!skyCycle) return
  if (document.activeElement?.id === 'sky-time') {
    stopSkyCycle(true)
    return
  }
  skyCycle.elapsed += dt
  const at = new Date(skyCycle.from + skyCycle.elapsed * 3600000)
  previewSkyClock({ mode: 'fixed', at: at.toISOString() })
}
bindAction('sky-cycle', () => {
  if (skyCycle) {
    stopSkyCycle(true)
    return
  }
  const typed = new Date($<HTMLInputElement>('sky-time').value)
  const from = Number.isFinite(typed.getTime()) ? typed.getTime() : skyTime(skyClock).getTime()
  skyCycle = { from, elapsed: 0 }
  $('sky-cycle').classList.add('active')
  previewSkyClock({ mode: 'fixed', at: new Date(from).toISOString() })
})
bindAction('apply-location', () =>
  applyLocation(
    Number($<HTMLInputElement>('latitude').value),
    Number($<HTMLInputElement>('longitude').value),
  ),
)
function locate(): void {
  if (!navigator.geolocation) {
    toast('Ubicación no disponible · se conserva el punto actual')
    return
  }
  toast('Solicitando ubicación al navegador…')
  navigator.geolocation.getCurrentPosition(
    (p) => applyLocation(p.coords.latitude, p.coords.longitude),
    () => toast('No se obtuvo ubicación · se conserva el punto actual'),
    { timeout: 10000, maximumAge: 60000 },
  )
}
bindAction('locate', locate)
setupWorldStream()
refreshUi()
if (circuitMode && !requestedLocation && !localStorage.getItem('nabla.location.requested')) {
  localStorage.setItem('nabla.location.requested', '1')
  void startupDone.then(() => locate())
}
const frameLoop = new FrameLoop(frame)
frameLoop.start()
window.addEventListener('pagehide', () => frameLoop.stop())
window.addEventListener('pageshow', () => {
  previous = performance.now()
  frameLoop.start()
})

bindAction('css-screen-demo', () => {
  $('options-menu').hidePopover()
  if (sim) {
    toast('Detén la partida para encuadrar la pantalla CSS.')
    return
  }
  const screen = view.helmScreens.values().next().value
  if (!screen) {
    toast('Esta escena no tiene un container.')
    return
  }
  screen.updateWorldMatrix(true, false)
  const centre = screen.getWorldPosition(new THREE.Vector3()).add(renderOrigin)
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(screen.matrixWorld)
  orbit.minDistance = 0.4
  orbit.target.copy(centre)
  camera.position
    .copy(centre)
    .addScaledVector(normal, 1.4)
    .add(new THREE.Vector3(0, 0.45, 0))
  orbit.update()
  needsRender = true
  toast(
    'Consola de mando: juega y acércate para usar las pantallas, o entra en el puesto de conducción.',
  )
})

async function refreshMapCacheUi() {
  try {
    const stats = await mapCacheStats()
    $<HTMLSelectElement>('map-cache-budget').value = String(stats.budget / 1_000_000)
    const capacity = await navigator.storage?.estimate?.()
    if (capacity?.quota)
      $('map-cache-storage').textContent =
        `Cuota del sitio: ${(capacity.quota / 1e9).toFixed(1)} GB · uso total del sitio: ${((capacity.usage ?? 0) / 1e9).toFixed(2)} GB. No reserva espacio por adelantado.`
    $('map-cache-usage').textContent =
      `${(stats.bytes / 1_000_000).toFixed(1)} / ${stats.budget / 1_000_000} MB · ${stats.entries} archivos`
  } catch {
    $('map-cache-usage').textContent = 'Caché no disponible · el mapa seguirá funcionando'
  }
}
$('map-cache-budget').onchange = async () => {
  try {
    await setMapCacheBudget(Number($<HTMLSelectElement>('map-cache-budget').value))
    await refreshMapCacheUi()
  } catch {
    $('map-cache-usage').textContent = 'No se pudo ajustar la caché'
  }
}
bindAction('map-cache-persist', async () => {
  try {
    const granted = await navigator.storage.persist()
    $('map-cache-storage').textContent = granted
      ? 'Almacenamiento persistente concedido. Borrar los datos del sitio elimina también esta copia.'
      : 'El navegador no ha concedido persistencia; la caché sigue funcionando y puede ser liberada por él.'
  } catch {
    $('map-cache-storage').textContent = 'Persistencia no disponible en este navegador.'
  }
})
bindAction('map-cache-clear', async () => {
  try {
    await clearMapCache()
    await refreshMapCacheUi()
  } catch {
    toast('No se pudo vaciar la caché')
  }
})
$('options-menu').addEventListener('toggle', () => {
  if ($('options-menu').matches(':popover-open')) void refreshMapCacheUi()
})
void refreshMapCacheUi()

function placeOnMap(id: string, latitude: number, longitude: number, commit: boolean) {
  const origin = editor.document.geography
  const entity = editor.document.entities.find((item) => item.id === id)
  if (!origin || !entity || isMapEnvironment(entity)) return
  const graph = SceneGraph.fromValidated(editor.document)
  const world = graph.worldTransform(id)
  const geographic = geographicPose(origin, world, entity.geoAnchor)
  const groundHere = worldStream?.groundHeight(world.position)
  const clearance = Math.min(
    10000,
    Math.max(
      0,
      groundHere !== undefined && Number.isFinite(groundHere)
        ? world.position[1] - groundHere
        : (entity.groundOffset ?? 0),
    ),
  )
  const flat = geoToLocal(origin, { latitude, longitude, altitude: 0 })
  const groundThere = worldStream?.groundHeight([flat[0], 0, flat[2]])
  const altitude =
    groundThere !== undefined && Number.isFinite(groundThere)
      ? localToGeo(origin, [flat[0], groundThere + clearance, flat[2]]).altitude
      : geographic.anchor.altitude
  const next = { ...geographic.anchor, latitude, longitude, altitude }
  const transform = graph.localFromWorld(
    entity.parentId,
    anchoredWorldPose(origin, next, geographic.pose),
  )
  if (!commit) {
    const key = `${id}:${latitude.toFixed(5)}:${longitude.toFixed(5)}`
    if (key === dronePreview) return
    dronePreview = key
    view.updateEntityPose({
      ...editor.entity(id),
      geoAnchor: next,
      ...(entity.parentId ? {} : { groundOffset: clearance }),
      transform,
    })
    needsRender = true
    return
  }
  dronePreview = ''
  editor.update(id, {
    geoAnchor: next,
    ...(entity.parentId ? {} : { groundOffset: clearance }),
    transform,
  })
  selectedId = id
  finishPoseEdit(id)
  groundPlacementDirty = true
  needsRender = true
}
bindCoverageMap({
  pins: () => {
    const origin = editor.document.geography
    if (!origin) return []
    const graph = SceneGraph.fromValidated(editor.document)
    return editor.document.entities
      .filter(
        (entity) =>
          !isMapEnvironment(entity) && entity.kind !== 'spawn' && entity.kind !== 'terrain',
      )
      .map((entity) => {
        const geo = geographicPose(origin, graph.worldTransform(entity.id), entity.geoAnchor).anchor
        return {
          id: entity.id,
          name: entity.name,
          latitude: geo.latitude,
          longitude: geo.longitude,
        }
      })
  },
  selectPin: (id) => {
    selectedId = id
    refreshUi()
  },
  movePin: (id, latitude, longitude) => placeOnMap(id, latitude, longitude, true),
  previewPin: (id, latitude, longitude) => placeOnMap(id, latitude, longitude, false),
  glance: (latitude, longitude) => {
    if (!droneOn) return
    if (Math.abs(latitude - droneLat) < 1e-5 && Math.abs(longitude - droneLon) < 1e-5) return
    droneLat = latitude
    droneLon = longitude
    needsRender = true
  },
  setDrone: (on) => {
    droneOn = on
    if (!on) return
    droneLat = Number.NaN
    needsRender = true
  },
  moveView: (latitude, longitude) => {
    const origin = view.document.geography
    if (!origin || sim) return
    const flat = geoToLocal(origin, { latitude, longitude, altitude: 0 })
    const here = worldStream?.groundHeight(orbit.target.toArray())
    const there = worldStream?.groundHeight([flat[0], orbit.target.y, flat[2]])
    const clearance =
      here === undefined ? Math.max(orbit.target.y, 2) : Math.max(2, orbit.target.y - here)
    const target = new THREE.Vector3(
      flat[0],
      there === undefined ? orbit.target.y : there + clearance,
      flat[2],
    )
    camera.position.add(target.clone().sub(orbit.target))
    orbit.target.copy(target)
    orbit.update()
    needsRender = true
  },
})

mountStudio({
  refresh: refreshUi,
  input: studioInput,
  reportError: (error) => toast(String(error)),
  undo: undoScene,
  redo: redoScene,
  togglePlay,
  canUndo: () => !sim && editor.canUndo,
  canRedo: () => !sim && editor.canRedo,
  canPlay: () => !loadingWorld && !playTransition,
  isPlaying: () => !!sim,
})

bindAction('save-as', () => {
  $<HTMLInputElement>('project-filename').value = projectFilename(project!.name)
  $('file-menu').hidePopover()
  game.releaseInput()
  if (document.pointerLockElement) document.exitPointerLock()
  $<HTMLDialogElement>('save-project-dialog').showModal()
})
bindAction('save-project-cancel', () => $<HTMLDialogElement>('save-project-dialog').close())
$('save-project-form').onsubmit = (event) => {
  event.preventDefault()
  action(() => {
    const filename = projectFilename($<HTMLInputElement>('project-filename').value)
    const snapshot = retainLocation(project!, editor.document)
    snapshot.name = filename.replace(/\.nabla\.json$/i, '')
    const data = new Blob([JSON.stringify(snapshot)], { type: 'application/json' })
    if (data.size > 40_000_000)
      throw Error('El proyecto supera 40 MB; reduce las zonas cargadas antes de exportarlo')
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    project = snapshot
    $<HTMLDialogElement>('save-project-dialog').close()
    toast(`Planeta preparado: ${filename} · ${snapshot.objects.length} objetos`)
  })
}

bindAction('project-place-open', () => {
  const value = $<HTMLSelectElement>('project-places').value
  if (value.startsWith('bookmark:')) {
    const place = project!.bookmarks?.[Number(value.slice(9))]
    if (!place) return
    $<HTMLInputElement>('travel-latitude').value = String(place.latitude)
    $<HTMLInputElement>('travel-longitude').value = String(place.longitude)
    $<HTMLSelectElement>('travel-city').value = ''
    void travelTo()
  } else void openProjectPlace(value)
})
async function openProjectPlace(id: string, entityId?: string): Promise<void> {
  if (loadingWorld || playTransition) return
  const place = project!.locations.find((p) => p.id === id)
  if (!place) return
  if (sim) await togglePlay()
  const retained = retainLocation(project!, editor.document)
  const next = { ...retained, activeLocation: id }
  loadingWorld = true
  refreshUi()
  try {
    await writeScene(PROJECT_KEY, JSON.stringify(next))
    editor.load(next.locations.find((p) => p.id === id)!.scene)
    project = next
    if (entityId) selectedId = entityId
    rebuild()
    $('welcome').hidden = true
    $('travel-menu').hidePopover()
    await view.ready
    if (entityId) focusSelection()
    else focusCursor(true)
  } catch (error) {
    toast(String(error))
  } finally {
    loadingWorld = false
    refreshUi()
  }
}

function refreshPortalEntries(doc = editor.document) {
  const working = project!.locations.find((p) => locationId(p.scene) === locationId(doc))
  portalEntriesCache = portalRegistry({
    ...project!,
    locations: project!.locations.map((p) => (p === working ? { ...p, scene: doc } : p)),
  })
  portalEntriesProject = project
}
function projectPortalEntries() {
  if (portalEntriesProject !== project) refreshPortalEntries()
  return portalEntriesCache
}
function registrySource(entityId: string) {
  return projectPortalEntries().find(
    (p) => p.entityId === entityId && p.locationId === project!.activeLocation,
  )
}
function configureProjectPortal(
  sourceId: string,
  destination: string | null,
  open: boolean,
): string {
  project = retainLocation(project!, editor.document)
  const source = registrySource(sourceId)
  if (!source) throw Error('Portal no registrado')
  const mouth = editor.document.entities.find((e) => e.id === sourceId)!
  if (
    open &&
    sim &&
    mouth.portal?.clearsRamp &&
    mouth.parentId &&
    !sim.vehicleInfo(mouth.parentId).rampClosed
  )
    throw Error('Cierra primero la puerta del garaje')
  if (destination && sim) sim.configurePortal(sourceId, null, 'closed')
  project = setPortalConnection(project!, source.id, destination, open ? 'window' : 'closed')
  remotePortalViews?.dispose()
  needsRender = true
  return open
    ? 'Ventana remota abierta · el paso físico entre lugares aún está cerrado'
    : 'Ventana remota cerrada'
}
function refreshPortalRegistry(): void {
  refreshPortalEntries(view.document)
  const list = $('portal-registry-list')
  list.replaceChildren()
  const entries = projectPortalEntries()
  const places = [...project!.locations].sort(
    (a, b) => Number(b.id === project!.activeLocation) - Number(a.id === project!.activeLocation),
  )
  for (const place of places) {
    const portals = entries.filter((p) => p.locationId === place.id)
    if (!portals.length) continue
    const section = document.createElement('section')
    section.className = 'portal-place'
    section.dataset.locationId = place.id
    const heading = document.createElement('h4')
    heading.textContent =
      place.scene.name + (place.id === project!.activeLocation ? ' · Lugar actual' : '')
    section.append(heading)
    for (const portal of portals) {
      const button = document.createElement('button')
      button.textContent = portal.name
      button.title = `${portal.place} · ${portal.entityId}`
      button.dataset.portalId = portal.id
      button.onclick = () => {
        void openProjectPlace(portal.locationId, portal.entityId)
      }
      section.append(button)
    }
    list.append(section)
  }
}
window.addEventListener('portal-registry-request', refreshPortalRegistry)
window.addEventListener('studio-preferences-open', () => void refreshMapCacheUi())

// The actual empty viewport and its animation loop exist before any saved project is parsed.
setTimeout(() => void restoreStartup(), 0)
async function restoreStartup(): Promise<void> {
  const label = $('map-install-status')
  label.hidden = false
  label.textContent = 'Leyendo el proyecto guardado…'
  renderer.domElement.dataset.startup = 'loading'
  try {
    const storedProject = await readScene(PROJECT_KEY)
    const storedScene = storedProject ? null : await readScene(STORAGE_KEY)
    const freshWorld = !circuitMode && !storedProject && !storedScene
    let initialScene = storedScene
    if (freshWorld)
      initialScene = JSON.stringify(
        parseScene(
          createPlanetScene(
            { ...(urlDestination ?? { latitude: 42.3601, longitude: -71.0589 }), altitude: 0 },
            urlDestination
              ? `${urlDestination.latitude.toFixed(5)}, ${urlDestination.longitude.toFixed(5)}`
              : 'Boston',
          ),
        ),
      )
    const result = await prepareStartup(
      storedProject,
      initialScene,
      performanceSettings.preset === 'ultra',
      (message) => {
        label.textContent = message
      },
      false,
    )
    if (urlDestination) {
      const { latitude, longitude } = urlDestination
      const retained = result.project.locations.find((place) => place.id === 'planet')
      if (retained)
        result.project = travelPlanet(
          result.project,
          latitude,
          longitude,
          `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
        )
      const destination =
        result.project.locations.find((place) => place.id === 'planet')?.scene ??
        parseScene(
          createPlanetScene(
            { latitude, longitude, altitude: 0 },
            `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
          ),
        )
      if (urlDestination.altitude !== undefined) {
        const cursor = geoToLocal(destination.geography!, {
          latitude,
          longitude,
          altitude: urlDestination.altitude,
        })
        destination.cursor = cursor
        destination.cursorOnGround = false
        // Only the initial default vehicles follow an explicit URL altitude.
        // Returning to a saved place must never move authored objects.
        if (!retained || freshWorld)
          for (const entity of destination.entities) {
            if (entity.parentId || entity.groundOffset === undefined) continue
            entity.transform.position[1] = cursor[1] + entity.groundOffset
            delete entity.groundOffset
          }
      }
      result.project = visitLocation(result.project, destination)
      result.scene = result.project.locations.find(
        (place) => place.id === result.project.activeLocation,
      )!.scene
      result.saved = JSON.stringify(result.scene)
    }
    project = retainLocation(result.project, result.scene)
    try {
      await writeScene(PROJECT_KEY, JSON.stringify(project))
    } catch {
      toast(
        'El planeta está abierto, pero no se pudo guardar en este navegador. Descarga el JSON para conservarlo.',
      )
    }
    editor = SceneEditor.fromValidated(result.scene, performanceSettings.preset === 'ultra')
    savedDocument = result.saved
    editorMetadataDirty = false
    selectedId =
      result.scene.entities.find((e) => e.kind === 'vehicle')?.id ??
      result.scene.entities.find((e) => !isMapEnvironment(e))!.id
    collapsed.clear()
    for (const e of result.scene.entities) if (e.kind === 'group') collapsed.add(e.id)
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    rebuild()
    portalControls.rebuild(result.scene)
    loadingWorld = false
    startupPending = false
    watchAssets(view)
    refreshUi()
    focusCursor(true)
    renderer.domElement.dataset.startup = 'ready'
    finishStartup()
    if (freshWorld) {
      renderer.domElement.dataset.world = urlDestination ? 'destination' : 'irun'
      void placeNewWorldObjects()
    }
    if (urlDestination) {
      groundPlacementDirty = true
      $<HTMLInputElement>('travel-latitude').value = String(urlDestination.latitude)
      $<HTMLInputElement>('travel-longitude').value = String(urlDestination.longitude)
      void writeScene(PROJECT_KEY, JSON.stringify(project)).catch(() =>
        toast('No se pudo guardar el destino en este navegador.'),
      )
    } else if (requestedLocation && 'error' in requestedLocation) {
      toast(requestedLocation.error)
    }
    if (urlPlay(location.search)) await togglePlay(true)
  } catch (error) {
    startupPending = false
    loadingWorld = false
    refreshUi()
    renderer.domElement.dataset.startup = 'failed'
    finishStartup()
    toast('No se pudo abrir el proyecto. Tu copia guardada se conserva. ' + String(error))
  }
}
