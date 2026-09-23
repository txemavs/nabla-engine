import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PlanetWorld } from './planet-world.js'
import { activatePreparation } from './preparation-access.js'
void activatePreparation()
const element = (id: string) => document.getElementById(id)!
const viewport = element('view'),
  renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
renderer.setClearColor('#a5bccb')
viewport.append(renderer.domElement)
const scene = new THREE.Scene(),
  camera = new THREE.PerspectiveCamera(55, 1, 1, 40000)
scene.add(new THREE.HemisphereLight('#ffffff', '#606557', 2))
const sun = new THREE.DirectionalLight('#fff7e3', 2)
sun.position.set(-1500, 3000, 1000)
scene.add(sun)
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.maxDistance = 22000
controls.maxPolarAngle = Math.PI * 0.49
const world = new PlanetWorld(
  { latitude: 43.32969, longitude: -1.819606, altitude: 0 },
  () => {},
  () => {},
)
world.setDistance(8000)
scene.add(world.root)
let lastPlan = 0,
  lastFiles = '',
  disposed = false
const position = (height: number) => {
  controls.target.set(0, 0, 0)
  camera.position.set(0, height, height * 0.35)
  controls.update()
  lastPlan = 0
}
position(350)
element('near').onclick = () => position(350)
element('middle').onclick = () => position(1800)
element('far').onclick = () => position(4500)
function frame(now: number) {
  if (disposed) return
  controls.update()
  if (now - lastPlan > 500) {
    lastPlan = now
    world.update(camera.position.toArray(), [0, 0, 0])
  }
  world.renderUpdate(new THREE.Vector3(), (element('buildings') as HTMLInputElement).checked, null)
  element('status').textContent = world.status
  const tiles = world.activeTiles,
    signature = tiles.map((t) => t.key).join('|')
  renderer.domElement.dataset.zooms = [...new Set(tiles.map((t) => t.manifest.tile.z))].join(',')
  if (signature !== lastFiles) {
    lastFiles = signature
    element('files').replaceChildren()
    for (const tile of tiles)
      for (const layer of ['terrain', 'buildings-osm'] as const) {
        const link = document.createElement('a')
        link.href = tile.directory + tile.manifest.files[layer].path
        link.download = tile.manifest.files[layer].download
        link.textContent = `${tile.key} · ${layer}`
        link.style.display = 'block'
        element('files').append(link)
      }
  }
  renderer.render(scene, camera)
  element('stats').textContent =
    `${tiles.length} GLB cells · ${renderer.info.render.calls} draw calls · ${Math.round(renderer.info.render.triangles / 1000)}k triangles`
  requestAnimationFrame(frame)
}
new ResizeObserver(() => {
  const w = viewport.clientWidth,
    h = viewport.clientHeight
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}).observe(viewport)
window.addEventListener('pagehide', () => {
  disposed = true
  world.dispose()
  renderer.dispose()
  controls.dispose()
})
requestAnimationFrame(frame)
