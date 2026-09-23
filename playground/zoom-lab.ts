import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { planMapZooms, readyMapCover, mapTileId, type MapTile } from '../src/map-tiles.js'
import { restoreTileLayers } from './tile-asset.js'
interface Tile extends MapTile {
  id: string
  projectedCenter: [number, number]
  triangles: number
  sourceTriangles: number
  files: Record<string, { path: string; bytes: number; sha256: string }>
}
const base = '/experiments/xyz-flight/'
const el = (id: string) => document.getElementById(id)!
const viewport = el('view'),
  status = el('status')
const renderer = new THREE.WebGLRenderer({ antialias: true })
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
const latitude = 43.32969,
  longitude = -1.819606,
  rad = Math.PI / 180,
  r = 6378137
const scale = Math.cos(latitude * rad),
  originX = r * longitude * rad,
  originZ = -r * Math.asinh(Math.tan(latitude * rad))
const loaded = new Map<string, THREE.Group>(),
  catalog = new Map<string, Tile>(),
  failed = new Map<string, number>(),
  pending = new Set<string>()
const loader = new GLTFLoader()
let initialized = false,
  currentPlan: ReturnType<typeof planMapZooms>,
  lastPlan = 0,
  running = 0,
  visibleSignature = '',
  disposed = false
const position = (height: number) => {
  controls.target.set(0, 0, 0)
  camera.position.set(0, height, height * 0.35)
  controls.update()
  lastPlan = 0
}
position(350)
el('near').onclick = () => position(350)
el('middle').onclick = () => position(1600)
el('far').onclick = () => position(4500)
function dispose(root: THREE.Group) {
  root.removeFromParent()
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry.dispose()
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material])
        material.dispose()
    }
  })
}
async function load(tile: Tile) {
  pending.add(tile.id)
  running++
  const group = new THREE.Group()
  try {
    for (const [name, file] of Object.entries(tile.files)) {
      if (
        !new RegExp(
          `^z/${tile.z}/${tile.x}/${tile.y}/(terrain|buildings-osm)-[a-f0-9]{16}\\.glb$`,
        ).test(file.path)
      )
        throw Error('Ruta GLB inválida')
      const response = await fetch(base + file.path, { signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw Error(`HTTP ${response.status}`)
      const bytes = await response.arrayBuffer()
      if (bytes.byteLength > 48 * 1024 * 1024) throw Error('GLB demasiado grande')
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')
      if (hash !== file.sha256) throw Error('GLB de revisión incorrecta')
      const gltf = await loader.parseAsync(bytes, '')
      gltf.scene.name = name
      restoreTileLayers(gltf.scene)
      group.add(gltf.scene)
    }
    if (disposed) {
      dispose(group)
      return
    }
    group.position.set(
      (tile.projectedCenter[0] - originX) * scale,
      -28.253,
      (tile.projectedCenter[1] - originZ) * scale,
    )
    group.scale.set(scale, 1, scale)
    group.visible = false
    loaded.set(tile.id, group)
    scene.add(group)
  } catch (error) {
    dispose(group)
    failed.set(tile.id, performance.now() + 30000)
    status.textContent = `No se pudo cargar ${tile.id}: ${String(error)}`
  } finally {
    pending.delete(tile.id)
    running--
  }
}
function update() {
  if (!initialized) return
  if (performance.now() - lastPlan > 500) {
    lastPlan = performance.now()
    const x = originX + controls.target.x / scale,
      z = originZ + controls.target.z / scale
    currentPlan = planMapZooms({
      latitude: Math.atan(Math.sinh(-z / r)) / rad,
      longitude: x / r / rad,
      heightAboveGround: Math.max(0, camera.position.y - controls.target.y),
      viewDistance: 10000,
      maxTiles: 96,
    })
  }
  if (!currentPlan) return
  // Absent catalog cells are explicitly empty in this finite pilot, not failed loads.
  const ready = new Set([
    ...loaded.keys(),
    ...currentPlan.requests.filter((t) => !catalog.has(mapTileId(t))).map(mapTileId),
  ])
  const complete = currentPlan.roots.every(
    (root) => readyMapCover({ ...currentPlan, roots: [root] }, ready).length > 0,
  )
  const cover = complete
    ? readyMapCover(currentPlan, ready)
        .map(mapTileId)
        .filter((id) => loaded.has(id))
    : visibleSignature.split(',').filter((id) => loaded.has(id))
  const visible = new Set(cover)
  for (const [id, group] of loaded) {
    group.visible = visible.has(id)
    const buildings = group.getObjectByName('buildings-osm')
    if (buildings) buildings.visible = (el('buildings') as HTMLInputElement).checked
  }
  const wanted = new Set(currentPlan.requests.map(mapTileId))
  for (const [id, group] of loaded)
    if (!wanted.has(id) && !visible.has(id)) {
      dispose(group)
      loaded.delete(id)
    }
  for (const t of currentPlan.requests) {
    if (running >= 2) break
    const id = mapTileId(t),
      tile = catalog.get(id)
    if (tile && !loaded.has(id) && !pending.has(id) && (failed.get(id) ?? 0) < performance.now())
      void load(tile)
  }
  const signature = cover.join(',')
  if (signature !== visibleSignature) {
    visibleSignature = signature
    el('files').replaceChildren()
    for (const id of cover)
      for (const [layer, file] of Object.entries(catalog.get(id)!.files)) {
        const link = document.createElement('a')
        link.href = base + file.path
        link.download = `nabla-earth-${id.replaceAll('/', '-')}-${layer}.glb`
        link.textContent = `${id.replace('WebMercatorQuad/', 'z/')} · ${layer} (${(file.bytes / 1e6).toFixed(2)} MB)`
        const row = document.createElement('div')
        row.append(link)
        el('files').append(row)
      }
  }
  renderer.domElement.dataset.zooms = [...new Set(cover.map((id) => catalog.get(id)!.z))]
    .sort()
    .join(',')
  el('stats').textContent =
    `Zooms visibles: ${renderer.domElement.dataset.zooms || 'cargando'}\nBaldosas: ${cover.length} · solicitudes: ${running}\nTriángulos: ${renderer.info.render.triangles.toLocaleString()} · dibujos: ${renderer.info.render.calls}\nAltura relativa: ${Math.round(camera.position.y)} m`
}
new ResizeObserver(() => {
  const w = viewport.clientWidth,
    h = viewport.clientHeight
  renderer.setSize(w, h)
  camera.aspect = w / Math.max(1, h)
  camera.updateProjectionMatrix()
}).observe(viewport)
renderer.setAnimationLoop(() => {
  controls.update()
  update()
  renderer.render(scene, camera)
})
void fetch(base + 'catalog.json', { cache: 'no-cache' })
  .then(async (response) => {
    if (!response.ok) throw Error(`HTTP ${response.status}`)
    const data = await response.json()
    if (data.format !== 'nabla-xyz-pilot-v1') throw Error('Catálogo no compatible')
    for (const tile of data.tiles as Tile[]) {
      if (mapTileId(tile) !== tile.id) throw Error('ID inválido')
      catalog.set(tile.id, tile)
    }
    initialized = true
    status.textContent = `${catalog.size} GLB de baldosas XYZ disponibles · tres niveles · cobertura parcial de Irún`
  })
  .catch((error) => {
    status.textContent = `Error de catálogo: ${String(error)}`
  })
window.addEventListener('pagehide', () => {
  disposed = true
  renderer.setAnimationLoop(null)
  for (const group of loaded.values()) dispose(group)
  renderer.dispose()
})
