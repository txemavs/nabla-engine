import { settleGroundPlacement } from './studio/ground-placement.js'
import { mountStudio } from './studio/shell.js'
import { setPlanetCharts } from './helm-map.js'
import { PlanetWorld } from './planet-world.js'
import { planetaryScene, createPlanetScene } from './studio/planet-scene.js'
import { geographicPose, anchoredWorldPose } from './studio/geographic-pose.js'
import { prepareStartup } from './startup.js'
import { authoredTree, isMapEnvironment } from './studio/outliner.js'
import { RemotePortalViews } from './remote-portals.js'
import { portalRegistry, setPortalConnection } from './studio/portal-registry.js'
import { portalEnvironment } from './portal-environment.js'
import {
  createProject,
  locationId,
  parseProject,
  retainLocation,
  visitLocation,
  projectFilename,
  type StudioProject,
} from './studio/project.js'
import { FrameLoop } from './studio/frame-loop.js'
import { StudioInputOwner } from './studio/input-owner.js'
import { mapCacheStats, setMapCacheBudget, clearMapCache } from './map-cache.js'
import { receiveMapGeometry, type PreparedMapGeometry } from './map-geometry.js'
import { roadGeometry } from '../src/draped-road.js'
import { FlightAudio } from './flight-audio.js'
import { activatePreparation } from './preparation-access.js'
void activatePreparation()
import { SeaWater } from './water.js'
import { createCatalogEntities, entityCatalog, entityCapabilities } from '../src/index.js'
import { SelectionOutline } from './selection-outline.js'
import {
  readPerformance,
  shadowTiers,
  performancePresets,
  performanceProfile,
} from './performance.js'
import { ShadowManager } from './csm.js'
import { readScene, writeScene } from './scene-storage.js'
import { SolidEditor } from './solid-editor.js'
import { treeSprite } from '../src/vegetation.js'
import { createGallery, Gallery } from './gallery.js'
import { PortalControls } from './portal-controls.js'
import { upgradeReferenceScene } from './scene-upgrades.js'
import { Sidearm } from './sidearm.js'
import { driverHeadPose, followDrivingHeading, DrivingTelemetry } from './driving-camera.js'
import { WheelDebugOverlay } from './wheel-debug.js'
import { createPortal } from '../src/portal.js'
import { renderPortals, type ExternalPortalView } from './portals.js'
import { skyTime, localTimeInput, type SkyClock } from '../src/sky.js'
import { GeographicView } from './geography.js'
import { localToGeo, MADRID } from '../src/geography.js'
import { gamepadAxes } from './input.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import {
  SceneEditor,
  parseScene,
  createSampleScene,
  type SceneDocument,
  SceneGraph,
  Simulation,
  createEntity,
  idleInput,
  rotationDegrees,
  toDegrees,
  type Entity,
  type Vec3Tuple,
} from '../src/index.js'
import { SceneView } from './view.js'
import './style.css'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id)
  if (!element) throw new Error('Missing element: ' + id)
  return element as T
}
const escape = (s: string): string =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
const performanceSettings = readPerformance()
const STORAGE_KEY = 'nabla.scene.v1'
const PROJECT_KEY = 'nabla.project.v1'
let project: StudioProject | undefined
let portalEntriesCache: ReturnType<typeof portalRegistry> = []
let portalEntriesProject: StudioProject | undefined
let recoverLegacyPlaces = true
const circuitMode = new URLSearchParams(location.search).get('scene') === 'circuit'
let loadingWorld = true
const flightAudio = new FlightAudio()
let groundPlacementDirty = true
let worldStream: PlanetWorld | null = null
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
const collapsed = new Set(
  editor.document.entities.filter((e) => e.kind === 'group').map((e) => e.id),
)
let selectedGeometry: Entity['geometry']
let selectedId =
  editor.document.entities.find((e) => e.kind === 'vehicle')?.id ?? editor.document.entities[0].id
let sim: Simulation | null = null
let needsRender = true
let firstPerson = true
let fireRequested = false
let weaponDrawn = false
let cameraMode: 'chase' | 'cockpit' | 'map' = 'chase'
let headYaw = 0
let headPitch = 0.05
let headVehicle: string | null = null
let mapHeight = 350
const drivingTelemetry = new DrivingTelemetry()
function cycleCamera(): void {
  if (!sim) return
  if (!sim.player.vehicleId) {
    firstPerson = !firstPerson
    toast(firstPerson ? 'Primera persona' : 'Tercera persona')
    return
  }
  cameraMode = cameraMode === 'chase' ? 'cockpit' : cameraMode === 'cockpit' ? 'map' : 'chase'
  pitch = cameraMode === 'cockpit' ? 0.05 : 0.24
  headYaw = 0
  headPitch = 0.05
  toast(
    cameraMode === 'map'
      ? 'Cámara cenital · rueda para acercar o alejar'
      : cameraMode === 'cockpit'
        ? 'Cámara del conductor'
        : 'Cámara exterior',
  )
}
let lastLookTime = 0
let yaw = 0,
  pitch = 0.24
const keys = new Set<string>()
const studioInput = new StudioInputOwner(() => {
  keys.clear()
  fireRequested = false
  if (document.pointerLockElement) document.exitPointerLock()
})
let toastTimer: ReturnType<typeof setTimeout>
let remotePortalViews: RemotePortalViews | undefined
function toast(message: string): void {
  $('toast').textContent = message
  $('toast').style.display = 'block'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    $('toast').style.display = 'none'
  }, 3500)
}
function action(fn: () => void): void {
  try {
    fn()
  } catch (error) {
    toast(error instanceof Error ? error.message : 'No se pudo completar la acción')
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
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.08
viewport.prepend(renderer.domElement)
renderer.domElement.setAttribute('aria-label', 'Vista 3D de la escena')
const scene = new THREE.Scene()
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
orbit.target.set(4, 0.6, 5)
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
function placeCursor(position: Vec3Tuple): void {
  editor.setCursor(position)
  syncCursor()
  $('status').textContent = 'Cambios sin guardar'
}
$('cursor-apply').onclick = () =>
  action(() =>
    placeCursor(
      ['x', 'y', 'z'].map((a) => $<HTMLInputElement>(`cursor-${a}`).valueAsNumber) as Vec3Tuple,
    ),
  )
$('cursor-selection').onclick = () =>
  action(() =>
    placeCursor(SceneGraph.fromValidated(editor.document).worldTransform(selectedId).position),
  )
$('cursor-view').onclick = () => action(() => placeCursor(orbit.target.toArray()))
$('selection-cursor').onclick = () =>
  action(() => {
    const entity = editor.document.entities.find((e) => e.id === selectedId)!
    if (isMapEnvironment(entity) && !entity.mapEditable)
      throw new Error('Pulsa Crear modificación antes de editar el edificio')
    editor.moveToCursor(selectedId)
    rebuild()
  })
$('origin-cursor').onclick = () =>
  action(() => {
    const entity = editor.document.entities.find((e) => e.id === selectedId)!
    if (isMapEnvironment(entity) && !entity.mapEditable)
      throw new Error('Pulsa Crear modificación antes de editar el edificio')
    editor.originToCursor(selectedId)
    rebuild()
  })
function lockAxis(axis: string): void {
  $<HTMLSelectElement>('transform-axis').value = axis
  gizmo.showX = axis === 'all' || axis === 'X'
  gizmo.showY = axis === 'all' || axis === 'Y'
  gizmo.showZ = axis === 'all' || axis === 'Z'
  needsRender = true
}
$('transform-axis').onchange = () => lockAxis($<HTMLSelectElement>('transform-axis').value)
$('transform-exact').onclick = () =>
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
  })
