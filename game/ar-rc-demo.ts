import * as THREE from 'three'
import { GameAR, ARRoom, ARVehicles } from '@nabla/engine/ar'

// Application composition only: no weapons, balls, map, calibration screen or main menu.
const query = new URLSearchParams(location.search)
const kind =
  query.get('vehicle') === 's3' ? 's3' : query.get('vehicle') === 'truck' ? 'truck' : 'vfr'
const denominator = Number(query.get('scale') ?? 100)
const scale =
  Number.isFinite(denominator) && denominator >= 1 && denominator <= 1000 ? denominator : 100
const button = document.querySelector<HTMLButtonElement>('#enter')!
const panel = document.querySelector<HTMLElement>('#panel')!
const status = document.querySelector<HTMLElement>('#status')!
const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector<HTMLCanvasElement>('#viewport')!,
  alpha: true,
  antialias: true,
})
renderer.setClearColor(0, 0)
const scene = new THREE.Scene()
scene.add(new THREE.HemisphereLight(0xffffff, 0x647b84, 2))
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(1, 3, 2)
scene.add(sun)
const camera = new THREE.PerspectiveCamera(65, 1, 0.02, 30)
scene.add(camera)
const room = new ARRoom(scene)
const report = (error: unknown) => {
  status.textContent = String(error)
}
let needsLoad = false
let loading = false
const xr = new GameAR(
  renderer,
  camera,
  scene,
  (active) => {
    panel.hidden = active
    button.disabled = active
    room.reset()
    needsLoad = active
    vehicle.setAudioActive(active)
    if (!active) vehicle.clear()
  },
  report,
)
const vehicle = new ARVehicles(scene, xr.calibration, {
  // Explicit demo rules, also usable by the PC/VR hosts of this scene.
  simulation: { ignition: false, vehicleDamage: false },
})
xr.enableExitButton()
let previous = 0
renderer.setAnimationLoop((time, frame) => {
  const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 0
  previous = time
  if (frame && xr.active) {
    xr.update(frame)
    xr.interactCalibration(xr.visible, () => null)
    const space = xr.referenceSpace
    if (space) room.update(frame, space, xr.visible)
    vehicle.setAudioActive(xr.visible)
    vehicle.update(dt, xr.visible ? xr.grabHands : [], room.targets)
    if (needsLoad && !loading && xr.visible && space && frame.getViewerPose(space)) {
      needsLoad = false
      loading = true
      void vehicle
        .load(kind, scale, camera)
        .then(() => {
          vehicle.controls.enabled = true
          vehicle.controls.place(camera)
        })
        .catch(async (error) => {
          report(error)
          await xr.exit()
        })
        .finally(() => {
          loading = false
        })
    }
  }
  renderer.render(scene, camera)
})
const resize = () => {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()
button.onclick = () => {
  vehicle.unlockAudio()
  button.disabled = true
  void xr
    .enterAR(navigator.xr!)
    .catch(report)
    .finally(() => {
      button.disabled = xr.active
    })
}
void (async () => {
  const supported =
    isSecureContext && !!navigator.xr && (await navigator.xr.isSessionSupported('immersive-ar'))
  button.disabled = !supported
  status.textContent = supported
    ? `${kind.toUpperCase()} · escala 1:${scale}`
    : 'Abre por HTTPS en un visor compatible.'
})().catch(report)
addEventListener(
  'pagehide',
  () => {
    renderer.setAnimationLoop(null)
    vehicle.dispose()
    room.dispose()
    xr.dispose()
    renderer.dispose()
  },
  { once: true },
)
