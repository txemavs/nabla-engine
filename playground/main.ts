import { treeSprite } from '../src/vegetation.js'
import { createGallery, Gallery } from './gallery.js'
import { alignCircuitPlan } from '../src/circuit-plan.js'
import { PortalControls } from './portal-controls.js'
import { upgradeReferenceScene } from './scene-upgrades.js'
import { Sidearm } from './sidearm.js'
import { driverHeadPose, followDrivingHeading, DrivingTelemetry } from './driving-camera.js'
import { createPortalPair } from '../src/portal.js'
import { renderPortals } from './portals.js'
import { skyTime, localTimeInput, type SkyClock } from '../src/sky.js'
import { GeographicView } from './geography.js'
import { localToGeo, MADRID } from '../src/geography.js'
import { gamepadAxes } from './input.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { TransformControls } from 'three/addons/controls/TransformControls.js'
import {
  SceneEditor,
  SceneGraph,
  Simulation,
  createSampleScene,
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
const STORAGE_KEY = 'nabla.scene.v1'
let editor = new SceneEditor(upgradeReferenceScene(createSampleScene()))
let loadError = ''
try {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) editor = new SceneEditor(upgradeReferenceScene(JSON.parse(saved)))
  if (editor.document.entities.some((e) => e.id === 'road' && e.size[0] === 16 && e.size[2] === 85))
    editor.load(alignCircuitPlan(editor.document))
} catch {
  loadError = 'La escena guardada no es válida. Se ha abierto el ejemplo.'
}
let savedDocument = editor.serialize()
const collapsed = new Set(
  editor.document.entities.filter((e) => e.kind === 'group').map((e) => e.id),
)
let selectedId =
  editor.document.entities.find((e) => e.kind === 'vehicle')?.id ?? editor.document.entities[0].id