const outline = new SelectionOutline()
scene.add(outline)
const lastWorldInstallMs = 0
let water: SeaWater | undefined
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
scene.add(geography.tiles)
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
    scene.add(geography.tiles)
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
  water?.dispose()
  water = doc.geography ? new SeaWater(doc.geography) : undefined
  if (water) scene.add(water.root)
  $('stream-status').textContent = ''
  const identity = doc.geography?.planetary ? JSON.stringify(doc.geography) : ''
  if (worldStream && streamGeography === identity) return
  worldStream?.dispose()
  worldStream = null
  setPlanetCharts(() => worldStream?.chartTiles ?? [])
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
  worldStream.setDistance(performanceSettings.distance)
  scene.add(worldStream.root)
  $('stream-status').textContent = 'Exploración conectada · editor y juego'
}
function select(id: string): void {
  worldStream?.clearSelection()
  selectedId = id
  refreshUi()
}
function refreshUi(doc: SceneDocument = editor.document, poseEdited = false): void {
  refreshPortalEntries(doc)
  const places = $<HTMLSelectElement>('project-places')
  places.replaceChildren(
    ...project!.locations.map((place) => {
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
  skyClock = doc.sky ?? { mode: 'live' }
  $<HTMLInputElement>('sky-time').value = localTimeInput(skyTime(skyClock))
  $('sky-live').classList.toggle('active', skyClock.mode === 'live')
  $('sky-zone').textContent = 'Hora local · ' + Intl.DateTimeFormat().resolvedOptions().timeZone
  const geo = doc.geography ?? MADRID
  $<HTMLInputElement>('latitude').value = String(geo.latitude)
  $<HTMLInputElement>('longitude').value = String(geo.longitude)
  $<HTMLSelectElement>('imagery').value = doc.geography?.imagery ?? 'satellite'
  for (const id of ['latitude', 'longitude', 'imagery', 'apply-location', 'locate'])
    $<HTMLInputElement>(id).disabled = Boolean(sim) || loadingWorld || id === 'imagery'
  $('entity-count').textContent = String(doc.entities.length)
  $('status').textContent =
    !poseEdited && editor.serialize() === savedDocument ? 'Guardado local' : 'Cambios sin guardar'
  const tree = $('tree')
  tree.replaceChildren()
  const treeChildren = authoredTree(doc.entities)
  const authoredCount = [...treeChildren.values()].reduce((n, list) => n + list.length, 0)
  $('entity-count').textContent = String(authoredCount)
  $('entity-count').title = 'Objetos propios y modificaciones; el mapa se carga aparte'
  const icons = { terrain: '▧', solid: '⬡', box: '◇', vehicle: '▰', spawn: '◎', group: '▱' }
  function append(parent: string | null, depth: number): void {
    for (const e of treeChildren.get(parent) ?? []) {
      const button = document.createElement('button')
      button.className = 'tree-item' + (e.id === selectedId ? ' selected' : '')
      button.dataset.entityId = e.id
      button.setAttribute('role', 'treeitem')
      if (treeChildren.has(e.id)) button.setAttribute('aria-expanded', String(!collapsed.has(e.id)))
      button.setAttribute('aria-selected', String(e.id === selectedId))
      button.style.paddingLeft = `${10 + depth * 14}px`
      button.innerHTML = `<span class="kind-icon">${e.kind === 'group' ? (collapsed.has(e.id) ? '›' : '⌄') : icons[e.kind]}</span><span class="name">${escape(e.name)}</span>${e.motion === 'dynamic' ? '<span class="motion">●</span>' : ''}`
      button.disabled = sim !== null
      button.onclick = () => {
        if (e.kind === 'group') {
          if (collapsed.has(e.id)) collapsed.delete(e.id)
          else collapsed.add(e.id)
        }
        select(e.id)
      }
      tree.append(button)
      if (!collapsed.has(e.id)) append(e.id, depth + 1)
    }
  }
  append(null, 0)
  const locationsTree = document.getElementById('studio-locations')
  if (locationsTree) {
    locationsTree.replaceChildren()
    for (const place of project!.locations) {
      const active = place.id === project!.activeLocation
      const section = document.createElement('details')
      section.open = active
      const label = document.createElement('summary')
      label.textContent = active ? doc.name : place.scene.name
      section.append(label)
      if (active) section.append(tree)
      else {
        const visit = document.createElement('button')
        visit.textContent = 'Abrir lugar · ' + place.scene.entities.length + ' objetos'
        visit.disabled = !!sim || loadingWorld
        visit.onclick = () => void openProjectPlace(place.id)
        section.append(visit)
      }
      locationsTree.append(section)
    }
  }
  if (tree.dataset.selection !== selectedId) {
    tree.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
    tree.dataset.selection = selectedId
  }
  const e = doc.entities.find((item) => item.id === selectedId)!
  const props = $('properties')
  selectedGeometry = e.geometry
  // Only the selected ancestry is needed here; avoid allocating a graph for the entire map.
  const ancestry = [e]
  const byId = new Map(doc.entities.map((entity) => [entity.id, entity]))
  let ancestor = e
  while (ancestor.parentId) {
    ancestor = byId.get(ancestor.parentId)!
    ancestry.push(ancestor)
  }
  const graph = SceneGraph.fromValidated({ ...doc, entities: ancestry })
  const parent = doc.entities.find((p) => p.id === e.parentId)
  const geographic =
    doc.geography && (!parent || (isMapEnvironment(parent) && !parent.mapEditable))
      ? geographicPose(doc.geography, graph.worldTransform(e.id), e.geoAnchor)
      : undefined
  const displayedPose = geographic?.pose ?? e.transform
  const angles = toDegrees(displayedPose.rotation)
  function row(label: string, key: string, values: number[]): string {
    return `<label class="field-label">${label}</label><div class="axis-row">${values.map((n, i) => `<label><span>${'XYZ'[i]}</span><input aria-label="${label} ${'XYZ'[i]}" data-vector="${key}" data-axis="${i}" type="number" step="${key === 'rotation' ? '1' : '0.1'}" value="${Number(n.toFixed(3))}"></label>`).join('')}</div>`
  }
  props.innerHTML = `<div class="entity-title">${escape(e.name)}</div><div class="entity-type">${e.light ? 'Farola · iluminación' : { terrain: 'Relieve · Esri Terrain 3D', solid: 'Edificio · sólido editable', box: 'Geometría · bloque', vehicle: 'Vehículo · cuatro ruedas', spawn: 'Inicio del jugador', group: 'Grupo de objetos' }[e.kind]}</div>
    <label class="field-label">Capacidades</label><div class="entity-capabilities">${entityCapabilities(e).map(escape).join(' · ')}</div>
    <label class="field-label" for="name">Nombre</label><input id="name" value="${escape(e.name)}" maxlength="100">
    ${row(geographic ? 'Pose desde ancla · m' : 'Posición respecto al padre · m', 'position', displayedPose.position)}${row('Rotación local · °', 'rotation', angles)}
    ${e.kind === 'box' || e.kind === 'vehicle' || e.sprite ? row('Dimensiones · m', 'size', e.size) : ''}
    <label class="field-label" for="color">Color</label><input id="color" type="color" value="${e.color}">
    <label class="field-label" for="parent">Padre</label><select id="parent"><option value="">Mundo</option>${doc.entities
      .filter(
        (item) =>
          item.id !== e.id &&
          item.kind !== 'spawn' &&
          (!isMapEnvironment(item) || item.mapEditable || item.id === e.parentId),
      )
      .map(
        (item) =>
          `<option value="${escape(item.id)}" ${e.parentId === item.id ? 'selected' : ''}>${escape(item.name)}</option>`,
      )
      .join('')}</select>
    ${e.kind === 'box' ? `<label class="field-label" for="motion">Física</label><select id="motion"><option value="static">Fijo</option><option value="dynamic">Móvil</option><option value="none">Solo visual</option></select>` : ''}
    ${e.motion === 'dynamic' ? `<label class="field-label" for="mass">Masa · kg</label><input id="mass" type="number" min="0.1" step="1" value="${e.mass}">` : ''}
    <div class="property-actions"><button id="duplicate">Duplicar</button><button id="delete">Eliminar</button></div>`
  if (geographic) {
    const geo = document.createElement('section')
    geo.id = 'entity-geography'
    geo.innerHTML =
      '<label class="field-label">Ancla geográfica · altitud sobre el modelo terrestre</label>'
    for (const [key, title] of [
      ['longitude', 'Longitud'],
      ['latitude', 'Latitud'],
      ['altitude', 'Altitud · m'],
    ] as const) {
      const label = document.createElement('label')
      label.textContent = title
      const input = document.createElement('input')
      input.type = 'number'
      input.step = key === 'altitude' ? '0.1' : '0.000001'
      input.id = 'entity-' + key
      input.value = String(Number(geographic.anchor[key].toFixed(key === 'altitude' ? 3 : 8)))
      input.onchange = () =>
        action(() => {
          const anchor = { ...geographic.anchor, [key]: input.valueAsNumber }
          const world = anchoredWorldPose(doc.geography!, anchor, geographic.pose)
          editor.update(e.id, {
            ...(e.geoAnchor ? { geoAnchor: anchor } : {}),
            transform: graph.localFromWorld(e.parentId, world),
          })
          finishPoseEdit(e.id)
        })
      label.append(input)
      geo.append(label)
    }
    const reset = document.createElement('button')
    reset.textContent = 'Ancla en la posición actual · XYZ a cero'
    reset.onclick = () =>
      action(() => {
        editor.update(e.id, { geoAnchor: undefined })
        finishPoseEdit(e.id)
      })
    geo.append(reset)
    props.querySelector('#name')!.after(geo)
  }
  if (doc.geography && !geographic) {
    const geo = geographicPose(doc.geography, graph.worldTransform(e.id)).anchor
    const section = document.createElement('section')
    section.id = 'entity-geography'
    section.innerHTML = '<label class="field-label">GPS del objeto · pose relativa al padre</label>'
    for (const [key, title] of [
      ['longitude', 'Longitud'],
      ['latitude', 'Latitud'],
      ['altitude', 'Altitud · m'],
    ] as const) {
      const label = document.createElement('label')
      label.textContent = title
      const input = document.createElement('input')
      input.id = 'entity-' + key
      input.disabled = true
      input.value = String(Number(geo[key].toFixed(key === 'altitude' ? 3 : 8)))
      label.append(input)
      section.append(label)
    }
    props.querySelector('#name')!.after(section)
  }
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
  const objectMode = $<HTMLSelectElement>('studio-object-mode')
  objectMode.value = solidEditor.active ? 'edit' : 'object'
  objectMode.disabled = !!sim || loadingWorld
  objectMode.querySelector<HTMLOptionElement>('[value=edit]')!.disabled = !e.geometry || mapReadOnly
  objectMode.title = e.geometry
    ? 'Editar el objeto o su geometría'
    : 'Este objeto no contiene un sólido editable'
  objectMode.onchange = () => {
    if ((objectMode.value === 'edit') !== solidEditor.active)
      document.getElementById('edit-solid')?.click()
  }
  if (e.light) {
    const controls = document.createElement('div')
    controls.innerHTML = `<label class="field-label">Farola</label><label><input id="light-enabled" type="checkbox" ${e.light.enabled ? 'checked' : ''}> Encendida</label><label><input id="light-night" type="checkbox" ${e.light.nightOnly ? 'checked' : ''}> Solo de noche</label><label class="field-label" for="light-color">Color de luz</label><input id="light-color" type="color" value="${e.light.color}"><label class="field-label" for="light-intensity">Intensidad · cd</label><input id="light-intensity" type="number" min="0" max="10000" value="${e.light.intensity}"><label class="field-label" for="light-distance">Alcance · m</label><input id="light-distance" type="number" min="1" max="100" value="${e.light.distance}">`
    props.append(controls)
    for (const id of [
      'light-enabled',
      'light-night',
      'light-color',
      'light-intensity',
      'light-distance',
    ])
      $(id).onchange = () =>
        action(() => {
          editor.update(e.id, {
            light: {
              enabled: $<HTMLInputElement>('light-enabled').checked,
              nightOnly: $<HTMLInputElement>('light-night').checked,
              color: $<HTMLInputElement>('light-color').value,
              intensity: $<HTMLInputElement>('light-intensity').valueAsNumber,
              distance: $<HTMLInputElement>('light-distance').valueAsNumber,
            },
          })
          rebuild()
        })
  }
  if (e.sprite) {
    const controls = document.createElement('div')
    controls.innerHTML = `<label class="field-label" for="sprite-url">PNG transparente</label><input id="sprite-url" value="${escape(e.sprite.url)}">`
    props.append(controls)
    $('sprite-url').onchange = () =>
      action(() => {
        editor.update(e.id, {
          sprite: { ...e.sprite!, url: $<HTMLInputElement>('sprite-url').value },
        })
        rebuild()
      })
  }
  if (e.portal) {
    const controls = document.createElement('div')
    controls.innerHTML = `<label class="field-label" for="portal-mode">Stargate · conexión</label><select id="portal-mode"><option value="closed">Cerrado</option><option value="window">Ventana</option><option value="open">Paso abierto</option></select><p>Los destinos de esta ciudad permiten el paso. Entre ciudades, de momento solo ventana.</p>`
    controls.insertAdjacentHTML(
      'afterbegin',
      `<label class="field-label" for="portal-destination">Destino del Stargate</label><select id="portal-destination"><option value="">Sin enlace</option>${doc.entities
        .filter((item) => item.portal && item.id !== e.id)
        .map((item) => `<option value="${escape(item.id)}">${escape(item.name)}</option>`)
        .join('')}</select>`,
    )
    props.append(controls)
    const sourceEntry = registrySource(e.id)
    const remoteEntries = projectPortalEntries().filter(
      (p) =>
        p.locationId !== project!.activeLocation &&
        p.size.every((n, i) => Math.abs(n - e.size[i]) < 1e-6),
    )
    for (const target of remoteEntries)
      $<HTMLSelectElement>('portal-destination').add(
        new Option(`${target.name} · ${target.place}`, `global:${target.id}`),
      )
    const remoteConnection = project!.connections?.find((c) => c.source === sourceEntry?.id)
    $<HTMLSelectElement>('portal-destination').value = remoteConnection
      ? `global:${remoteConnection.destination}`
      : (e.portal.pairId ?? '')
    $('portal-destination').onchange = () =>
      action(() => {
        const target = $<HTMLSelectElement>('portal-destination').value
        if (target.startsWith('global:')) {
          editor.linkPortals(e.id, null)
          configureProjectPortal(e.id, target.slice(7), false)
        } else {
          if (remoteConnection) configureProjectPortal(e.id, null, false)
          editor.linkPortals(e.id, target || null)
        }
        rebuild()
      })
    $<HTMLSelectElement>('portal-mode').value = remoteConnection?.mode ?? e.portal.mode
    if (remoteConnection)
      $<HTMLSelectElement>('portal-mode').querySelector<HTMLOptionElement>(
        'option[value=open]',
      )!.disabled = true
    $('portal-mode').onchange = () =>
      action(() => {
        if (remoteConnection) {
          configureProjectPortal(
            e.id,
            remoteConnection.destination,
            $<HTMLSelectElement>('portal-mode').value === 'window',
          )
          refreshUi()
          return
        }
        editor.setPortalMode(
          e.id,
          $<HTMLSelectElement>('portal-mode').value as 'open' | 'closed' | 'window',
        )
        rebuild()
      })
  }
  props.querySelectorAll<HTMLInputElement>('[data-vector]').forEach((input) => {
    input.onchange = () =>
      action(() => {
        const axis = Number(input.dataset.axis),
          key = input.dataset.vector!
        const values = [
          ...(key === 'rotation' ? angles : key === 'size' ? e.size : displayedPose.position),
        ] as Vec3Tuple
        values[axis] = input.valueAsNumber
        if (key === 'size') editor.update(e.id, { size: values })
        else if (geographic) {
          const pose = {
            ...displayedPose,
            [key]: key === 'rotation' ? rotationDegrees(...values) : values,
          }
          editor.update(e.id, {
            ...(key === 'position' ? { geoAnchor: geographic.anchor } : {}),
            transform: graph.localFromWorld(
              e.parentId,
              anchoredWorldPose(doc.geography!, geographic.anchor, pose),
            ),
          })
        } else
          editor.update(e.id, {
            transform: {
              ...e.transform,
              [key]: key === 'rotation' ? rotationDegrees(...values) : values,
            },
          })
        if (key === 'size') rebuild()
        else finishPoseEdit(e.id)
      })
  })
  $('name').onchange = () =>
    action(() => {
      editor.update(e.id, { name: $<HTMLInputElement>('name').value })
      rebuild()
    })
  if (e.visual) {
    props.querySelectorAll<HTMLInputElement>('[data-vector="size"]').forEach((input) => {
      input.readOnly = true
      input.title = 'Dimensiones del modelo original'
    })
  }
  $('color').onchange = () =>
    action(() => {
      editor.update(e.id, { color: $<HTMLInputElement>('color').value })
      rebuild()
    })
  $('parent').onchange = () =>
    action(() => {
      editor.reparent(e.id, $<HTMLSelectElement>('parent').value || null)
      rebuild()
    })
  if (e.kind === 'box') {
    $<HTMLSelectElement>('motion').value = e.motion
    $('motion').onchange = () =>
      action(() => {
        editor.update(e.id, { motion: $<HTMLSelectElement>('motion').value as Entity['motion'] })
        rebuild()
      })
  }
  if (e.motion === 'dynamic')
    $('mass').onchange = () =>
      action(() => {
        editor.update(e.id, { mass: $<HTMLInputElement>('mass').valueAsNumber })
        rebuild()
      })
  $('duplicate').onclick = () =>
    action(() => {
      selectedId = editor.duplicate(e.id)
      rebuild()
    })
  $('delete').onclick = () =>
    action(() => {
      editor.remove(e.id)
      rebuild()
    })
  props
    .querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
      'input,button,select',
    )
    .forEach((el) => {
      if (sim || loadingWorld) el.disabled = true
    })
  if (!sim) {
    $<HTMLInputElement>('color').disabled = !!e.visual
    $<HTMLButtonElement>('duplicate').disabled = e.kind === 'spawn'
    $<HTMLButtonElement>('delete').disabled = e.kind === 'spawn'
    $<HTMLSelectElement>('parent').disabled =
      e.kind === 'spawn' || e.motion === 'dynamic' || !!e.portal
    if (solidEditor.active || mapReadOnly) gizmo.detach()
    else if (view.objects.has(e.id)) gizmo.attach(view.objects.get(e.id)!)
    else gizmo.detach()
  }
  if (mapReadOnly && !sim) {
    props
      .querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>(
        'input,button,select',
      )
      .forEach((control) => {
        control.disabled = true
      })
    const button = document.createElement('button')
    button.id = 'make-building-editable'
    button.textContent = 'Crear modificación'
    button.disabled = loadingWorld
    button.onclick = () =>
      action(() => {
        editor.update(e.id, { mapEditable: true })
        rebuild()
      })
    const note = document.createElement('p')
    note.textContent =
      'Elemento del mapa. Crea una modificación para incorporarlo al árbol y editarlo.'
    props.append(note, button)
  }
  $<HTMLButtonElement>('undo').disabled = !!sim || loadingWorld || !editor.canUndo
  $<HTMLButtonElement>('redo').disabled = !!sim || loadingWorld || !editor.canRedo
  for (const id of [
    'add-entity',
    'add-solid',
    'add-box',
    'add-car',
    'add-carrier',
    'add-streetlight',
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
  if (solidEditor.active) {
    solidEditor.close()
    refreshUi()
  }
  gizmo.setMode(mode)
  $('translate').classList.toggle('active', mode === 'translate')
  $('rotate').classList.toggle('active', mode === 'rotate')
}
$('translate').onclick = () => setTool('translate')
$('rotate').onclick = () => setTool('rotate')
function setAddMenu(open: boolean): void {
  $('add-menu').hidden = !open
  $('add-entity').setAttribute('aria-expanded', String(open))
}
$('add-entity').onclick = () => setAddMenu(Boolean($('add-menu').hidden))
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
$('undo').onclick = undoScene
$('redo').onclick = redoScene
for (const [id, kind] of [
  ['add-solid', 'solid'],
  ['add-box', 'box'],
  ['add-group', 'group'],
] as const) {
  $(id).onclick = () =>
    action(() => {
      selectedId = editor.add(kind)
      if (worldStream && editor.document.cursorOnGround) {
        const entity = editor.entity(selectedId)
        editor.update(selectedId, { groundOffset: kind === 'group' ? 0 : entity.size[1] / 2 })
      }
      setAddMenu(false)
      rebuild()
    })
}
for (const entry of entityCatalog) {
  $(`add-${entry.id}`).onclick = () =>
    action(() => {
      const ground = new THREE.Vector3(...(editor.document.cursor ?? [0, 0, 0]))
      const terrain = worldStream?.groundHeight(ground.toArray())
      const onSurface =
        !!worldStream &&
        (editor.document.cursorOnGround || terrain === undefined || ground.y <= terrain + 0.05)
      if (onSurface && terrain !== undefined) ground.y = terrain
      const entities = createCatalogEntities(entry.id, crypto.randomUUID(), ground.toArray())
      if (onSurface) entities[0].groundOffset = entry.clearance
      const doc = editor.document
      doc.entities.push(...entities)
      editor.load(doc)
      selectedId = entities[0].id
      setAddMenu(false)
      rebuild()
      view.ready.then(focusSelection).catch(() => undefined)
      toast(`${entry.label} añadido · G mover · R girar`)
    })
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
$('focus').onclick = focusSelection
$('sample-assets').onclick = () =>
  action(() => {
    project = retainLocation(project!, editor.document)
    const sample = upgradeReferenceScene(createSampleScene())
    project = visitLocation(project, sample)
    editor.load(sample)
    selectedId = 'car-a'
    rebuild()
    view.ready.then(focusSelection).catch(() => undefined)
    toast('A3 y container listos. Puedes deshacer para volver a tu escena.')
  })
$('add-sprite').onclick = () =>
  action(() => {
    const doc = editor.document
    const sprite = createEntity(crypto.randomUUID(), 'group', doc.cursor ?? [0, 0, 0])
    sprite.name = 'Sprite · árbol'
    sprite.size = [7, 7, 0.1]
    sprite.sprite = treeSprite(0)
    if (worldStream && doc.cursorOnGround) sprite.groundOffset = 0
    doc.entities.push(sprite)
    editor.load(doc)
    selectedId = sprite.id
    rebuild()
  })
$('sample-gallery').onclick = () =>
  action(() => {
    const doc = editor.document
    const entities = createGallery(crypto.randomUUID())
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
  })
$('sample-portals').onclick = () =>
  action(() => {
    const next = editor.document
    const id = crypto.randomUUID()
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
  })
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
$('travel-cancel').onclick = () => travelController?.abort()
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
    const current = editor.document
    const placeKey = (lat: number, lon: number) => `nabla-place:${lat.toFixed(6)}:${lon.toFixed(6)}`
    if (current.geography)
      await writeScene(
        placeKey(current.geography.latitude, current.geography.longitude),
        editor.serialize(),
      )
    project = retainLocation(project!, current)
    await writeScene(PROJECT_KEY, JSON.stringify(project))
    const retained = project.locations.find(
      (p) => locationId(p.scene) === `geo:${latitude.toFixed(6)}:${longitude.toFixed(6)}`,
    )
    const saved = retained
      ? JSON.stringify(retained.scene)
      : recoverLegacyPlaces
        ? await readScene(placeKey(latitude, longitude))
        : null
    let next: SceneDocument
    const savedScene = saved
      ? parseScene(JSON.parse(saved), performanceSettings.preset === 'ultra')
      : null
    next = savedScene
      ? planetaryScene(savedScene)
      : upgradeReferenceScene(createPlanetScene({ latitude, longitude, altitude: 0 }, name))
    if (controller.signal.aborted) return
    const nextProject = visitLocation(project!, next)
    await writeScene(PROJECT_KEY, JSON.stringify(nextProject))
    project = nextProject
    $('travel-cancel').hidden = true
    editor.load(next)
    for (const e of next.entities) if (e.kind === 'group') collapsed.add(e.id)
    selectedId = 'car-a'
    rebuild()
    $('welcome').hidden = true
    await view.ready
    focusSelection()
    const car = next.entities.find((e) => e.id === 'car-a')
    const [x, y, z] = car?.transform.position ?? next.cursor ?? [0, 0, 0]
    orbit.target.set(x, y + 2, z)
    camera.position.set(x + 35, y + 32, z + 40)
    orbit.update()
    renderer.domElement.dataset.world = 'destination'
    $('travel-status').textContent =
      `${name} cargado · pulsa Jugar para explorar. Los cambios del lugar anterior se guardaron en este navegador.`
    toast(`${name} · destino cargado`)
    $('travel-menu').hidePopover()
    if (!savedScene) void placeNewWorldObjects()
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
$('world-irun').onclick = () => void loadIrun()
$('world-irun-official').hidden = true

$('welcome-close').onclick = () => {
  $('welcome').hidden = true
}
$('save').onclick = async () => {
  const snapshot = editor.serialize()
  try {
    await writeScene(STORAGE_KEY, snapshot)
    project = retainLocation(project!, editor.document)
    await writeScene(PROJECT_KEY, JSON.stringify(project))
    savedDocument = snapshot
    $('status').textContent = 'Guardado local'
    toast('Escena guardada en este navegador')
  } catch (error) {
    toast(error instanceof Error ? error.message : 'No se pudo guardar; puedes exportar la escena')
  }
}
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([editor.serialize()], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'nabla-scene.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
$('import').onclick = () => $<HTMLInputElement>('file').click()
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
        : createProject(upgradeReferenceScene(raw))
    const scene = opened.locations.find((p) => p.id === opened.activeLocation)!.scene
    editor = new SceneEditor(scene, performanceSettings.preset === 'ultra')
    project = opened
    recoverLegacyPlaces = false
    savedDocument = editor.serialize()
    $('welcome').hidden = true
    rebuild()
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
  const previousTarget = doc.entities.find((e) => e.id === selectedId)?.transform.position[1]
  if (!settleGroundPlacement(doc, (p) => worldStream!.groundHeight(p))) return
  editor.load(doc)
  rebuild()
  groundPlacementDirty = false
  const nextTarget = doc.entities.find((e) => e.id === selectedId)?.transform.position[1]
  if (previousTarget !== undefined && nextTarget !== undefined) {
    const delta = nextTarget - previousTarget
    camera.position.y += delta
    orbit.target.y += delta
    orbit.update()
  }
}
let playTransition = false
async function togglePlay(): Promise<void> {
  if (loadingWorld || playTransition) return
  playTransition = true
  const button = $<HTMLButtonElement>('play')
  button.disabled = true
  button.textContent = sim ? 'Saliendo…' : 'Loading…'
  button.setAttribute('aria-busy', 'true')
  try {
    // Yield through a paint before constructing or disposing the synchronous simulation.
    await new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    if (!sim && worldStream) {
      const spawn = editor.document.entities.find((e) => e.kind === 'spawn')!
      await worldStream.ensureGround(spawn.transform.position)
      const adjusted = editor.document
      for (const e of adjusted.entities)
        if (e.kind === 'vehicle' || e.kind === 'spawn') {
          const ground = worldStream.groundHeight(e.transform.position)
          if (ground !== undefined)
            e.transform.position[1] = Math.max(
              e.transform.position[1],
              ground + (e.kind === 'spawn' ? 0.2 : e.vehicle?.flight ? 1.5 : 0.85),
            )
        }
      editor.load(adjusted)
    }
    togglePlayNow()
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
  }
}
function togglePlayNow(): void {
  action(() => {
    keys.clear()
    if (sim) {
      sim.dispose()
      sim = null
      view.setPlaying(false)
      renderer.domElement.dataset.impacts = '0'
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
      sim = new Simulation(editor.document, {
        playerMode: 'hover',
        planetaryTerrain: !!editor.document.geography?.planetary,
        experimentalLargeScene: performanceSettings.preset === 'ultra',
        mapBuildingsEnabled: !!performanceSettings.buildings,
      })
      sim.setMapBuildingsEnabled(!!performanceSettings.buildings)
      sim.setCollisionDistance(performanceSettings.collisions)
      firstPerson = true
      fireRequested = false
      weaponDrawn = false
      sidearm.reset()
      gallery.reset()
      portalSequence = 0
      drivingTelemetry.update(null, 0, 0, 0, true)
      delete renderer.domElement.dataset.portalCrossings
      cameraMode = 'chase'
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
  })
}
for (const [id, key] of [
  ['map-buildings', 'buildings'],
  ['draw-distance', 'distance'],
  ['road-distance', 'roads'],
  ['collision-distance', 'collisions'],
  ['render-resolution', 'resolution'],
  ['shadow-quality', 'shadows'],
] as const) {
  const control = $<HTMLSelectElement>(id)
  control.value = String(performanceSettings[key])
  control.onchange = () => {
    performanceSettings[key] = Number(control.value)
    performanceSettings.preset = 'custom'
    editor.experimentalLargeScene = false
    $<HTMLSelectElement>('performance-preset').value = 'custom'
    worldStream?.setQuality(
      performanceProfile(performanceSettings).concurrent,
      performanceProfile(performanceSettings).ahead,
      performanceSettings.preset === 'ultra',
    )
    try {
      localStorage.setItem('nabla.performance.v1', JSON.stringify(performanceSettings))
    } catch {
      /* Current session remains usable. */
    }
    worldStream?.setDistance(performanceSettings.distance)
    if (worldStream)
      $('world-note').textContent =
        `${editor.document.name} · OSM + ESRI · Vista ≈ ${performanceSettings.distance / 1000} km`
    sim?.setMapBuildingsEnabled(!!performanceSettings.buildings)
    sim?.setCollisionDistance(performanceSettings.collisions)
    renderer.setPixelRatio(Math.min(devicePixelRatio, performanceSettings.resolution))
    renderer.setSize(viewport.clientWidth, viewport.clientHeight)
    renderer.shadowMap.enabled = performanceSettings.shadows > 0
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
$<HTMLSelectElement>('performance-preset').value = performanceSettings.preset
$('performance-preset').onchange = async () => {
  const id = $<HTMLSelectElement>('performance-preset').value as keyof typeof performancePresets
  const preset = performancePresets[id]
  if (!preset) return
  Object.assign(performanceSettings, preset.settings)
  for (const [control, key] of [
    ['map-buildings', 'buildings'],
    ['draw-distance', 'distance'],
    ['road-distance', 'roads'],
    ['collision-distance', 'collisions'],
    ['render-resolution', 'resolution'],
    ['shadow-quality', 'shadows'],
  ] as const)
    $<HTMLSelectElement>(control).value = String(performanceSettings[key])
  $('draw-distance').dispatchEvent(new Event('change'))
  performanceSettings.preset = id
  editor.experimentalLargeScene = id === 'ultra'
  $<HTMLSelectElement>('performance-preset').value = id
  try {
    localStorage.setItem('nabla.performance.v1', JSON.stringify(performanceSettings))
  } catch {
    /* Optional persistence. */
  }
  worldStream?.setQuality(preset.concurrent, preset.ahead, id === 'ultra')
  try {
    await setMapCacheBudget(Math.max(preset.cache, (await mapCacheStats()).budget / 1_000_000))
    await refreshMapCacheUi()
  } catch {
    toast('Calidad aplicada; caché no disponible')
  }
}
for (const section of document.querySelectorAll<HTMLDetailsElement>('.app-menu details')) {
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
    keys.clear()
    sim?.setInput(idleInput())
    if (document.pointerLockElement) document.exitPointerLock()
  })
}
$('file-menu').addEventListener('click', (event) => {
  if ((event.target as HTMLElement).closest('button')) $('file-menu').hidePopover()
})
$('play').onclick = togglePlay
remotePortalViews = new RemotePortalViews(() => {
  needsRender = true
}, toast)
const portalControls = new PortalControls(viewport, toast)
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
  if (sim) {
    renderer.domElement
      .requestPointerLock()
      ?.catch(() => toast('No se pudo capturar el ratón. Puedes seguir jugando con el teclado.'))
    return
  }
  if (
    e.button !== 0 ||
    dragging ||
    gizmo.axis ||
    down.distanceTo(new THREE.Vector2(e.clientX, e.clientY)) > 4
  )
    return
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
  if (e.shiftKey) {
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
  if (worldStream?.inspect(raycaster, $('properties'), hits[0]?.distance)) return
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
    mapHeight = THREE.MathUtils.clamp(mapHeight * Math.exp(e.deltaY * 0.001), 80, 2500)
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
  if (e.code === 'KeyR' && !e.repeat) {
    if (!playTransition)
      void togglePlay()
        .then(() => togglePlay())
        .then(() => toast('Partida reiniciada'))
    return
  }
  if ((e.code === 'Comma' || e.code === 'Period') && !e.repeat && sim?.player.vehicleId) {
    view.signal(sim.player.vehicleId, e.code === 'Comma' ? -1 : 1)
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
    toast(sim.toggleFlight())
    return
  }
  if (e.code === 'KeyF' && !e.repeat) {
    toast(sim.toggleDock())
    return
  }
  if (e.code === 'KeyT' && !e.repeat) {
    toast(sim.transferControls())
    cameraMode = 'chase'
    return
  }
  keys.add(e.code)
  if (e.code === 'Space' && !e.repeat && !sim.player.vehicleId)
    sim.setInput({ ...currentInput(), jump: true })
  if (e.code === 'KeyE' && !e.repeat) {
    const prev = sim.player.vehicleId
    toast(sim.interact())
    const id = sim.player.vehicleId
    if (id && id !== prev) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(
        new THREE.Quaternion(...sim.entityTransform(id).rotation),
      )
      yaw = Math.atan2(-fwd.x, -fwd.z)
    }
  }
})
window.addEventListener('keyup', (e) => keys.delete(e.code))
window.addEventListener('blur', () => {
  keys.clear()
  sim?.setInput(idleInput())
})
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement) keys.clear()
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
  const pad =
    [...navigator.getGamepads()].find((p) => p?.connected && p.mapping === 'standard') ?? null
  if (pad?.index !== previousPadIndex) previousButtons = []
  previousPadIndex = pad?.index ?? null
  if (!pad) return null
  const pressed = (i: number) => Boolean(pad.buttons[i]?.pressed && !previousButtons[i])
  if (sim) {
    if (pressed(0)) toast(sim.interact())
    if (pressed(1)) {
      cycleCamera()
    }
    if (pressed(2)) toast(sim.toggleDock())
    if (pressed(3)) toast(sim.toggleFlight())
    if (pressed(4)) {
      toast(sim.transferControls())
      cameraMode = 'chase'
    }
  }
  previousButtons = pad.buttons.map((b) => b.pressed)
  return pad
}
function currentInput(pad: Gamepad | null = null) {
  if (
    !studioInput.acceptsInput ||
    !document.hasFocus() ||
    document.hidden ||
    document.querySelector('.app-menu:popover-open, dialog[open]')
  )
    return idleInput()
  const id = sim?.player.vehicleId
  const flight = Boolean(id && sim?.vehicleInfo(id).flightMode)
  const axis = (positive: string, negative: string) =>
    Number(keys.has(positive)) - Number(keys.has(negative))
  const analog = pad
    ? gamepadAxes(pad, flight)
    : { forward: 0, right: 0, lift: 0, turn: 0, brake: false }
  const touch = portalControls.flightInput()
  return {
    forward:
      (flight
        ? axis('ArrowUp', 'ArrowDown')
        : axis('KeyW', 'KeyS') + axis('ArrowUp', 'ArrowDown')) +
      analog.forward +
      touch.forward,
    right:
      (flight
        ? axis('ArrowRight', 'ArrowLeft')
        : axis('KeyD', 'KeyA') + axis('ArrowRight', 'ArrowLeft')) +
      analog.right +
      touch.right,
    lift: (flight ? axis('KeyW', 'KeyS') : 0) + analog.lift + touch.lift,
    turn: (flight ? axis('KeyD', 'KeyA') : 0) + analog.turn + touch.turn,
    yaw,
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || Boolean(pad?.buttons[10]?.pressed),
    jump: false,
    brake: keys.has('Space') || analog.brake || touch.brake,
  }
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
let playerInterior: string | null = null
let portalSequence = 0
let previous = performance.now()
const frameTimes: number[] = []
let performanceText = ''
let nextPerformanceReadout = 0
renderer.info.autoReset = false
function frame(now: number): void {
  const frameStart = performance.now()
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
  if (sim) {
    const pad = pollGamepad()
    if (playerInterior !== sim.player.interiorId) {
      playerInterior = sim.player.interiorId
      yaw = sim.player.yaw
    }
    sim.setInput(currentInput(pad))
    const physicsStart = performance.now()
    sim.step(document.hidden || playTransition ? 0 : dt)
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
    const crossing = sim.portalEvent
    if (crossing && crossing.sequence !== portalSequence) {
      portalSequence = crossing.sequence
      if (crossing.actorId === sim.player.vehicleId || crossing.actorId === 'player') {
        if (crossing.actorId === 'player') yaw = sim.player.yaw
        else yaw += crossing.yawDelta
        drivingTelemetry.update(sim.player.vehicleId, sim.player.speed, 0, dt, true)
        renderer.domElement.dataset.portalCrossings = String(crossing.sequence)
        toast(
          crossing.blocked
            ? 'Paso bloqueado: comprueba el tamaño, el sentido y la salida'
            : 'Stargate atravesado',
        )
      }
    }
    if (headVehicle !== sim.player.vehicleId) {
      headVehicle = sim.player.vehicleId
      headYaw = 0
      headPitch = 0.05
    }
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
    if (playerInterior !== sim.player.interiorId) {
      playerInterior = sim.player.interiorId
      yaw = sim.player.yaw
    }
    const p = { ...sim.player, position: sim.renderPlayerPosition }
    const cockpit = cameraMode === 'cockpit'
    const overhead = cameraMode === 'map' && !!p.vehicleId
    const playerFrame = sim.playerFrame
    const playerFrameQ = new THREE.Quaternion(...(playerFrame?.rotation ?? ([0, 0, 0, 1] as const)))
    camera.up.set(0, 1, 0).applyQuaternion(playerFrameQ)
    renderer.domElement.dataset.interior = p.interiorId ?? ''
    renderer.domElement.dataset.cameraMode = p.vehicleId
      ? cameraMode
      : firstPerson
        ? 'first-person'
        : 'chase'
    document.querySelector('.caption-tag')!.textContent = overhead
      ? 'CENITAL · N ↑'
      : cockpit && p.vehicleId
        ? 'CONDUCTOR'
        : !p.vehicleId && firstPerson
          ? 'PRIMERA PERSONA'
          : 'PERSPECTIVA'
    const geoPoint = view.document.geography
      ? localToGeo(view.document.geography, p.position)
      : null
    const altitude = geoPoint
      ? geoPoint.altitude - view.document.geography!.altitude
      : p.position[1]
    const info = p.vehicleId ? sim.vehicleInfo(p.vehicleId, true) : null
    drivingTelemetry.update(p.vehicleId, p.speed, info?.turnRate ?? 0, dt)
    const fov = (cockpit && info) || (!p.vehicleId && firstPerson) ? 70 : 48
    if (camera.fov !== fov) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
    const vehicleForward = info
      ? new THREE.Vector3(0, 0, -1).applyQuaternion(
          new THREE.Quaternion(...sim.entityTransform(p.vehicleId!, true).rotation),
        )
      : new THREE.Vector3(0, 0, -1)
    if (info && !info.flightMode && !cockpit) {
      const wanted = Math.atan2(-vehicleForward.x, -vehicleForward.z)
      yaw = followDrivingHeading(
        yaw,
        wanted,
        drivingTelemetry.turnRate,
        drivingTelemetry.speed,
        dt,
        now - lastLookTime,
      )
    } else if (info && p.speed > 1 && now - lastLookTime > 1400 && !cockpit) {
      const wanted = Math.atan2(-vehicleForward.x, -vehicleForward.z)
      yaw +=
        Math.atan2(Math.sin(wanted - yaw), Math.cos(wanted - yaw)) *
        (1 - Math.exp(-2 * Math.min(dt, 0.1)))
    }
    const target: Vec3Tuple = [
      p.position[0],
      p.position[1] + (info?.isCarrier ? 1 : 0.55),
      p.position[2],
    ]
    if (p.interiorId) {
      const anchor = new THREE.Vector3(0, 0.55, 0)
        .applyQuaternion(playerFrameQ)
        .add(new THREE.Vector3(...p.position))
      target.splice(0, 3, ...anchor.toArray())
    }
    if (!p.vehicleId && firstPerson) {
      camera.position.fromArray(p.position)
      camera.quaternion
        .copy(playerFrameQ)
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, yaw, 0, 'YXZ')))
    } else if (overhead) {
      camera.up.set(0, 0, -1)
      camera.position.set(p.position[0], p.position[1] + mapHeight, p.position[2])
      camera.lookAt(...p.position)
      renderer.domElement.dataset.mapHeight = String(Math.round(mapHeight))
    } else if (cockpit && info) {
      const head = driverHeadPose(
        info.driver,
        sim.entityTransform(p.vehicleId!, true).rotation,
        info.isCarrier,
        headYaw,
        headPitch,
      )
      camera.position.copy(head.position)
      camera.quaternion.copy(head.quaternion)
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(head.quaternion)
      yaw = Math.atan2(-forward.x, -forward.z)
    } else {
      if (info && !info.isCarrier) {
        const ahead =
          Math.min(3.5, drivingTelemetry.speed * 0.14) *
          THREE.MathUtils.smoothstep(now - lastLookTime, 900, 1400)
        target[0] += vehicleForward.x * ahead
        target[2] += vehicleForward.z * ahead
      }
      const distance =
        (info?.cameraDistance ?? 5.5) *
        (1 + 2 * THREE.MathUtils.smoothstep(altitude, 50000, 2000000))
      const travelPitch =
        now - lastLookTime > 10000
          ? Math.max(pitch, THREE.MathUtils.smoothstep(altitude, 1000, 500000) * 1.56)
          : pitch
      const desired: Vec3Tuple = [
        target[0] + Math.sin(yaw) * distance * Math.cos(travelPitch),
        target[1] + 0.8 + Math.sin(travelPitch) * distance,
        target[2] + Math.cos(yaw) * distance * Math.cos(travelPitch),
      ]
      if (p.interiorId) {
        const offset = new THREE.Vector3(...desired)
          .sub(new THREE.Vector3(...target))
          .applyQuaternion(playerFrameQ)
          .add(new THREE.Vector3(...target))
        desired.splice(0, 3, ...offset.toArray())
      }
      camera.position.fromArray(sim.cameraPosition(target, desired))
      camera.lookAt(...target)
    }
    $('player-mode').textContent = p.vehicleId
      ? view.document.entities.find((e) => e.id === p.vehicleId)!.name.toUpperCase() +
        (info?.dockedTo ? ' · SUJETO' : '') +
        (info?.flightMode ? ' · VUELO' : '')
      : p.interiorId
        ? 'MONITOR · INTERIOR DE LA NAVE'
        : 'MONITOR · VUELO'
    $('speed').textContent = p.vehicleId
      ? `${Math.round(p.speed * 3.6)} km/h`
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
    $('interaction').textContent = p.vehicleId
      ? info?.dockedTo
        ? 'F soltar · T conducir container · C cámara'
        : info?.isCarrier
          ? info.flightMode
            ? 'W/S altura · A/D giro · Flechas inclinar · Shift viaje'
            : 'V vuelo · T volver al A3 · C cámara · E salir'
          : sim.dockingCandidate()
            ? 'F sujetar al suelo del garaje · C cámara'
            : 'E salir · C cámara · F sujetar dentro del garaje'
      : near
        ? 'E para entrar en ' + view.document.entities.find((e) => e.id === near)!.name
        : 'WASD volar · Espacio saltar · C cámara · Clic disparar'
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
      )
      streamSample = { at: now, position }
    }
    const object = view.objects.get(selectedId)
    outline.update(object, selectedGeometry)
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
    renderOrigin,
    cameraMode === 'cockpit',
  )
  sidearm.visible = !!sim && !sim.player.vehicleId && weaponDrawn
  if (fireRequested && sim && sidearm.visible && document.hasFocus() && !document.hidden) {
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    if (sidearm.fire(now)) {
      // Preserve camera-to-monitor obstruction checks before transporting a shot through a window.
      const aimed = sim.shoot(camera.position.toArray(), direction.toArray(), 150, 0)
      const origin = new THREE.Vector3(...sim.renderPlayerPosition)
      const destination = aimed
        ? new THREE.Vector3(...aimed.point)
        : camera.position.clone().addScaledVector(direction, 150)
      const firing = camera.clone()
      if (!firstPerson) {
        firing.position.copy(origin)
        firing.lookAt(destination)
      }
      firing.updateMatrixWorld(true)
      sidearm.impact(gallery.shoot(sim, view, firing))
      renderer.domElement.dataset.impacts = String(view.impacts.count)
    }
  }
  let flightLevel = 0,
    flightSpeed = 0
  if (sim)
    for (const e of view.document.entities) {
      if (!e.vehicle?.flight) continue
      const info = sim.vehicleInfo(e.id)
      if (!info.flightMode) continue
      const p = sim.entityTransform(e.id, true).position
      const distance = camera.position.distanceTo(new THREE.Vector3(...p))
      const level =
        sim.player.vehicleId === e.id || sim.player.interiorId === e.id
          ? 0.55
          : Math.max(0, 1 - distance / 100)
      if (level > flightLevel) {
        flightLevel = level
        flightSpeed = info.speedKmh
      }
    }
  flightAudio.update(flightLevel, flightSpeed)
  fireRequested = false
  const worldCamera = camera.position.clone()
  const position = sim?.player.position ?? camera.position.toArray()
  renderOrigin.set(0, 0, 0)
  if (sim && new THREE.Vector3(...position).length() > 10000) renderOrigin.fromArray(position)
  water?.update(worldCamera, renderOrigin, performanceSettings.distance, now)
  renderer.domElement.dataset.waterTiles = String(water?.tiles ?? 0)
  view.buildingDistance =
    performanceSettings.preset === 'ultra' ? 20000 : Math.min(3000, performanceSettings.distance)
  geography.viewDistance = worldStream
    ? Math.max(10000, performanceSettings.distance)
    : performanceSettings.distance
  const height = geography.update(worldCamera.toArray(), renderOrigin, skyClock)
  worldStream?.renderUpdate(renderOrigin, !!performanceSettings.buildings, sim)
  if (worldStream) $('world-note').textContent = worldStream.status
  view.root.position.copy(renderOrigin).negate()
  camera.position.sub(renderOrigin)
  if (view.document.geography) {
    const gps = localToGeo(view.document.geography, position)
    $('gps-status').textContent =
      `${gps.latitude.toFixed(5)}°, ${gps.longitude.toFixed(5)}° · ${height > 1000 ? (height / 1000).toFixed(1) + ' km' : height.toFixed(0) + ' m'}`
    $('map-status').textContent = geography.status
    renderer.domElement.dataset.geoLevel =
      height > 100000 ? 'space' : height > 250 ? 'map' : 'local'
    scene.background = null
    const air = geography.atmosphere
    ambientFill.intensity = 0.22 * air.day * (1 - air.space)
    water?.setSun(geography.sunDirection, air.day)
    scene.fog = air.space >= 1 ? null : new THREE.Fog(air.color, air.near, air.far)
    const lightDirection = geography.sunDirection
    sun.position.copy(lightDirection).multiplyScalar(65)
    sun.intensity = geography.sunDirection.y > 0 ? 3.2 * air.day : 0
    sun.color.set(air.day > 0.05 ? '#fff0d8' : '#b8ccff')
    sunDirection.copy(lightDirection).negate()
    shadowManager.setLightDirection(sunDirection)
    shadowManager.setLightIntensity(sun.intensity)
    shadowManager.setLightColor(sun.color)
    renderer.domElement.dataset.skyPhase =
      air.day > 0.8 ? 'day' : air.day < 0.1 ? 'night' : 'twilight'
    $('sky-status').textContent =
      `${skyClock.mode === 'live' ? 'Tiempo real' : 'Hora fija'} · ${skyTime(skyClock).toLocaleString()}`
    camera.far = worldStream
      ? Math.hypot(Math.max(12000, performanceSettings.distance + 500), Math.max(0, height))
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
      : new THREE.Fog('#a6bbd5', 70, 160)
    $('gps-status').textContent = 'Sin ubicación · configura el punto GPS'
    $('map-status').textContent = ''
  }
  view.streetlights.update(
    camera.position,
    !!view.document.geography && geography.atmosphere.day < 0.15,
  )
  // Cascade reach is already camera-relative. Geographic elevation must not
  // disable shadows on high ground or after traveling to another origin.
  const shadowsActive = performanceSettings.shadows > 0
  sun.visible = !shadowsActive
  for (const light of shadowManager.lights) light.visible = shadowsActive
  renderer.domElement.dataset.shadowCascades = String(
    shadowsActive ? shadowManager.lights.length : 0,
  )
  if (sim || needsRender) {
    const outlineVisible = outline.visible
    outline.visible = false
    const mirrorVehicle =
      cameraMode === 'cockpit' && !document.hidden ? (sim?.player.vehicleId ?? null) : null
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
    renderer.autoClear = true
    if (geography.enabled) {
      geography.render(renderer, camera, worldCamera)
      renderer.autoClear = false
      renderer.clearDepth()
    }
    shadowManager.update(camera, renderOrigin)
    portalControls.prepare(camera)
    renderer.shadowMap.needsUpdate = shadowsActive
    renderer.render(scene, camera)
    portalControls.finish()
    sidearm.render(renderer, now, camera.aspect, firstPerson)
    needsRender = view.pendingBuildingBatches || !!remotePortalViews?.pending
  }
  camera.position.copy(worldCamera)
  if (now >= nextPerformanceReadout) {
    nextPerformanceReadout = now + 500
    if (sim && view.document.geography && $('properties').querySelector('#entity-geography')) {
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
    const sorted = [...frameTimes].sort((a, b) => a - b)
    const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] || 0
    const cpu = performance.now() - frameStart
    performanceText = `${p95.toFixed(0)} ms P95 · CPU ${cpu.toFixed(1)} ms · Física ${physicsMs.toFixed(1)} ms · Última zona ${lastWorldInstallMs.toFixed(0)} ms · ${renderer.info.render.calls} dibujos · ${(renderer.info.render.triangles / 1000).toFixed(0)}k triángulos`
    renderer.domElement.dataset.drawCalls = String(renderer.info.render.calls)
    renderer.domElement.dataset.frameP95 = p95.toFixed(1)
  }
}
function applyLocation(latitude: number, longitude: number): void {
  $<HTMLSelectElement>('travel-city').value = ''
  $<HTMLInputElement>('travel-latitude').value = String(latitude)
  $<HTMLInputElement>('travel-longitude').value = String(longitude)
  void travelTo()
}

