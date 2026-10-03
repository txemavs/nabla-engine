import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import R from '/deps/@dimforge/rapier3d-compat/rapier.es.js'
import { createRig, anchorWorld } from './runtime/rig.mjs'
import { createRigView } from './runtime/view.mjs'

await R.init()
const manifest = await fetch('./white-truck-studio.json').then((response) => response.json())
const scene = new THREE.Scene()
scene.background = new THREE.Color('#b8c6d3')
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.prepend(renderer.domElement)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1000)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
scene.add(new THREE.HemisphereLight(0xffffff, 0x68727c, 2.8))
const sun = new THREE.DirectionalLight(0xfff9ed, 3)
sun.position.set(-14, 24, -12)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, far: 120 })
sun.shadow.bias = -0.0002
sun.shadow.normalBias = 0.04
scene.add(sun)
scene.add(sun.target)
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(1000, 1000),
  new THREE.MeshStandardMaterial({ color: 0x84909a, roughness: 1 }),
)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
scene.add(floor)
scene.add(new THREE.GridHelper(1000, 500, 0x73808b, 0x8c99a4))
const markers = [0x00ddff, 0xff982d].map((color) => {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.12),
    new THREE.MeshBasicMaterial({ color, depthTest: false }),
  )
  marker.renderOrder = 10
  scene.add(marker)
  return marker
})
let world, rig, view
let loading = false
let accumulator = 0
let last = performance.now()
let message = ''
const keys = new Set()
const status = document.querySelector('#status')
const modeElement = document.querySelector('#mode')
async function reset() {
  if (loading) return
  loading = true
  try {
    view?.dispose()
    rig?.dispose()
    world?.free()
    world = new R.World({ x: 0, y: -9.81, z: 0 })
    world.timestep = 1 / 120
    world.numSolverIterations = 12
    world.createCollider(
      R.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0).setFriction(0.8),
    )
    rig = createRig(R, world, manifest, { mode: modeElement.value })
    view = await createRigView(THREE, GLTFLoader, scene, rig, new URL('./', location.href))
    const coupled = !!rig.tractor && !!rig.trailer
    const target = new THREE.Vector3(0, 1.5, coupled ? 4.5 : 0)
    controls.target.copy(target)
    camera.position.copy(target).add(new THREE.Vector3(-16, 9, -18))
    if (!coupled && rig.tractor) camera.position.copy(target).add(new THREE.Vector3(-8, 5, -10))
    controls.update()
    accumulator = 0
    last = performance.now()
    message = ''
    document.querySelector('#cargo').value = String(manifest.trailer.cargoMassKg)
    window.whiteTruckMode = modeElement.value
    window.whiteTruckReady = true
  } catch (error) {
    status.textContent = String(error)
    throw error
  } finally {
    loading = false
  }
}
document.querySelector('#reset').onclick = reset
document.querySelector('#tare').textContent = manifest.trailer.tareMassKg
document.querySelector('#apply-cargo').onclick = () => {
  if (!rig || loading) return
  const input = document.querySelector('#cargo')
  if (!input.reportValidity()) return
  const result = rig.setCargoMass(Number(input.value))
  message = result.ok
    ? 'Carga actualizada.'
    : 'Detén el conjunto y selecciona un modo con remolque.'
}
modeElement.onchange = reset
document.querySelector('#coupling').onclick = () => {
  if (!rig || loading) return
  const result = rig.telemetry().coupled ? rig.detach() : rig.attach()
  const translations = {
    'Both vehicles are required': 'Este modo contiene solo un vehículo.',
    'Align the vehicles first': 'Alinea ambos vehículos.',
    'Stop both vehicles first': 'Detén ambos vehículos.',
    'Stop both vehicles before uncoupling': 'Frena antes de desenganchar.',
    'Coupling anchors are too far apart': 'Acerca los puntos de enganche.',
  }
  message = result.ok ? '' : (translations[result.reason] ?? result.reason)
}
addEventListener('keydown', (event) => {
  if (event.target.matches('input,select,button')) return
  if (['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space'].includes(event.code)) {
    event.preventDefault()
    keys.add(event.code)
  }
})
addEventListener('keyup', (event) => keys.delete(event.code))
addEventListener('blur', () => keys.clear())
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
})
function frame(now) {
  requestAnimationFrame(frame)
  if (loading || !view) return
  const elapsed = Math.min((now - last) / 1000, 0.1)
  last = now
  accumulator += elapsed
  const input = {
    throttle: Number(keys.has('KeyW')) - Number(keys.has('KeyS')),
    steering: Number(keys.has('KeyD')) - Number(keys.has('KeyA')),
    brake: Number(keys.has('Space')),
    lights: document.querySelector('#lights').checked,
    hazards: document.querySelector('#hazards').checked,
  }
  while (accumulator >= 1 / 120) {
    rig.beforeStep(1 / 120, input)
    world.step()
    accumulator -= 1 / 120
  }
  view.update(input, now / 1000)
  const telemetry = rig.telemetry()
  const follow = rig.tractor ?? rig.trailer
  const position = follow.body.translation()
  const target = new THREE.Vector3(
    position.x,
    position.y + 0.5,
    position.z + (rig.tractor && rig.trailer ? 4.5 : 0),
  )
  camera.position.add(target.clone().sub(controls.target))
  controls.target.copy(target)
  sun.position.set(position.x - 14, 24, position.z - 12)
  sun.target.position.copy(target)
  for (const [i, vehicle] of [rig.tractor, rig.trailer].entries()) {
    markers[i].visible = !!vehicle && document.querySelector('#anchors').checked
    if (vehicle) markers[i].position.copy(anchorWorld(vehicle))
  }
  document.querySelector('#coupling').textContent = telemetry.coupled ? 'Desenganchar' : 'Enganchar'
  status.textContent =
    `${(telemetry.speedMps * 3.6).toFixed(1)} km/h · ` +
    `${telemetry.coupled ? 'Enganchado' : 'Separado'} ${message}`
  controls.update()
  renderer.render(scene, camera)
  window.whiteTruckTelemetry = telemetry
}
await reset()
requestAnimationFrame(frame)