let sim: Simulation | null = null
let needsRender = true
let firstPerson = true
let fireRequested = false
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
let toastTimer: ReturnType<typeof setTimeout>
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
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.35
viewport.prepend(renderer.domElement)
renderer.domElement.setAttribute('aria-label', 'Vista 3D de la escena')
const scene = new THREE.Scene()
scene.background = new THREE.Color('#a6bbd5')
scene.fog = new THREE.Fog('#a6bbd5', 70, 160)
const environment = new RoomEnvironment()
const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(environment, 0.04).texture
scene.environmentIntensity = 0.4
environment.dispose()
pmrem.dispose()
const hemisphere = new THREE.HemisphereLight('#edf4ff', '#657a99', 2.5)
scene.add(hemisphere)
const sun = new THREE.DirectionalLight('#ffe1b1', 3.2)
sun.position.set(-25, 45, 25)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
sun.shadow.camera.left = -55
sun.shadow.camera.right = 55
sun.shadow.camera.top = 55
sun.shadow.camera.bottom = -55
sun.shadow.camera.far = 150
sun.shadow.normalBias = 0.035
scene.add(sun)
const grid = new THREE.GridHelper(100, 100, '#9eb9ae', '#829b93')
grid.position.y = 0.035
;(grid.material as THREE.Material).opacity = 0.18
;(grid.material as THREE.Material).transparent = true
scene.add(grid)
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 250)
camera.position.set(10, 5, 12)
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
gizmo.setSpace('world')
gizmo.setSize(0.8)
scene.add(gizmo.getHelper())
gizmo.addEventListener('change', () => {
  needsRender = true
})
const outline = new THREE.Box3Helper(new THREE.Box3(), new THREE.Color('#f2ce8a'))
scene.add(outline)
let view = new SceneView(editor.document)
scene.add(view.root)
let geography = new GeographicView(
  editor.document,
  () => {
    needsRender = true
  },
  true,
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
        renderer.domElement.dataset.assets = 'loaded'
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
    const entity = editor.document.entities.find((e) => e.id === selectedId)!
    const graph = new SceneGraph(editor.document)
    editor.update(selectedId, {
      transform: graph.localFromWorld(entity.parentId, {
        position: object.position.toArray(),
        rotation: object.quaternion.clone().normalize().toArray(),
      }),
    })
    rebuild()
  })
})
function rebuild(): void {
  gizmo.detach()
  if (JSON.stringify(view.document.geography) !== JSON.stringify(editor.document.geography)) {
    geography.dispose()
    geography = new GeographicView(
      editor.document,
      () => {
        needsRender = true
      },
      true,
    )
    scene.add(geography.tiles)
  }
  view.dispose()
  view = new SceneView(editor.document)
  scene.add(view.root)
  watchAssets(view)
  if (!view.objects.has(selectedId)) selectedId = editor.document.entities[0].id
  refreshUi()
}
function select(id: string): void {
  selectedId = id
  refreshUi()
}
function refreshUi(): void {
  needsRender = true
  const doc = editor.document
  $('scene-name').textContent = doc.name
  skyClock = doc.sky ?? { mode: 'live' }
  $<HTMLInputElement>('sky-time').value = localTimeInput(skyTime(skyClock))
  $('sky-live').classList.toggle('active', skyClock.mode === 'live')
  $('sky-zone').textContent = 'Hora local · ' + Intl.DateTimeFormat().resolvedOptions().timeZone
  const geo = doc.geography ?? MADRID
  $<HTMLInputElement>('latitude').value = String(geo.latitude)
  $<HTMLInputElement>('longitude').value = String(geo.longitude)
  $<HTMLSelectElement>('imagery').value = doc.geography?.imagery ?? 'satellite'
  for (const id of ['latitude', 'longitude', 'imagery', 'apply-location', 'locate'])
    $<HTMLInputElement>(id).disabled = Boolean(sim)
  $('entity-count').textContent = String(doc.entities.length)
  $('status').textContent =
    editor.serialize() === savedDocument ? 'Guardado local' : 'Cambios sin guardar'
  const tree = $('tree')
  tree.replaceChildren()
  const icons = { box: '◇', vehicle: '▰', spawn: '◎', group: '▱' }
  function append(parent: string | null, depth: number): void {
    for (const e of doc.entities.filter((item) => item.parentId === parent)) {
      const button = document.createElement('button')
      button.className = 'tree-item' + (e.id === selectedId ? ' selected' : '')
      button.setAttribute('role', 'treeitem')
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
  const e = doc.entities.find((item) => item.id === selectedId)!
  const props = $('properties')
  const angles = toDegrees(e.transform.rotation)
  function row(label: string, key: string, values: number[]): string {
    return `<label class="field-label">${label}</label><div class="axis-row">${values.map((n, i) => `<label><span>${'XYZ'[i]}</span><input aria-label="${label} ${'XYZ'[i]}" data-vector="${key}" data-axis="${i}" type="number" step="${key === 'rotation' ? '1' : '0.1'}" value="${Number(n.toFixed(3))}"></label>`).join('')}</div>`
  }
  props.innerHTML = `<div class="entity-title">${escape(e.name)}</div><div class="entity-type">${{ box: 'Geometría · bloque', vehicle: 'Vehículo · cuatro ruedas', spawn: 'Inicio del jugador', group: 'Grupo de objetos' }[e.kind]}</div>
    <label class="field-label" for="name">Nombre</label><input id="name" value="${escape(e.name)}" maxlength="100">
    ${row('Posición local · m', 'position', e.transform.position)}${row('Rotación local · °', 'rotation', angles)}
    ${e.kind === 'box' || e.kind === 'vehicle' || e.sprite ? row('Dimensiones · m', 'size', e.size) : ''}
    <label class="field-label" for="color">Color</label><input id="color" type="color" value="${e.color}">
    <label class="field-label" for="parent">Padre</label><select id="parent"><option value="">Mundo</option>${doc.entities
      .filter((item) => item.id !== e.id && item.kind !== 'spawn')
      .map(
        (item) =>
          `<option value="${escape(item.id)}" ${e.parentId === item.id ? 'selected' : ''}>${escape(item.name)}</option>`,
      )
      .join('')}</select>
    ${e.kind === 'box' ? `<label class="field-label" for="motion">Física</label><select id="motion"><option value="static">Fijo</option><option value="dynamic">Móvil</option><option value="none">Solo visual</option></select>` : ''}
    ${e.motion === 'dynamic' ? `<label class="field-label" for="mass">Masa · kg</label><input id="mass" type="number" min="0.1" step="1" value="${e.mass}">` : ''}
    <div class="property-actions"><button id="duplicate">Duplicar</button><button id="delete">Eliminar</button></div>`
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
    controls.innerHTML = `<label class="field-label" for="portal-mode">Stargate · conexión</label><select id="portal-mode"><option value="closed">Cerrado</option><option value="window">Ventana</option><option value="open">Paso abierto</option></select><p>La conexión cambia en ambos extremos.</p>`
    controls.insertAdjacentHTML(
      'afterbegin',
      `<label class="field-label" for="portal-destination">Destino del Stargate</label><select id="portal-destination"><option value="">Sin enlace</option>${doc.entities
        .filter((item) => item.portal && item.id !== e.id)
        .map((item) => `<option value="${escape(item.id)}">${escape(item.name)}</option>`)
        .join('')}</select>`,
    )
    props.append(controls)
    $<HTMLSelectElement>('portal-destination').value = e.portal.pairId ?? ''
    $('portal-destination').onchange = () =>
      action(() => {
        editor.linkPortals(e.id, $<HTMLSelectElement>('portal-destination').value || null)
        rebuild()
      })
    $<HTMLSelectElement>('portal-mode').value = e.portal.mode
    $('portal-mode').onchange = () =>
      action(() => {
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
          ...(key === 'rotation' ? angles : key === 'size' ? e.size : e.transform.position),
        ] as Vec3Tuple
        values[axis] = input.valueAsNumber
        if (key === 'size') editor.update(e.id, { size: values })
        else
          editor.update(e.id, {
            transform: {
              ...e.transform,
              [key]: key === 'rotation' ? rotationDegrees(...values) : values,
            },
          })
        rebuild()
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
      el.disabled = sim !== null
    })
  if (!sim) {
    $<HTMLInputElement>('color').disabled = !!e.visual
    $<HTMLButtonElement>('duplicate').disabled = e.kind === 'spawn'
    $<HTMLButtonElement>('delete').disabled = e.kind === 'spawn'
    $<HTMLSelectElement>('parent').disabled =
      e.kind === 'spawn' || e.motion === 'dynamic' || !!e.portal
    gizmo.attach(view.objects.get(e.id)!)
  }
  $<HTMLButtonElement>('undo').disabled = !!sim || !editor.canUndo
  $<HTMLButtonElement>('redo').disabled = !!sim || !editor.canRedo
  for (const id of [
    'add-box',
    'add-car',
    'add-group',
    'add-sprite',
    'sample-gallery',
    'translate',
    'rotate',
    'import',
    'sample-assets',
    'sample-portals',
    'focus',
  ])
    $<HTMLButtonElement>(id).disabled = !!sim
}
function setTool(mode: 'translate' | 'rotate'): void {
  if (sim) return
  gizmo.setMode(mode)
  $('translate').classList.toggle('active', mode === 'translate')
  $('rotate').classList.toggle('active', mode === 'rotate')
}
$('translate').onclick = () => setTool('translate')
$('rotate').onclick = () => setTool('rotate')
$('undo').onclick = () => {
  editor.undo()
  rebuild()
}
$('redo').onclick = () => {
  editor.redo()
  rebuild()
}
for (const [id, kind] of [
  ['add-box', 'box'],
  ['add-car', 'vehicle'],
  ['add-group', 'group'],
] as const) {
  $(id).onclick = () =>
    action(() => {
      selectedId = editor.add(kind)
      rebuild()
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
    editor.load(upgradeReferenceScene(createSampleScene()))
    selectedId = 'car-a'
    rebuild()
    view.ready.then(focusSelection).catch(() => undefined)
    toast('A3 y container listos. Puedes deshacer para volver a tu escena.')
  })
$('add-sprite').onclick = () =>
  action(() => {
    const doc = editor.document
    const sprite = createEntity(crypto.randomUUID(), 'group')
    sprite.name = 'Sprite · árbol'
    sprite.size = [7, 7, 0.1]
    sprite.sprite = treeSprite(0)
    doc.entities.push(sprite)
    editor.load(doc)
    selectedId = sprite.id
    rebuild()
  })
$('sample-gallery').onclick = () =>
  action(() => {
    const doc = editor.document
    const entities = createGallery(crypto.randomUUID())
    doc.entities.push(...entities)
    editor.load(doc)
    selectedId = entities[0].id
    rebuild()
    toast('Galería añadida · dispara por la ventana · N reinicia la ronda')
  })
$('sample-portals').onclick = () =>
  action(() => {
    const next = editor.document
    const ids = [crypto.randomUUID(), crypto.randomUUID()]
    next.entities.push(...createPortalPair(ids[0], ids[1]))
    editor.load(next)
    selectedId = ids[0]
    collapsed.delete(ids[0])
    rebuild()
    view.ready.then(focusSelection).catch(() => undefined)
    toast('Dos Stargates añadidos. El A3 tiene el primero delante; puedes moverlos o deshacer.')
  })
$('welcome-close').onclick = () => {
  $('welcome').hidden = true
}
$('save').onclick = () =>
  action(() => {
    localStorage.setItem(STORAGE_KEY, editor.serialize())
    savedDocument = editor.serialize()
    $('status').textContent = 'Guardado local'
    toast('Escena guardada en este navegador')
  })
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
  const file = $<HTMLInputElement>('file').files?.[0]
  if (!file) return
  if (file.size > 2_000_000) {
    toast('La escena supera el límite de 2 MB')
    return
  }
  try {
    editor.load(upgradeReferenceScene(JSON.parse(await file.text())))
    rebuild()
    toast('Escena abierta')
  } catch {
    toast('Archivo no válido. La escena actual se conserva.')
  }
  $<HTMLInputElement>('file').value = ''
}
function togglePlay(): void {
  action(() => {
    keys.clear()
    if (sim) {
      sim.dispose()
      sim = null
      document.exitPointerLock()
      camera.up.set(0, 1, 0)
      document.querySelector('.caption-tag')!.textContent = 'PERSPECTIVA'
      camera.fov = 48
      camera.updateProjectionMatrix()
      camera.position.copy(orbitStartPosition)
      orbit.target.copy(orbitStartTarget)
      orbit.enabled = true
      rebuild()
    } else {
      orbitStartPosition = camera.position.clone()
      orbitStartTarget = orbit.target.clone()
      portalControls.rebuild(editor.document)
      sim = new Simulation(editor.document, { playerMode: 'hover' })
      firstPerson = true
      fireRequested = false
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
    $('play').innerHTML = sim ? '■ Detener <kbd>Tab</kbd>' : '▶ Jugar <kbd>Tab</kbd>'
    $('mode-label').textContent = sim ? 'Jugando' : 'Edición'
    $('game-hud').hidden = !sim
    $('view-hint').textContent = sim
      ? 'Clic para mirar con el ratón · E entrar / salir · Tab detener'
      : 'Arrastra para orbitar · Rueda para acercar · Clic para seleccionar'
    $('footer-mode').textContent = sim
      ? 'Simulación compartida · 60 Hz'
      : 'Edición · metros · Y arriba'
    grid.visible = !sim
    outline.visible = !sim
  })
}
$('play').onclick = togglePlay
const portalControls = new PortalControls(viewport, toast)
portalControls.rebuild(editor.document)
const gallery = new Gallery(viewport)
const sidearm = new Sidearm(viewport)
const raycaster = new THREE.Raycaster()
let down = new THREE.Vector2()
renderer.domElement.addEventListener('pointerdown', (e) => {
  down.set(e.clientX, e.clientY)
  if (
    e.button === 0 &&
    sim &&
    !sim.player.vehicleId &&
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
  raycaster.setFromCamera(
    new THREE.Vector2(
      ((e.clientX - bounds.left) / bounds.width) * 2 - 1,
      (-(e.clientY - bounds.top) / bounds.height) * 2 + 1,
    ),
    camera,
  )
  const hits = raycaster.intersectObjects([...view.objects.values()], true)
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
  if ((e.target as HTMLElement)?.matches('input,select,textarea,[contenteditable]')) return
  if (e.code === 'Tab') {
    e.preventDefault()
    if (!e.repeat) togglePlay()
    return
  }
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
    e.preventDefault()
    $('save').click()
    return
  }
  if (!sim) {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault()
      if (e.shiftKey) editor.redo()
      else editor.undo()
      rebuild()
    }
    if (e.code === 'KeyF') focusSelection()
    if (e.code === 'KeyG') setTool('translate')
    if (e.code === 'KeyR') setTool('rotate')
    return
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
    e.preventDefault()
  if (e.code === 'KeyR' && !e.repeat) {
    togglePlay()
    togglePlay()
    toast('Partida reiniciada')
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
  if (!document.hasFocus() || document.hidden) {
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
  if (!document.hasFocus() || document.hidden) return idleInput()
  const id = sim?.player.vehicleId
  const flight = Boolean(id && sim?.vehicleInfo(id).flightMode)
  const axis = (positive: string, negative: string) =>
    Number(keys.has(positive)) - Number(keys.has(negative))
  const analog = pad
    ? gamepadAxes(pad, flight)
    : { forward: 0, right: 0, lift: 0, turn: 0, brake: false }
  return {
    forward:
      (flight
        ? axis('ArrowUp', 'ArrowDown')
        : axis('KeyW', 'KeyS') + axis('ArrowUp', 'ArrowDown')) + analog.forward,
    right:
      (flight
        ? axis('ArrowRight', 'ArrowLeft')
        : axis('KeyD', 'KeyA') + axis('ArrowRight', 'ArrowLeft')) + analog.right,
    lift: (flight ? axis('KeyW', 'KeyS') : 0) + analog.lift,
    turn: (flight ? axis('KeyD', 'KeyA') : 0) + analog.turn,
    yaw,
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight') || Boolean(pad?.buttons[10]?.pressed),
    jump: false,
    brake: keys.has('Space') || analog.brake,
  }
}
new ResizeObserver(() => {
  const w = viewport.clientWidth,
    h = viewport.clientHeight
  renderer.setSize(w, h)
  camera.aspect = w / Math.max(h, 1)
  camera.updateProjectionMatrix()
  needsRender = true
}).observe(viewport)
let playerInterior: string | null = null
let portalSequence = 0
let previous = performance.now()
function frame(now: number): void {
  const dt = (now - previous) / 1000
  previous = now
  if (sim) {
    const pad = pollGamepad()
    if (playerInterior !== sim.player.interiorId) {
      playerInterior = sim.player.interiorId
      yaw = sim.player.yaw
    }
    sim.setInput(currentInput(pad))
    sim.step(document.hidden ? 0 : dt)
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
    const object = view.objects.get(selectedId)
    if (object) {
      outline.box.setFromObject(object)
      outline.visible = !outline.box.isEmpty()
    }
  }
  gallery.update(view, !!sim, document.hidden ? 0 : dt)
  portalControls.update(sim, view.document, camera)
  sidearm.visible = !!sim && !sim.player.vehicleId
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
    }
  }
  fireRequested = false
  const worldCamera = camera.position.clone()
  const position = sim?.player.position ?? camera.position.toArray()
  renderOrigin.set(0, 0, 0)
  if (sim && new THREE.Vector3(...position).length() > 10000) renderOrigin.fromArray(position)
  const height = geography.update(worldCamera.toArray(), renderOrigin, skyClock)
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
    scene.fog = air.space >= 1 ? null : new THREE.Fog(air.color, air.near, air.far)
    hemisphere.intensity = 0.16 + 2.34 * air.day
    scene.environmentIntensity = 0.025 + 0.375 * air.day
    const lightDirection = air.day > 0.05 ? geography.sunDirection : geography.moonDirection
    sun.position.copy(lightDirection).multiplyScalar(65)
    sun.intensity = air.day > 0.05 ? 3.2 * air.day : 0.22
    sun.color.set(air.day > 0.05 ? '#fff0d8' : '#b8ccff')
    renderer.domElement.dataset.skyPhase =
      air.day > 0.8 ? 'day' : air.day < 0.1 ? 'night' : 'twilight'
    $('sky-status').textContent =
      `${skyClock.mode === 'live' ? 'Tiempo real' : 'Hora fija'} · ${skyTime(skyClock).toLocaleString()}`
    camera.far = Math.max(300, Math.min(100000000, height * 15))
    camera.updateProjectionMatrix()
  } else {
    scene.background = new THREE.Color('#a6bbd5')
    const mapView = sim?.player.vehicleId && cameraMode === 'map'
    camera.far = mapView ? mapHeight * 4 : 300
    camera.updateProjectionMatrix()
    scene.fog = mapView
      ? new THREE.Fog('#a6bbd5', mapHeight * 2, mapHeight * 4)
      : new THREE.Fog('#a6bbd5', 70, 160)
    $('gps-status').textContent = 'Sin ubicación · configura el punto GPS'
    $('map-status').textContent = ''
  }
  sun.castShadow = height < 500
  if (sim || needsRender) {
    const outlineVisible = outline.visible
    outline.visible = false
    renderPortals(view.portals, renderer, scene, camera, (remote) => {
      if (geography.enabled) {
        geography.render(renderer, remote, remote.position.clone().add(renderOrigin))
        renderer.autoClear = false
      }
    })
    outline.visible = outlineVisible
    renderer.autoClear = true
    if (geography.enabled) {
      geography.render(renderer, camera, worldCamera)
      renderer.autoClear = false
      renderer.clearDepth()
    }
    renderer.render(scene, camera)
    sidearm.render(renderer, now, camera.aspect, firstPerson)
    needsRender = false
  }
  camera.position.copy(worldCamera)
  requestAnimationFrame(frame)
}
function applyLocation(latitude: number, longitude: number): void {
  if (sim) {
    toast('Detén la partida para cambiar la ubicación')
    return
  }
  action(() => {
    const doc = editor.document
    doc.geography = {
      latitude,
      longitude,
      altitude: doc.geography?.altitude ?? 0,
      imagery: $<HTMLSelectElement>('imagery').value as 'satellite' | 'streets' | 'offline',
    }
    editor.load(doc)
    rebuild()
    toast('Ubicación aplicada · Guardar para conservarla')
  })
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
refreshUi()
if (!localStorage.getItem('nabla.location.requested')) {
  localStorage.setItem('nabla.location.requested', '1')
  locate()
}
if (loadError) toast(loadError)
requestAnimationFrame(frame)