function setSkyClock(clock: SkyClock): void {
  action(() => {
    editor.load({ ...editor.document, sky: clock })
    refreshUi()
    needsRender = true
  })
}
$('sky-apply').onclick = () => {
  const time = new Date($<HTMLInputElement>('sky-time').value)
  if (!Number.isFinite(time.getTime())) {
    toast('Introduce una fecha y hora válidas')
    return
  }
  setSkyClock({ mode: 'fixed', at: time.toISOString() })
}
$('sky-live').onclick = () => setSkyClock({ mode: 'live' })
$('apply-location').onclick = () =>
  applyLocation(
    Number($<HTMLInputElement>('latitude').value),
    Number($<HTMLInputElement>('longitude').value),
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
$('locate').onclick = locate
setupWorldStream()
refreshUi()
if (circuitMode && !localStorage.getItem('nabla.location.requested')) {
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

$('css-screen-demo').onclick = () => {
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
}

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
$('map-cache-persist').onclick = async () => {
  try {
    const granted = await navigator.storage.persist()
    $('map-cache-storage').textContent = granted
      ? 'Almacenamiento persistente concedido. Borrar los datos del sitio elimina también esta copia.'
      : 'El navegador no ha concedido persistencia; la caché sigue funcionando y puede ser liberada por él.'
  } catch {
    $('map-cache-storage').textContent = 'Persistencia no disponible en este navegador.'
  }
}
$('map-cache-clear').onclick = async () => {
  try {
    await clearMapCache()
    await refreshMapCacheUi()
  } catch {
    toast('No se pudo vaciar la caché')
  }
}
$('options-menu').addEventListener('toggle', () => {
  if ($('options-menu').matches(':popover-open')) void refreshMapCacheUi()
})
void refreshMapCacheUi()

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

$('save-as').onclick = () => {
  $<HTMLInputElement>('project-filename').value = projectFilename(project!.name)
  $('file-menu').hidePopover()
  keys.clear()
  if (document.pointerLockElement) document.exitPointerLock()
  $<HTMLDialogElement>('save-project-dialog').showModal()
}
$('save-project-cancel').onclick = () => $<HTMLDialogElement>('save-project-dialog').close()
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
    toast(`Archivo preparado: ${filename} · ${snapshot.locations.length} lugares`)
  })
}

