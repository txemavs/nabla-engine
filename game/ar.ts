import * as THREE from 'three'
import { ARRC } from './ar-rc.js'
import { ARBalls } from './ar-balls.js'
import { ARModel, DEFAULT_MODEL_MANIFEST } from './ar-model.js'
import { ARRoom } from './ar-room.js'
import { GameAR } from '@nabla/engine/ar'
import { XRARWeapons } from '@nabla/engine/ar/weapons'

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
const model = new ARModel(scene, (url) =>
  import.meta.env.DEV ? url.replace('https://atlas.chained.world', '/atlas-live') : url,
)
model.onStatus = (text) => room.setMessage(text)
const modelSource = document.querySelector<HTMLSelectElement>('#model-source')!
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
    if (['vfr', 's3', 'truck'].includes(modelSource.value)) {
      await balls.ready
      await rc.load(modelSource.value as 'vfr' | 's3' | 'truck', Number(rcScale.value), camera)
      model.dispose()
      modelStatus.textContent = `R/C listo · 1:${rcScale.value}`
      room.setMessage('R/C: seta izq. gas/giro · derecha freno · agarre para coger')
      return
    }
    rc.clear()
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
      modelSelectionChanged = false
    }
    model.place(camera)
    modelStatus.textContent = 'Maqueta lista · escala 1:100'
    room.setMessage('Maqueta lista · escala 1:100')
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
const addVehicle = (kind: 's3' | 'vfr' | 'truck') => {
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
const nextScale = () => {
  rcScale.selectedIndex = (rcScale.selectedIndex + 1) % rcScale.options.length
  room.setMessage('Escala para el próximo vehículo que añadas.')
  return '1:' + rcScale.value
}
void balls.ready.catch(report)
const addBall = () => balls.spawn(camera)
let ballPressed = false
let placed = false
let menuPressed = false
const xr = new GameAR(
  renderer,
  camera,
  scene,
  (active) => {
    panel.hidden = active
    enter.disabled = active
    room.reset()
    balls.reset()
    rc.update(0, [], [])
    rc.setAudioActive(active)
    ballPressed = false
    placed = false
    menuPressed = false
    if (!active) weapons.suspend(performance.now())
  },
  report,
)
rc = new ARRC(scene, xr.calibration, { simulation: { ignition: false, vehicleDamage: false } })
const weapons = new XRARWeapons(scene, camera, xr, document.body)
void weapons.ready.catch(report)
weapons.physicsWorld = () => balls.physicsWorld
weapons.onHit = (object, point, direction) => {
  if (xr.calibrationScreen?.hit(object, point)) return true
  balls.hit(object, point, direction)
  return false
}
xr.enableExitButton()
xr.enableCalibrationScreen()
const screen = xr.calibrationScreen!
screen.mainStatus = () => {
  const { mesh, planes, active } = room.surfaceCounts
  return `${room.menuStatus} · Mallas frías ${mesh} · Planos cálidos ${planes} · Activos ${active}`
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
screen.mainMenu = () => [
  { label: 'Añadir balón', run: () => roomAction(3) },
  { label: 'Añadir maqueta', run: () => roomAction(4) },
  { label: 'VFR', run: () => roomAction(5) },
  { label: 'S3', run: () => roomAction(6) },
  { label: 'Camión + remolque', run: () => roomAction(7) },
  {
    label: rc.controls.enabled ? 'Control real: Sí' : 'Control real: No',
    run: () => roomAction(9),
  },
  { label: 'Escala R/C 1:' + rcScale.value, run: () => roomAction(8) },
  { label: 'Escanear habitación', run: () => roomAction(0) },
  {
    label: `Geometría: ${{ auto: 'Auto', mesh: 'Malla', planes: 'Planos' }[room.source]}`,
    run: () =>
      room.setSource(room.source === 'auto' ? 'mesh' : room.source === 'mesh' ? 'planes' : 'auto'),
  },
  {
    label: room.surfacesVisible ? 'Ocultar superficies' : 'Ver superficies',
    run: () => roomAction(1),
  },
]
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
      (balls.owns(h.grip) ||
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
  if (frame && xr.active) {
    xr.update(frame)
    const space = renderer.xr.getReferenceSpace()
    if (!placed) {
      model.place(camera)
      placed = true
    }
    if (space) room.update(frame, space, xr.visible)
    rc.setAudioActive(xr.visible)
    const hands = xr.visible ? xr.grabHands : []
    const leftPad = hands.find((h) => h.source?.handedness === 'left')?.source?.gamepad
    if (!rc.kind)
      model.stick(
        leftPad?.axes[2] ?? leftPad?.axes[0] ?? 0,
        leftPad?.axes[3] ?? leftPad?.axes[1] ?? 0,
      )
    const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0
    previousTime = time
    balls.grab(
      hands.filter(
        (h) =>
          balls.owns(h.grip) ||
          (!rc.owns(h.grip) && !weapons.loadout.occupied(h) && !xr.calibrationOwns(h.source)),
      ),
      dt,
    )
    rc.update(
      dt,
      hands.filter(
        (h) =>
          rc.owns(h.grip) ||
          (!weapons.loadout.occupied(h) && !balls.owns(h.grip) && !xr.calibrationOwns(h.source)),
      ),
      room.targets,
    )
    if (xr.visible) {
      balls.update(dt, room.targets)
      rc.sync()
      model.update(dt)
    }
    const spawnPressed = hands.some(
      (h) => h.source?.handedness === 'right' && h.source.gamepad?.buttons[4]?.pressed,
    )
    if (spawnPressed && !ballPressed) balls.spawn(camera)
    ballPressed = spawnPressed
    xr.calibrationScreen!.sync(camera, origin, xr.visible, time)
    xr.interactCalibration(xr.visible, (source) => weapons.tip(source))
    weapons.update(
      hands.filter((h) => !balls.owns(h.grip) && !rc.owns(h.grip)),
      time,
      dt,
      renderer.getDrawingBufferSize(bufferSize).y,
      [...screen.targets, ...room.targets, ...balls.targets],
      (from, distance) =>
        room.ground(from, distance) ??
        (room.targets.length === 0 && from.y >= 0 && from.y <= distance
          ? new THREE.Vector3(from.x, 0, from.z)
          : null),
    )
    const pressed = hands.some(
      (h) => h.source?.handedness === 'left' && h.source.gamepad?.buttons[4]?.pressed,
    )
    if (pressed && !menuPressed) {
      if (screen.isOpen) screen.hide()
      else screen.openMain()
    }
    menuPressed = pressed
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
