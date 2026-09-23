import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { decodePreparedBinary } from '../src/prepared-binary.js'
import { tileAsset, restoreTileLayers, type TileArtifact } from './tile-asset.js'

const element = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T
const viewport = element('view'),
  status = element('status')
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
viewport.append(renderer.domElement)
const scene = new THREE.Scene()
scene.background = new THREE.Color('#94afc0')
scene.add(new THREE.HemisphereLight('#ffffff', '#777766', 2))
const sun = new THREE.DirectionalLight('#fff4df', 2)
sun.position.set(400, 800, 200)
scene.add(sun)
const camera = new THREE.PerspectiveCamera(50, 1, 1, 20000)
const controls = new OrbitControls(camera, renderer.domElement)
let current: THREE.Object3D | undefined
let loading = false
const metrics: Record<string, Record<string, number>> = {}
const manager = new THREE.LoadingManager()
manager.setURLModifier((url) => {
  if (!url.startsWith('blob:') && !url.startsWith('data:'))
    throw Error('Incluye las texturas dentro del GLB para abrirlo aquí')
  return url
})
const loader = new GLTFLoader(manager)
function frame() {
  if (!current) return
  const box = new THREE.Box3().setFromObject(current),
    center = box.getCenter(new THREE.Vector3()),
    size = box.getSize(new THREE.Vector3()).length()
  if (!Number.isFinite(size) || size <= 0) return
  controls.target.copy(center)
  camera.position.copy(center).add(new THREE.Vector3(0.5, 0.65, 0.7).multiplyScalar(size))
  camera.far = Math.max(20000, size * 5)
  camera.updateProjectionMatrix()
  controls.update()
}
function dispose(root: THREE.Object3D) {
  root.removeFromParent()
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose()
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose()
        m.dispose()
      }
    }
  })
}
function layers() {
  const host = element('layers')
  host.replaceChildren()
  for (const child of current?.children ?? []) {
    if (!child.name) continue
    const label = document.createElement('label'),
      input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = true
    input.onchange = () => (child.visible = input.checked)
    label.append(input, document.createTextNode(child.name))
    host.append(label)
  }
}
function table() {
  const body = element('results')
  body.replaceChildren()
  for (const [key, label] of [
    ['bytes', 'Archivo · MB'],
    ['fetchMs', 'Descarga · ms'],
    ['parseMs', 'Lectura y construcción · ms'],
    ['presentMs', 'Primera presentación · ms'],
    ['triangles', 'Triángulos visibles'],
    ['calls', 'Llamadas de dibujo'],
  ]) {
    const row = document.createElement('tr')
    for (const text of [
      label,
      ...['prepared', 'glb'].map((format) => {
        const n = metrics[format]?.[key]
        return n === undefined
          ? '—'
          : (key === 'bytes' ? n / 1e6 : n).toLocaleString('es', { maximumFractionDigits: 1 })
      }),
    ]) {
      const cell = document.createElement('td')
      cell.textContent = text
      row.append(cell)
    }
    body.append(row)
  }
}
async function load(format: 'prepared' | 'glb' | 'ground10' | 'ground1', file?: File) {
  if (loading) return
  loading = true
  for (const id of ['prepared', 'glb', 'ground10', 'ground1', 'edited'])
    (element(id) as HTMLButtonElement | HTMLInputElement).disabled = true
  status.textContent = 'Cargando la baldosa…'
  try {
    const start = performance.now()
    if (file && file.size > 128 * 1024 * 1024) throw Error('El GLB supera 128 MB')
    const bytes = file
      ? await file.arrayBuffer()
      : await fetch(
          `/experiments/tile-glb/irun/${format === 'ground10' ? 'terrain-10cm.glb' : format === 'ground1' ? 'terrain-1m.glb' : format === 'glb' ? 'tile.glb' : 'source.bin'}`,
        ).then((r) => {
          if (!r.ok) throw Error(`Descarga HTTP ${r.status}`)
          return r.arrayBuffer()
        })
    const fetched = performance.now()
    status.textContent = 'Construyendo la vista…'
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const parseStart = performance.now()
    let root: THREE.Object3D =
      format !== 'prepared'
        ? (await loader.parseAsync(bytes, '')).scene
        : tileAsset(decodePreparedBinary(bytes) as unknown as TileArtifact)
    if (root.children.length === 1 && root.children[0].userData.nablaTile) root = root.children[0]
    const parsed = performance.now()
    restoreTileLayers(root)
    if (current) dispose(current)
    current = root
    scene.add(root)
    frame()
    layers()
    await renderer.compileAsync(scene, camera)
    renderer.render(scene, camera)
    const calls = renderer.info.render.calls,
      triangles = renderer.info.render.triangles
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    const result = {
      bytes: bytes.byteLength,
      fetchMs: fetched - start,
      parseMs: parsed - parseStart,
      presentMs: performance.now() - parsed,
      calls,
      triangles,
    }
    if (!file && (format === 'prepared' || format === 'glb')) {
      metrics[format] = result
      table()
    }
    renderer.domElement.dataset.loaded = file ? 'edited' : format
    status.textContent = file
      ? `Copia modificada · ${file.name}`
      : `${format === 'ground10' ? 'Terreno · rejilla 10 cm' : format === 'ground1' ? 'Terreno · rejilla 1 m' : format === 'glb' ? 'GLB' : 'Preparado'} · ${(bytes.byteLength / 1e6).toFixed(2)} MB · ${triangles.toLocaleString()} triángulos · ${Math.round(parsed - parseStart)} ms lectura`
  } catch (error) {
    status.textContent = String(error)
  } finally {
    loading = false
    for (const id of ['prepared', 'glb', 'ground10', 'ground1', 'edited'])
      (element(id) as HTMLButtonElement | HTMLInputElement).disabled = false
  }
}
element('prepared').onclick = () => void load('prepared')
element('glb').onclick = () => void load('glb')
element('ground10').onclick = () => void load('ground10')
element('ground1').onclick = () => void load('ground1')
element('frame').onclick = frame
element<HTMLInputElement>('edited').onchange = () => {
  const file = element<HTMLInputElement>('edited').files?.[0]
  if (file) void load('glb', file)
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
  renderer.render(scene, camera)
})
table()
void load('glb')

void fetch('/experiments/tile-glb/irun/manifest.json', { cache: 'no-cache' })
  .then((r) => (r.ok ? r.json() : undefined))
  .then((manifest) => {
    for (const layer of ['terrain', 'buildings-osm']) {
      const filename = manifest?.downloads?.[layer]
      if (typeof filename === 'string' && /^nabla-earth-[a-zA-Z0-9.-]+\.glb$/.test(filename))
        (element('download-' + layer) as HTMLAnchorElement).download = filename
    }
  })
  .catch(() => {})