$('project-place-open').onclick = () => {
  void openProjectPlace($<HTMLSelectElement>('project-places').value)
}
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
    focusSelection()
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
        upgradeReferenceScene(
          createPlanetScene(
            { latitude: 43.32969, longitude: -1.819606, altitude: 0 },
            'Irún · Ventas',
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
    project = result.project
    recoverLegacyPlaces = !storedProject
    editor = SceneEditor.fromValidated(result.scene, performanceSettings.preset === 'ultra')
    savedDocument = result.saved
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
    renderer.domElement.dataset.startup = 'ready'
    finishStartup()
    if (freshWorld) {
      renderer.domElement.dataset.world = 'irun'
      focusSelection()
      void placeNewWorldObjects()
    }
    if (new URLSearchParams(location.search).get('world') === 'geoeuskadi') void loadIrun(true)
    else if (
      !freshWorld &&
      !circuitMode &&
      !storedProject &&
      (!storedScene || !localStorage.getItem('nabla.irun.introduced'))
    )
      void loadIrun()
  } catch (error) {
    startupPending = false
    loadingWorld = false
    refreshUi()
    renderer.domElement.dataset.startup = 'failed'
    finishStartup()
    toast('No se pudo abrir el proyecto. Tu copia guardada se conserva. ' + String(error))
  }
}
