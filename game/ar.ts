import { mobileWeaponUI } from './ar-mobile-weapon.js'
import { arMode } from './ar-mode.js'
import { touchActionIcon } from '../src/runtime/touch-icons.js'
import { mountXRDeviceInfo } from './xr-device-info.js'
import { XRMenuGesture, ARTouchControls } from '@nabla/engine/ar'
import { XRHoop } from '@nabla/engine/xr/hoop'
import { XRBow } from '@nabla/engine/xr/bow'
import bowModel from './recurve-bow-model.js'
import { ARHeldWeapons } from './ar-held-weapons.js'
import { weaponPresets, weaponSlots, type WeaponPreset } from '@nabla/engine'
import { ARDrone } from '@nabla/engine/experimental/betaflight'
import { hasVehiclePreset, presetVehicle } from '@nabla/engine/vehicles'
import * as THREE from 'three'
import { ARRC } from './ar-rc.js'
import { ARBalls } from './ar-balls.js'
import { ARModel, DEFAULT_MODEL_MANIFEST } from './ar-model.js'
import { ARRoom } from './ar-room.js'
import { GameAR } from '@nabla/engine/ar'
import { XRARWeapons } from '@nabla/engine/ar/weapons'
import { t } from '@nabla/engine/i18n'

// Optional embedding in the HeadSet launcher. Standalone ar.html keeps its preview.
let hostSessionChanged: ((active: boolean) => void) | undefined
export function configureARHost(changed: (active: boolean) => void): void {
  hostSessionChanged = changed
}

const mobileAR = arMode() === 'mobile'
const canvas = document.querySelector<HTMLCanvasElement>('#viewport')!
const enter = document.querySelector<HTMLButtonElement>('#enter')!
const panel = document.querySelector<HTMLElement>('#panel')!
const status = document.querySelector<HTMLElement>('#status')!
const deviceInfo = mountXRDeviceInfo(document.getElementById('ar-panel') ?? panel)
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
          ? t('ar.f14-left-stick-throttle-rudder-right-pitch-roll')
          : t('ar.r-c-left-stick-throttle-turn-right-brake-grip-to'),
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
      if (!source) throw new Error(t('ar.choose-a-file-or-a-url-in-the-menu-before-enteri'))
      modelStatus.textContent = t('ar.loading-model')
      room.setMessage(t('ar.loading-model'))
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
      ? t('ar.grab-the-wheel-right-trigger-throttle-left-brake')
      : t('ar.driving-with-thumbsticks'),
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
  room.setMessage(t('ar.scale-for-the-next-vehicle-you-add'))
  return '1:' + rcScale.value
}
void balls.ready.catch(report)
const bow = new XRBow(scene, () => balls.physicsWorld)
let bowGeneration = 0
let bowLoading = false
let bowReady: Promise<void> | undefined
const hoop = new XRHoop(scene)
const held = new ARHeldWeapons(scene)
const heldPresets = ARHeldWeapons.presets()
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
    if (!active) touchControls.update(null, null, true)
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
let touchActionObject: unknown
let touchActionRevision = 0
const touchControls = new ARTouchControls({
  menu: () => {
    if (screen.isOpen) screen.hide()
    else {
      screen.openMain()
      screen.show(true)
    }
  },
  arm: () => drone.setArmed(!drone.armed),
  engage: () => {
    rc.unlockAudio()
    weapons.unlock()
  },
})
xr.domOverlayRoot = mobileAR ? touchControls.root : undefined
xr.screenTouchEnabled = false
// Slotted firearms after the default pistol (for example Euskadi's MP5) ride in the same loadout.
const extraFirearms = weaponSlots()
  .filter((slot) => slot.kind === 'firearm' && slot.id !== weaponPresets()[0]?.id)
  .map((slot) => slot.preset as WeaponPreset)
const weapons = new XRARWeapons(scene, camera, xr, document.body, 0, extraFirearms)
void weapons.ready.catch(report)
if (mobileAR) {
  touchControls.root.querySelector<HTMLButtonElement>(':scope > button')!.hidden = true
  mobileWeaponUI(touchControls.root, {
    equip: () => {
      void weapons.enableMobile().catch(report)
    },
    reload: () => weapons.reloadMobile(performance.now()),
    fire: (down) => {
      weapons.unlock()
      weapons.mobileTrigger = down
    },
    move: (x, y) => {
      weapons.mobilePosition.x = THREE.MathUtils.clamp(weapons.mobilePosition.x + x, -0.35, 0.35)
      weapons.mobilePosition.y = THREE.MathUtils.clamp(weapons.mobilePosition.y + y, -0.35, 0.2)
    },
  })
}

