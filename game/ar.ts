import { XRMenuGesture } from '@nabla/engine/ar'
import { XRHoop } from '@nabla/engine/xr/hoop'
import { XRBow } from '@nabla/engine/xr/bow'
import bowModel from './recurve-bow-model.js'
import { ARDrone } from '@nabla/engine/experimental/betaflight'
import { hasVehiclePreset, presetVehicle } from '@nabla/engine/vehicles'
import * as THREE from 'three'
import { ARRC } from './ar-rc.js'
import { ARBalls } from './ar-balls.js'
import { ARModel, DEFAULT_MODEL_MANIFEST } from './ar-model.js'
import { ARRoom } from './ar-room.js'
import { GameAR } from '@nabla/engine/ar'
import { XRARWeapons } from '@nabla/engine/ar/weapons'

// Optional embedding in the HeadSet launcher. Standalone ar.html keeps its preview.
let hostSessionChanged: ((active: boolean) => void) | undefined
export function configureARHost(changed: (active: boolean) => void): void {
  hostSessionChanged = changed
}

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')!
const enter = document.querySelector<HTMLButtonElement>('#enter')!
const panel = document.querySelector<HTMLElement>('#panel')!
const status = document.querySelector<HTMLElement>('#status')!
const report = (error: unknown) => {
  status.textContent = String(error)
}
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
renderer.setClearColor(0x000000, 0)
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
const scene = new THREE.Scene()
// No opaque sky, ground, fog or compositor: the XR runtime supplies passthrough.
scene.background = null
scene.add(new THREE.HemisphereLight(0xffffff, 0x647b84, 2))
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(1, 3, 2)
scene.add(sun)
const camera = new THREE.PerspectiveCamera(65, 1, 0.02, 20)
camera.position.set(0, 1.6, 0)
scene.add(camera)
const room = new ARRoom(scene)
// Hosts can serve Atlas through their same-origin tile proxy in every build mode.
const model = new ARModel(scene, (url) => {
  const tiles = import.meta.env.VITE_NABLA_TILES_URL
  if (tiles && url.startsWith('https://atlas.chained.world/euskadi/terraform/'))
    return url.replace('https://atlas.chained.world/euskadi/terraform', tiles.replace(/\/$/, ''))
  return import.meta.env.DEV ? url.replace('https://atlas.chained.world', '/atlas-live') : url
})
model.onStatus = (text) => room.setMessage(text)
const modelSource = document.querySelector<HTMLSelectElement>('#model-source')!
if (!hasVehiclePreset('bmw')) modelSource.querySelector('option[value="bmw"]')?.remove()
const modelUrl = document.querySelector<HTMLInputElement>('#model-url')!
const modelFile = document.querySelector<HTMLInputElement>('#model-file')!
const modelStatus = document.querySelector<HTMLElement>('#model-status')!
const modelLoad = document.querySelector<HTMLButtonElement>('#model-load')!
let modelLoading = false
let modelSelectionChanged = true
modelSource.onchange = () => {
  modelUrl.hidden = modelSource.value !== 'url'
  modelFile.hidden = modelSource.value !== 'file'
  modelSelectionChanged = true
}
modelUrl.oninput = modelFile.onchange = () => {
  modelSelectionChanged = true
}
const loadModel = async () => {
  if (modelLoading) return
  modelLoading = true
  modelLoad.disabled = true
  try {
    if (['vfr', 's3', 'truck', 'bmw', 'f14', 'forklift'].includes(modelSource.value)) {
      await balls.ready
      const kind = modelSource.value
      updateScaleOptions(kind)
      await rc.load(
        kind === 'bmw' ? 's3' : (kind as 'vfr' | 's3' | 'truck' | 'f14' | 'forklift'),
        Number(rcScale.value),
        camera,
        kind === 'bmw' ? [presetVehicle('bmw', 'rc-0')] : undefined,
      )
      if (kind === 's3') rc.simulation?.setEngineMode('rc-0', 'beast')
      rc.presentation?.setVehiclePaint(
        'rc-0',
        '#' + new THREE.Color().setHSL(Math.random(), 0.7, 0.45).getHexString(),
      )
      modelStatus.textContent = `R/C listo · 1:${rcScale.value}`
      room.setMessage(
        kind === 'f14'
          ? 'F14: seta izq. gas/timón · derecha cabeceo/alabeo · B alas lento/rápido · agarre para lanzar'
          : 'R/C: seta izq. gas/giro · derecha freno · agarre para coger',
      )
      return
    }
    if (modelSelectionChanged || !model.root) {
      const source =
        modelSource.value === 'default'
          ? DEFAULT_MODEL_MANIFEST
          : modelSource.value === 'file'
            ? modelFile.files?.[0]
            : modelUrl.value.trim()
      if (!source) throw new Error('Elige un archivo o una URL en el menú antes de entrar en AR.')
      modelStatus.textContent = 'Cargando maqueta…'
      room.setMessage('Cargando maqueta…')
      await model.load(source)
      model.place(camera)
      if (modelSource.value === 'default') await model.loadNeighborhood()
      modelSelectionChanged = false
    }
    model.place(camera)
    modelStatus.textContent = `Maqueta · ${model.visibleQuarterCount}/4 cuartos visibles · ${model.loadedCellCount}${modelSource.value === 'default' ? '/4' : ''} celdas · escala 1:${model.scaleDenominator}`
    room.setMessage(modelStatus.textContent)
  } catch (error) {
    modelStatus.textContent = String(error)
    room.setMessage(String(error))
  } finally {
    modelLoading = false
    modelLoad.disabled = false
  }
}
modelLoad.onclick = () => {
  void loadModel()
}
const addModel = () => {
  modelSource.value = 'default'
  modelSelectionChanged = true
  void loadModel()
}
const addVehicle = (kind: 's3' | 'vfr' | 'truck' | 'bmw' | 'f14' | 'forklift') => {
  droneGeneration++
  drone.clear()
  modelSource.value = kind
  modelSelectionChanged = true
  void loadModel()
}
const balls = new ARBalls(scene)
let rc: ARRC
const rcScale = document.querySelector<HTMLSelectElement>('#rc-scale')!
const toggleControl = () => {
  rc.controls.enabled = !rc.controls.enabled
  rc.controls.place(camera)
  room.setMessage(
    rc.controls.enabled
      ? 'Agarra el volante: gatillo derecho gas, izquierdo freno. Moto: gira el puño.'
      : 'Conducción con setas.',
  )
  return rc.controls.enabled
}
const updateScaleOptions = (kind: string) => {
  const authored = kind === 'bmw' ? [presetVehicle('bmw', 'rc-0')] : undefined
  for (const option of rcScale.options) {
    option.disabled = !rc.scaleAllowed(kind, Number(option.value), authored)
    option.hidden = option.disabled
  }
  if (rcScale.selectedOptions[0]?.disabled)
    rcScale.value = [...rcScale.options].find((option) => !option.disabled)!.value
}
const nextScale = () => {
  for (let i = 0; i < rcScale.options.length; i++) {
    rcScale.selectedIndex = (rcScale.selectedIndex + 1) % rcScale.options.length
    if (
      rc.scaleAllowed(
        selectedVehicle().kind,
        Number(rcScale.value),
        selectedVehicle().kind === 'bmw' ? [presetVehicle('bmw', 'rc-0')] : undefined,
      )
    )
      break
  }
  room.setMessage('Escala para el próximo vehículo que añadas.')
  return '1:' + rcScale.value
}
void balls.ready.catch(report)
const bow = new XRBow(scene, () => balls.physicsWorld)
let bowGeneration = 0
let bowLoading = false
let bowReady: Promise<void> | undefined
const hoop = new XRHoop(scene)
balls.afterPhysicsStep = () => hoop.sampleBalls(balls.ballSamples)
const drone = new ARDrone(scene, () => balls.physicsWorld)
drone.lightButtonIndex = 5
balls.beforePhysicsStep = (dt) => {
  drone.beforeStep(dt)
  rc.beforeRoomStep(dt)
}
let droneGeneration = 0
const addBall = () => balls.spawn(camera)
let ballPressed = false
let placed = false
const menuGesture = new XRMenuGesture()
const xr = new GameAR(
  renderer,
  camera,
  scene,
  (active) => {
    hostSessionChanged?.(active)
    panel.hidden = active
    enter.disabled = active
    bow.cancel()
    drone.setArmed(false)
    room.reset()
    balls.reset()
    rc.update(0, [], [])
    rc.setAudioActive(active)
    ballPressed = false
    placed = false
    menuGesture.reset()
    if (!active) weapons.suspend(performance.now())
  },
  report,
)
rc = new ARRC(scene, xr.calibration, {
  simulation: { ignition: false, vehicleDamage: false },
  roomWorld: () => balls.physicsWorld,
})
const weapons = new XRARWeapons(scene, camera, xr, document.body, 0)
void weapons.ready.catch(report)
weapons.physicsWorld = () => balls.physicsWorld
weapons.onHit = (object, point, direction) => {
  if (xr.calibrationScreen?.hit(object, point)) return true
  const vehicle = rc.hit(object, point, direction)
  if (vehicle) return vehicle
  balls.hit(object, point, direction)
  return false
}
xr.enableExitButton()
xr.enableCalibrationScreen()
const screen = xr.calibrationScreen!
try {
  const savedScale = Number(localStorage.getItem('nabla.ar.map-scale'))
  if ([100, 500, 1000].includes(savedScale)) model.setScale(savedScale)
} catch {
  /* Preferences are optional. */
}
type CollisionMode = 'auto' | 'mesh' | 'planes' | 'map'
let collisionMode: CollisionMode = 'auto'
try {
  const saved = localStorage.getItem('nabla.ar.collisions')
  if (['auto', 'mesh', 'planes', 'map'].includes(saved ?? ''))
    collisionMode = saved as CollisionMode
} catch {}
const collisionLabels = {
  auto: 'Auto: habitación + mapa',
  mesh: 'Malla habitación',
  planes: 'Planos habitación',
  map: 'Solo mapa',
}
const applyCollisionMode = () => room.setSource(collisionMode === 'map' ? 'auto' : collisionMode)
applyCollisionMode()
const collisionSurfaces = () => [
  ...(collisionMode === 'map' ? [] : room.targets),
  ...(['auto', 'map'].includes(collisionMode) ? model.collisionSurfaces : []),
]
const collisionRay = new THREE.Raycaster()
const commonOptions = screen.optionsMenu
const environmentOptions = () => [
  ...(commonOptions?.() ?? []),
  {
    label: `Colisiones: ${collisionLabels[collisionMode]}`,
    run: () => {
      const modes: CollisionMode[] = ['auto', 'mesh', 'planes', 'map']
      collisionMode = modes[(modes.indexOf(collisionMode) + 1) % modes.length]
      applyCollisionMode()
      try {
        localStorage.setItem('nabla.ar.collisions', collisionMode)
      } catch {}
    },
  },
]
screen.optionsMenu = () => [
  {
    label: `Escala mapa: 1:${model.scaleDenominator} ›`,
    run: () => {
      const scales = [100, 500, 1000]
      const scale = scales[(scales.indexOf(model.scaleDenominator) + 1) % scales.length]
      model.setScale(scale)
      try {
        localStorage.setItem('nabla.ar.map-scale', String(scale))
      } catch {}
      room.setMessage(`Mapa · escala 1:${scale}`)
    },
  },
]
screen.mainStatus = () => {
  const { mesh, planes, active } = room.surfaceCounts
  return `${room.menuStatus} · Mallas frías ${mesh} · Planos cálidos ${planes} · Activos ${active}${hoop.root.visible ? ` · Encestes ${hoop.score}` : ''}${drone.flight ? ` · Dron ${drone.armed ? 'ARMADO' : 'desarmado'} · ${drone.mode} · ${drone.flight.snapshot.alt.toFixed(1)} m` : ''}`
}
const roomAction = (button: number) => {
  const session = renderer.xr.getSession()
  if (button === 3) addBall()
  else if (button === 4) addModel()
  else if (button >= 5 && button <= 7) addVehicle((['vfr', 's3', 'truck'] as const)[button - 5])
  else if (button === 8) nextScale()
  else if (button === 9) toggleControl()
  else if (button === 1) room.toggleSurfaces()
  else if (session) room.capture(session)
}
screen.mainMenuOrder = [
  'scan',
  'surfaces',
  'environment',
  'options',
  'development',
  'quality',
  'radio',
  'pistol',
  'ball',
  'model',
  'board',
  'target',
  'betaflight',
  'bow',
  'hoop',
]
const addBow = async () => {
  if (bowLoading) return
  bowLoading = true
  const generation = ++bowGeneration
  try {
    await balls.ready
    bowReady ??= bow.loadModel('/library/weapons/recurve-bow/recurve-bow.glb', bowModel)
    await bowReady
    if (generation !== bowGeneration) return
    bow.spawn(camera)
    room.setMessage('Arco: agarre en empuñadura; con la otra mano agarra la cuerda, tira y suelta.')
  } catch (error) {
    bowReady = undefined
    report(error)
  } finally {
    bowLoading = false
  }
}
screen.mainMenu = () => [
  {
    id: 'pistol',
    label: 'Pistola',
    run: () => {
      const added = weapons.loadout.addPistol()
      room.setMessage(
        added
          ? 'Pistola añadida a la funda. Cógela con agarre.'
          : 'Ya tienes las dos pistolas. Puedes recogerlas o retirarlas en la papelera.',
      )
    },
  },
  {
    id: 'hoop',
    label: 'Canasta',
    run: () => {
      hoop.place(camera)
      room.setMessage('Agarra la base negra para colocar la canasta. Pulsa su botón para fijarla.')
    },
  },
  {
    id: 'bow',
    label: bowLoading ? 'Cargando arco…' : 'Añadir arco',
    run: () => {
      void addBow()
    },
  },
  {
    id: 'betaflight',
    label: 'Helicóptero',
    run: () => screen.navigate('experimental'),
  },
  { id: 'ball', label: 'Añadir balón', run: () => roomAction(3) },
  {
    id: 'model',
    label: 'Mapa',
    run: () => {
      screen.navigate('map')
      if (!model.root) addModel()
    },
  },
  { id: 'scan', label: 'Escanear habitación', run: () => roomAction(0) },
  { id: 'environment', label: 'Entorno', run: () => screen.navigate('environment') },
  {
    id: 'surfaces',
    label: room.surfacesVisible ? 'Ocultar superficies' : 'Ver superficies',
    run: () => roomAction(1),
  },
]
const freeEnvironment = () => {
  hoop.clear()
  bowGeneration++
  bow.clear()
  droneGeneration++
  drone.clear()
  model.dispose()
  rc.clear()
  balls.reset()
  modelSelectionChanged = true
  modelStatus.textContent = 'Objetos retirados. Escaneo y ajustes conservados.'
  room.setMessage(modelStatus.textContent)
}
const sendTrackingReport = async () => {
  xr.session.recordDiagnostic('test-report', { room: room.trackingSnapshot() })
  const body = xr.session.exportDiagnostics()
  try {
    const response = await fetch('/__nabla/xr-diagnostics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (!response.ok) throw new Error('No hay receptor local')
    room.setMessage('Informe de seguimiento enviado. Ya puedes avisar.')
    status.textContent = 'Informe de seguimiento enviado.'
  } catch {
    try {
      await navigator.clipboard.writeText(body)
      room.setMessage('Informe copiado. Pégalo en el chat.')
      status.textContent = 'Informe copiado.'
    } catch {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
      link.download = 'nabla-xr-tracking.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
      status.textContent = 'Informe descargado.'
    }
  }
}
const reportButton = document.createElement('button')
reportButton.textContent = 'Enviar diagnóstico de seguimiento'
reportButton.addEventListener('click', () => {
  void sendTrackingReport()
})
if (!document.getElementById('headset-launcher')) enter.parentElement!.append(reportButton)
let lastRoomDiagnostic = -Infinity
screen.environmentMenu = () => [
  ...environmentOptions(),
  {
    label: 'Iniciar prueba Meta',
    run: () => {
      xr.session.startDiagnostics()
      room.setMessage('Captura activa. Pulsa Meta, vuelve y envía el informe.')
    },
  },
  {
    label: 'Enviar diagnóstico',
    run: () => {
      void sendTrackingReport()
    },
  },
  {
    id: 'geometry',
    label: `Geometría: ${{ auto: 'Auto', mesh: 'Malla', planes: 'Planos' }[room.source]}`,
    run: () =>
      room.setSource(room.source === 'auto' ? 'mesh' : room.source === 'mesh' ? 'planes' : 'auto'),
  },
  { label: 'Liberar memoria', run: freeEnvironment },
  { label: `Reiniciar encestes (${hoop.score})`, run: () => hoop.resetScore() },
]
const spawnDrone = async () => {
  const generation = ++droneGeneration
  await balls.ready
  if (generation !== droneGeneration) return
  rc.clear()
  if (await drone.spawnModel(camera, '/library/aircraft/littlebird/littlebird.glb'))
    room.setMessage(
      'Helicóptero: arma motores en el monitor. Izq. altura/giro; der. avance/lateral. Y foco · X monitor (mantener 2 s para acercar).',
    )
}
screen.experimentalMenu = () => [
  {
    label: drone.root ? 'Nuevo helicóptero (sustituir)' : 'Añadir helicóptero',
    run: () => {
      void spawnDrone().catch(report)
    },
  },
  {
    label: drone.armed ? 'Desarmar motores' : 'Armar motores',
    run: () => drone.setArmed(!drone.armed),
  },
  {
    label: `Modo: ${drone.mode === 'angle' ? 'Angle · estabilizado' : 'Acro · manual'}`,
    run: () => drone.setMode(drone.mode === 'angle' ? 'acro' : 'angle'),
  },
  {
    label: drone.spotlightEnabled ? 'Foco: Sí · Y' : 'Foco: No · Y',
    run: () => drone.toggleSpotlight(),
  },
  { label: 'Recuperar aquí (desarma)', run: () => drone.reset(camera) },
  {
    label: 'Retirar helicóptero',
    run: () => {
      droneGeneration++
      drone.clear()
    },
  },
]
let mapMoving = false
const navigateMap = (x: number, y: number) => {
  if (mapMoving || modelLoading) return
  mapMoving = true
  void model
    .navigateCell(x, y)
    .catch(report)
    .finally(() => {
      mapMoving = false
    })
}
screen.mapMenu = () => {
  const cells = model.mapCells
  if (!cells)
    return [
      {
        label: modelLoading ? 'Cargando Zaisa…' : 'Cargar Zaisa',
        run: () => {
          if (!modelLoading) addModel()
        },
      },
    ]
  const [x, y] = cells.current.split('/').map(Number)
  return [
    {
      label: `Actual: ${cells.current}`,
      run: () => room.setMessage(`Celda actual: ${cells.current}`),
    },
    { label: 'Norte ↑', run: () => navigateMap(x, y - 1) },
    { label: 'Zaisa', run: () => navigateMap(16223, 11998) },
    { label: 'Oeste ←', run: () => navigateMap(x - 1, y) },
    { label: 'Sur ↓', run: () => navigateMap(x, y + 1) },
    { label: 'Este →', run: () => navigateMap(x + 1, y) },
    ...cells.loaded.map((key) => ({
      label: `${key === cells.current ? '✓ ' : ''}Cargada: ${key}`,
      run: () => {
        const [cx, cy] = key.split('/').map(Number)
        navigateMap(cx, cy)
      },
    })),
    ...cells.pending.slice(0, 2).map((key) => ({ label: `Cargando: ${key}`, run: () => {} })),
  ]
}
const radioVehicles: {
  kind: 's3' | 'vfr' | 'truck' | 'bmw' | 'f14' | 'forklift'
  label: string
}[] = [
  { kind: 's3', label: 'S3 bestia' },
  { kind: 'vfr', label: 'Moto VFR' },
  { kind: 'truck', label: 'Camión + remolque' },
  ...(hasVehiclePreset('bmw') ? [{ kind: 'bmw' as const, label: 'BMW' }] : []),
  { kind: 'f14', label: 'F14 Tomcat' },
  { kind: 'forklift', label: 'Toro · tres palancas' },
]
let radioVehicleIndex = 0
const selectedVehicle = () => radioVehicles[radioVehicleIndex]
const selectRadioVehicle = (direction: number) => {
  radioVehicleIndex = (radioVehicleIndex + direction + radioVehicles.length) % radioVehicles.length
  updateScaleOptions(selectedVehicle().kind)
}
screen.radioMenu = () => [
  { label: '‹ Anterior', run: () => selectRadioVehicle(-1) },
  {
    label: `Añadir ${selectedVehicle().label}`,
    preview: `/library/previews/${selectedVehicle().kind}.png`,
    run: () => addVehicle(selectedVehicle().kind),
  },
  { label: 'Siguiente ›', run: () => selectRadioVehicle(1) },
  {
    label: 'Palé suelto',
    run: () =>
      room.setMessage(
        rc.addPallet(false)
          ? 'Palé añadido · agárralo para colocarlo'
          : 'Añade primero un vehículo',
      ),
  },
  {
    label: 'Palé + caja de 1 m',
    run: () =>
      room.setMessage(rc.addPallet(true) ? 'Palé con caja añadido' : 'Añade primero un vehículo'),
  },
  ...(rc.kind === 'f14'
    ? [
        {
          label: `Vuelo: ${rc.simulation?.vehicleInfo('rc-0').flightSpeedMode === 'fast' ? 'Rápido · alas recogidas' : 'Lento · alas abiertas'}`,
          run: () => rc.toggleFlightSpeed(),
        },
      ]
    : [
        {
          label: rc.controls.enabled ? 'Control real: Sí' : 'Control real: No',
          run: toggleControl,
        },
      ]),
  { label: 'Escala R/C 1:' + rcScale.value, run: nextScale },
]
weapons.disposalTest = screen.disposal.accepts
balls.disposalTest = screen.disposal.accepts
rc.disposalTest = screen.disposal.accepts
drone.disposalTest = screen.disposal.accepts
hoop.disposalTest = screen.disposal.accepts
bow.disposalTest = screen.disposal.accepts
bow.onHit = (point) => {
  const local = screen.face.worldToLocal(point.clone())
  if (Math.abs(local.z) < 0.06) screen.hit(screen.face, point)
}
const arQualityKeys = ['scale', 'foveation', 'effects', 'impactLimit', 'sparks'] as const
const arQualityLabels = [
  'Escala resolución AR',
  'Reducir detalle periférico',
  'Humo',
  'Impactos visibles',
  'Chispas',
]
xr.calibrationScreen!.qualityMenu = {
  rows: () =>
    arQualityKeys.map((key, i) => ({
      label: arQualityLabels[i],
      value:
        typeof xr.quality[key] === 'boolean'
          ? xr.quality[key]
            ? 'Sí'
            : 'No'
          : key === 'impactLimit'
            ? String(xr.quality[key])
            : Math.round(Number(xr.quality[key]) * 100) + '%',
    })),
  change: (row, direction) => {
    const key = arQualityKeys[row]
    if (!key) return
    if (key === 'effects' || key === 'sparks') xr.setQuality({ [key]: !xr.quality[key] })
    else {
      const step = key === 'impactLimit' ? 12 : 0.1
      const min = key === 'scale' ? 0.5 : 0
      const max = key === 'scale' ? 1.5 : key === 'impactLimit' ? 96 : 1
      xr.setQuality({ [key]: Math.max(min, Math.min(max, xr.quality[key] + direction * step)) })
    }
  },
  road: () =>
    xr.setQuality({ scale: 0.8, foveation: 0.5, effects: false, sparks: false, impactLimit: 24 }),
  apply: () => {
    void renderer.xr.getSession()?.end().catch(report)
  },
  status: () => 'Resolución: salir y volver a entrar en AR · Resto: en directo',
}
xr.calibrationScreen!.root.scale.setScalar(0.65)
void xr.setHandModel('/library/hands/fps-hand-rigged.glb').catch(report)
xr.reservedInput = (source) =>
  xr.grabHands.some(
    (h) =>
      h.source === source &&
      (hoop.owns(h.grip) ||
        bow.owns(h.grip) ||
        balls.owns(h.grip) ||
        rc.owns(h.grip) ||
        (weapons.loadout.occupied(h) && !weapons.tip(source))),
  )
const resize = () => {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()
const origin = new THREE.Vector3()
let previousTime = 0
const bufferSize = new THREE.Vector2()
renderer.setAnimationLoop((time, frame) => {
  if (hostSessionChanged && !xr.active) return
  if (frame && xr.active) {
    xr.update(frame)
    const space = xr.referenceSpace
    if (!placed && xr.visible) {
      model.place(camera)
      screen.navigate('main')
      screen.show(true)
      placed = true
    }
    if (space) room.update(frame, space, xr.visible)
    if (xr.session.diagnosticsEnabled && time - lastRoomDiagnostic >= 1000) {
      lastRoomDiagnostic = time
      xr.session.recordDiagnostic('room-sample', {
        room: room.trackingSnapshot(),
        visible: xr.visible,
        camera: camera.matrixWorld.toArray(),
        monitor: screen.root.matrixWorld.toArray(),
      })
    }
    rc.setAudioActive(xr.visible)
    weapons.setAudioActive(xr.visible)
    if (!xr.visible) {
      bow.cancel()
      drone.setArmed(false)
      previousTime = 0
      menuGesture.reset()
      return // Keep placements, grips and physics frozen until room tracking returns.
    }
    const hands = xr.visible ? xr.grabHands : []
    const leftPad = hands.find((h) => h.source?.handedness === 'left')?.source?.gamepad
    if (!rc.kind && !drone.flight)
      model.stick(
        leftPad?.axes[2] ?? leftPad?.axes[0] ?? 0,
        leftPad?.axes[3] ?? leftPad?.axes[1] ?? 0,
      )
    const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0
    previousTime = time
    hoop.update(
      hands.filter(
        (h) =>
          hoop.owns(h.grip) ||
          (!bow.owns(h.grip) &&
            !weapons.loadout.occupied(h) &&
            !balls.owns(h.grip) &&
            !rc.owns(h.grip) &&
            !xr.calibrationOwns(h.source)),
      ),
      dt,
    )
    bow.interact(
      hands.filter(
        (h) =>
          bow.owns(h.grip) ||
          (!hoop.owns(h.grip) &&
            !weapons.loadout.occupied(h) &&
            !balls.owns(h.grip) &&
            !rc.owns(h.grip) &&
            !xr.calibrationOwns(h.source)),
      ),
      dt,
    )
    balls.grab(
      hands.filter(
        (h) =>
          balls.owns(h.grip) ||
          (!hoop.owns(h.grip) &&
            !bow.owns(h.grip) &&
            !rc.owns(h.grip) &&
            !weapons.loadout.occupied(h) &&
            !xr.calibrationOwns(h.source)),
      ),
      dt,
    )
    rc.update(
      dt,
      hands.filter(
        (h) =>
          rc.owns(h.grip) ||
          (!hoop.owns(h.grip) &&
            !bow.owns(h.grip) &&
            !weapons.loadout.occupied(h) &&
            !balls.owns(h.grip) &&
            !xr.calibrationOwns(h.source)),
      ),
      [...collisionSurfaces(), ...screen.collisionSurfaces, ...hoop.collisionSurfaces],
    )
    if (xr.visible) {
      drone.readInput(
        hands.map((h) => h.source).filter((source): source is XRInputSource => !!source),
        dt,
        screen.isOpen ||
          hands.some(
            (h) =>
              bow.owns(h.grip) ||
              weapons.loadout.occupied(h) ||
              balls.owns(h.grip) ||
              rc.owns(h.grip),
          ),
      )
      balls.update(dt, [
        ...collisionSurfaces(),
        ...screen.collisionSurfaces,
        ...hoop.collisionSurfaces,
      ])
      bow.sync(dt)
      drone.sync(dt)
      rc.sync()
      model.update(dt)
      const vehicle = rc.presentation?.objects.get('rc-0')
      if (vehicle) model.follow(vehicle.getWorldPosition(new THREE.Vector3()))
    }
    const spawnPressed = hands.some(
      (h) => h.source?.handedness === 'right' && h.source.gamepad?.buttons[4]?.pressed,
    )
    if (spawnPressed && !ballPressed) balls.spawn(camera)
    ballPressed = spawnPressed
    xr.calibrationScreen!.sync(camera, origin, xr.visible, time)
    xr.interactCalibration(xr.visible, (source) => weapons.tip(source))
    weapons.update(
      hands.filter(
        (h) => !hoop.owns(h.grip) && !bow.owns(h.grip) && !balls.owns(h.grip) && !rc.owns(h.grip),
      ),
      time,
      dt,
      renderer.getDrawingBufferSize(bufferSize).y,
      [
        ...screen.targets,
        ...collisionSurfaces(),
        ...hoop.collisionSurfaces,
        ...balls.targets,
        ...rc.targets,
      ],
      (from, distance) => {
        const surfaces = [...collisionSurfaces(), ...hoop.collisionSurfaces]
        collisionRay.set(from, new THREE.Vector3(0, -1, 0))
        collisionRay.far = distance
        const hit = collisionRay.intersectObjects(surfaces, false)[0]
        return (
          hit?.point ??
          (surfaces.length === 0 && from.y >= 0 && from.y <= distance
            ? new THREE.Vector3(from.x, 0, from.z)
            : null)
        )
      },
    )
    const pressed = hands.some(
      (h) => h.source?.handedness === 'left' && h.source.gamepad?.buttons[4]?.pressed,
    )
    const menuAction = menuGesture.update(pressed, time)
    if (menuAction === 'recall') {
      screen.navigate('main')
      screen.show(true)
    } else if (menuAction === 'toggle') {
      if (screen.isOpen) screen.hide()
      else screen.openMain()
    }
  }
  renderer.render(scene, camera)
})
enter.onclick = () => {
  rc.unlockAudio()
  weapons.unlock()
  enter.disabled = true
  status.textContent = 'Solicitando realidad mixta…'
  void xr
    .enterAR(navigator.xr!)
    .then(async () => {
      if (renderer.xr.getSession()?.environmentBlendMode === 'opaque') {
        await xr.exit()
        throw new Error(
          'El navegador ha devuelto una sesión opaca; esta prueba necesita passthrough.',
        )
      }
      status.textContent = 'Realidad mixta lista. Puedes volver a entrar.'
    })
    .catch(report)
    .finally(() => {
      enter.disabled = xr.active
    })
}
void (async () => {
  if (!isSecureContext || !navigator.xr) {
    status.textContent = 'Abre esta página por HTTPS en el navegador de Quest.'
    return
  }
  const supported = await navigator.xr.isSessionSupported('immersive-ar')
  enter.disabled = !supported
  status.textContent = supported
    ? 'Compatible. Pulsa Entrar y acepta la sesión.'
    : 'Este navegador no ofrece realidad mixta WebXR.'
})().catch(report)
addEventListener(
  'pagehide',
  () => {
    renderer.setAnimationLoop(null)
    hoop.dispose()
    bowGeneration++
    bow.dispose()
    droneGeneration++
    drone.clear()
    model.dispose()
    rc.clear()
    weapons.dispose()
    balls.dispose()
    room.dispose()
    xr.dispose()
    renderer.dispose()
  },
  { once: true },
)