weapons.physicsWorld = () => balls.physicsWorld
held.onStrike = (origin, direction, distance) =>
  weapons.strike(
    origin,
    direction,
    distance,
    [
      ...screen.targets,
      ...collisionSurfaces(),
      ...hoop.collisionSurfaces,
      ...balls.targets,
      ...rc.targets,
    ],
    performance.now(),
  )
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
  auto: t('ar.auto-room-map'),
  mesh: t('ar.room-mesh'),
  planes: t('ar.room-planes'),
  map: t('ar.map-only'),
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
  ...extraFirearms.map((preset) => `firearm-${preset.id}`),
  ...heldPresets.map((preset) => `held-${preset.id}`),
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
    room.setMessage(t('ar.bow-grip-the-handle-with-the-other-hand-grab-the'))
  } catch (error) {
    bowReady = undefined
    report(error)
  } finally {
    bowLoading = false
  }
}
screen.mainMenu = () => [
  ...extraFirearms.map((preset) => ({
    id: `firearm-${preset.id}`,
    label: preset.name,
    run: () => {
      const added = weapons.loadout.addPistol(preset.id)
      room.setMessage(
        added
          ? `${preset.name} añadida al cuerpo. Cógela con agarre; gatillo para disparar.`
          : `Ya tienes la ${preset.name}.`,
      )
    },
  })),
  ...heldPresets.map((preset) => ({
    id: `held-${preset.id}`,
    label: preset.name,
    run: () => {
      void held
        .spawn(preset, camera)
        .then(() =>
          room.setMessage(`${preset.name}: agárrala con el agarre cerca de la empuñadura.`),
        )
        .catch(report)
    },
  })),
  {
    id: 'pistol',
    label: 'Pistola',
    run: () => {
      const added = weapons.loadout.addPistol()
      room.setMessage(
        added
          ? t('ar.pistol-added-to-the-holster-take-it-with-grip')
          : t('ar.you-already-have-both-pistols-pick-them-up-or-dr'),
      )
    },
  },
  {
    id: 'hoop',
    label: 'Canasta',
    run: () => {
      hoop.place(camera)
      room.setMessage(t('ar.grab-the-black-base-to-place-the-hoop-press-its'))
    },
  },
  {
    id: 'bow',
    label: bowLoading ? t('ar.loading-bow') : t('ar.add-bow'),
    run: () => {
      void addBow()
    },
  },
  {
    id: 'betaflight',
    label: 'Helicóptero',
    run: () => screen.navigate('experimental'),
  },
  { id: 'ball', label: t('ar.add-ball'), run: () => roomAction(3) },
  {
    id: 'model',
    label: 'Mapa',
    run: () => {
      screen.navigate('map')
      if (!model.root) addModel()
    },
  },
  { id: 'scan', label: t('ar.scan-room'), run: () => roomAction(0) },
  { id: 'environment', label: 'Entorno', run: () => screen.navigate('environment') },
  {
    id: 'surfaces',
    label: room.surfacesVisible ? t('ar.hide-surfaces') : t('ar.show-surfaces'),
    run: () => roomAction(1),
  },
]
const freeEnvironment = () => {
  hoop.clear()
  held.clear()
  bowGeneration++
  bow.clear()
  droneGeneration++
  drone.clear()
  model.dispose()
  rc.clear()
  balls.reset()
  modelSelectionChanged = true
  modelStatus.textContent = t('ar.objects-removed-scan-and-settings-kept')
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
    if (!response.ok) throw new Error(t('ar.no-local-receiver'))
    room.setMessage(t('ar.tracking-report-sent-you-can-tell-us-now'))
    status.textContent = t('ar.tracking-report-sent')
  } catch {
    try {
      await navigator.clipboard.writeText(body)
      room.setMessage(t('ar.report-copied-paste-it-in-the-chat'))
      status.textContent = t('ar.report-copied')
    } catch {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }))
      link.download = 'nabla-xr-tracking.json'
      link.click()
      setTimeout(() => URL.revokeObjectURL(link.href), 1000)
      status.textContent = t('ar.report-downloaded')
    }
  }
}
const reportButton = document.createElement('button')
reportButton.textContent = t('ar.send-tracking-diagnostics')
reportButton.addEventListener('click', () => {
  void sendTrackingReport()
})
if (!document.getElementById('headset-launcher')) enter.parentElement!.append(reportButton)
let lastRoomDiagnostic = -Infinity
screen.environmentMenu = () => [
  {
    label: t('ar.device-and-controls'),
    run: () => room.setMessage(deviceInfo.lines().join(' · ')),
  },
  ...environmentOptions(),
  {
    label: t('ar.start-meta-test'),
    run: () => {
      xr.session.startDiagnostics()
      room.setMessage(t('ar.capture-on-press-meta-come-back-and-send-the-rep'))
    },
  },
  {
    label: t('ar.send-diagnostics'),
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
  { label: t('ar.free-memory'), run: freeEnvironment },
  { label: `Reiniciar encestes (${hoop.score})`, run: () => hoop.resetScore() },
]
const spawnDrone = async () => {
  const generation = ++droneGeneration
  await balls.ready
  if (generation !== droneGeneration) return
  rc.clear()
  if (await drone.spawnModel(camera, '/library/aircraft/littlebird/littlebird.glb'))
    room.setMessage(t('ar.helicopter-arm-motors-on-the-monitor-left-height'))
}
screen.experimentalMenu = () => [
  {
    label: drone.root ? t('ar.new-helicopter-replace') : t('ar.add-helicopter'),
    run: () => {
      void spawnDrone().catch(report)
    },
  },
  {
    label: drone.armed ? t('ar.disarm-motors') : t('ar.arm-motors'),
    run: () => drone.setArmed(!drone.armed),
  },
  {
    label: `Modo: ${drone.mode === 'angle' ? t('ar.angle-stabilised') : t('ar.acro-manual')}`,
    run: () => drone.setMode(drone.mode === 'angle' ? 'acro' : 'angle'),
  },
  {
    label: drone.spotlightEnabled ? t('ar.torch-yes-y') : t('ar.torch-no-y'),
    run: () => drone.toggleSpotlight(),
  },
  { label: t('ar.recover-here-disarms'), run: () => drone.reset(camera) },
  {
    label: t('ar.remove-helicopter'),
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
        label: modelLoading ? t('ar.loading-zaisa') : t('ar.load-zaisa'),
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
    { label: t('ar.north'), run: () => navigateMap(x, y - 1) },
    { label: 'Zaisa', run: () => navigateMap(16223, 11998) },
    { label: t('ar.west'), run: () => navigateMap(x - 1, y) },
    { label: t('ar.south'), run: () => navigateMap(x, y + 1) },
    { label: t('ar.east-to'), run: () => navigateMap(x + 1, y) },
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
  { kind: 'vfr', label: t('ar.vfr-motorbike') },
  { kind: 'truck', label: t('ar.truck-trailer') },
  ...(hasVehiclePreset('bmw') ? [{ kind: 'bmw' as const, label: 'BMW' }] : []),
  { kind: 'f14', label: 'F14 Tomcat' },
  { kind: 'forklift', label: t('ar.bull-three-levers') },
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
  { label: t('ar.next'), run: () => selectRadioVehicle(1) },
  {
    label: t('ar.loose-pallet'),
    run: () =>
      room.setMessage(
        rc.addPallet(false)
          ? t('ar.pallet-added-grab-it-to-place-it')
          : t('ar.add-a-vehicle-first'),
      ),
  },
  {
    label: t('ar.pallet-1-m-box'),
    run: () =>
      room.setMessage(
        rc.addPallet(true) ? t('ar.pallet-with-box-added') : t('ar.add-a-vehicle-first'),
      ),
  },
  ...(rc.kind === 'f14'
    ? [
        {
          label: `Vuelo: ${rc.simulation?.vehicleInfo('rc-0').flightSpeedMode === 'fast' ? t('ar.fast-wings-swept') : t('ar.slow-wings-out')}`,
          run: () => rc.toggleFlightSpeed(),
        },
      ]
    : [
        {
          label: rc.controls.enabled ? t('ar.real-control-yes') : t('ar.real-control-no'),
          run: toggleControl,
        },
      ]),
  { label: t('ar.r-c-scale-1') + rcScale.value, run: nextScale },
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
  t('ar.ar-resolution-scale'),
  t('ar.reduce-peripheral-detail'),
  'Humo',
  t('ar.visible-impacts'),
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
  status: () => t('ar.resolution-leave-and-re-enter-ar-rest-live'),
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
    deviceInfo.updateFrame(frame, time)
    const space = xr.referenceSpace
    if (!placed && xr.visible) {
      model.place(camera)
      screen.navigate('main')
      if (!mobileAR) screen.show(true)
      else screen.hide()
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
    touchControls.update(
      mobileAR ? renderer.xr.getSession() : null,
      drone.flight || rc.kind === 'f14' ? 'flight' : rc.kind ? 'road' : null,
      screen.isOpen || !xr.visible,
    )
    const actionObject = drone.flight ?? rc.presentation
    if (actionObject !== touchActionObject) {
      touchActionObject = actionObject
      touchControls.setActions(
        String(++touchActionRevision),
        drone.flight
          ? [
              {
                id: 'arm',
                label: t('ar.arm-disarm-motors'),
                icon: touchActionIcon('play'),
                run: () => drone.setArmed(!drone.armed),
              },
            ]
          : rc.touchActions(),
      )
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
            !held.owns(h.grip) &&
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
            !held.owns(h.grip) &&
            !xr.calibrationOwns(h.source)),
      ),
      dt,
    )
    held.update(
      hands.filter(
        (h) =>
          held.owns(h.grip) ||
          (!hoop.owns(h.grip) &&
            !bow.owns(h.grip) &&
            !balls.owns(h.grip) &&
            !rc.owns(h.grip) &&
            !weapons.loadout.occupied(h) &&
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
            !held.owns(h.grip) &&
            !xr.calibrationOwns(h.source)),
      ),
      dt,
    )
    rc.driveInput = touchControls.available
      ? rc.kind === 'f14'
        ? touchControls.flight.input()
        : touchControls.driving.input()
      : null
    rc.update(
      dt,
      hands.filter(
        (h) =>
          rc.owns(h.grip) ||
          (!hoop.owns(h.grip) &&
            !bow.owns(h.grip) &&
            !weapons.loadout.occupied(h) &&
            !balls.owns(h.grip) &&
            !held.owns(h.grip) &&
            !xr.calibrationOwns(h.source)),
      ),
      [...collisionSurfaces(), ...screen.collisionSurfaces, ...hoop.collisionSurfaces],
    )
    if (touchControls.available) rc.controls.root.visible = false
    if (xr.visible) {
      if (touchControls.available) {
        if (screen.isOpen) drone.setArmed(false)
        drone.readTouchInput(touchControls.flight.input(), dt)
      } else
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
    if (mobileAR) screen.hide()
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
    if (mobileAR)
      weapons.updateMobile(time, [
        ...collisionSurfaces(),
        ...hoop.collisionSurfaces,
        ...balls.targets,
        ...rc.targets,
      ])
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
  status.textContent = t('ar.requesting-mixed-reality')
  void xr
    .enterAR(navigator.xr!)
    .then(async () => {
      deviceInfo.setSession(renderer.xr.getSession())
      touchControls.update(mobileAR ? renderer.xr.getSession() : null, null, true)
      if (touchControls.mobile && !touchControls.available)
        room.setMessage(t('ar.this-browser-did-not-grant-dom-overlay-touch-con'))
      if (renderer.xr.getSession()?.environmentBlendMode === 'opaque') {
        await xr.exit()
        throw new Error(t('ar.the-browser-returned-an-opaque-session-this-test'))
      }
      status.textContent = t('ar.mixed-reality-ready-you-can-enter-again')
    })
    .catch(report)
    .finally(() => {
      enter.disabled = xr.active
    })
}
void (async () => {
  if (!isSecureContext || !navigator.xr) {
    status.textContent = t('ar.open-this-page-over-https-in-the-quest-browser')
    return
  }
  const supported = await navigator.xr.isSessionSupported('immersive-ar')
  enter.disabled = !supported
  status.textContent = supported
    ? t('ar.supported-press-enter-and-accept-the-session')
    : t('ar.this-browser-does-not-offer-webxr-mixed-reality')
})().catch(report)
addEventListener(
  'pagehide',
  () => {
    touchControls.dispose()
    renderer.setAnimationLoop(null)
    hoop.dispose()
    bowGeneration++
    bow.dispose()
    held.clear()
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
