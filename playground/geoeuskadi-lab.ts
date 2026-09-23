import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import './geoeuskadi-lab.css'
interface Manifest {
  version: number
  file: string
  bytes: number
  downloadBytes: number
  sha256: string
  featureCount: number
  drawnPolygons: number
  attribution: string
  groups: Record<string, { offset: number; count: number }>
}
const host = document.querySelector<HTMLElement>('#viewport')!
const status = document.querySelector<HTMLElement>('#status')!
const buttons = ['osm', 'official'] as const
async function start() {
  const base = './geography/geoeuskadi-pilot/'
  const response = await fetch(base + 'manifest.json', { cache: 'no-cache' })
  if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`)
  const manifest = (await response.json()) as Manifest
  if (
    manifest.version !== 1 ||
    !/^pilot-[a-f0-9]{16}\.pack$/.test(manifest.file) ||
    manifest.bytes > 64 * 1024 * 1024
  )
    throw new Error('Formato de comparación incompatible')
  const download = await fetch(base + manifest.file)
  if (!download.ok) throw new Error(`Geometry HTTP ${download.status}`)
  const compressed = await download.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', compressed)
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
  if (hash !== manifest.sha256) throw new Error('La geometría no coincide con el manifiesto')
  const raw = await new Response(
    new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),
  ).arrayBuffer()
  if (raw.byteLength !== manifest.bytes) throw new Error('Geometría incompleta')
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
  renderer.setClearColor('#20282e')
  host.append(renderer.domElement)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 10, 5000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.maxDistance = 2600
  controls.minDistance = 20
  controls.maxPolarAngle = Math.PI * 0.48
  scene.add(new THREE.HemisphereLight('#e4efff', '#455240', 2))
  const sun = new THREE.DirectionalLight('#fff1dd', 2)
  sun.position.set(-400, 700, 200)
  scene.add(sun)
  const meshes: Record<string, THREE.Mesh> = {}
  for (const [key, range] of Object.entries(manifest.groups)) {
    if (
      range.offset % 4 ||
      range.count % 3 ||
      range.offset < 0 ||
      range.count < 0 ||
      range.offset + range.count * 36 > raw.byteLength
    )
      throw new Error('Rango de geometría inválido')
    const interleaved = new THREE.InterleavedBuffer(
      new Float32Array(raw, range.offset, range.count * 9),
      9,
    )
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0))
    geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleaved, 3, 3))
    geometry.setAttribute('color', new THREE.InterleavedBufferAttribute(interleaved, 3, 6))
    const material = new THREE.MeshLambertMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      polygonOffset: key === 'osm' || key === 'official',
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })
    meshes[key] = new THREE.Mesh(geometry, material)
    scene.add(meshes[key])
  }
  function render() {
    renderer.render(scene, camera)
    host.dataset.drawCalls = String(renderer.info.render.calls)
    host.dataset.triangles = String(renderer.info.render.triangles)
  }
  function select(mode: (typeof buttons)[number]) {
    meshes.osm.visible = mode === 'osm'
    meshes.official.visible = mode === 'official'
    for (const id of buttons)
      document.getElementById(id)!.setAttribute('aria-pressed', String(id === mode))
    host.dataset.provider = mode
    render()
  }
  for (const id of buttons) document.getElementById(id)!.onclick = () => select(id)
  meshes.buildings.visible = false
  document.querySelector<HTMLInputElement>('#buildings')!.onchange = (event) => {
    meshes.buildings.visible = (event.target as HTMLInputElement).checked
    render()
  }
  const position = (top: boolean) => {
    controls.target.set(-170, 5, -30)
    camera.position.set(-170, top ? 1250 : 650, top ? -29 : 800)
    controls.update()
    render()
  }
  document.getElementById('top')!.onclick = () => position(true)
  document.getElementById('oblique')!.onclick = () => position(false)
  const resize = () => {
    renderer.setSize(host.clientWidth, host.clientHeight)
    camera.aspect = host.clientWidth / host.clientHeight
    camera.updateProjectionMatrix()
    render()
  }
  new ResizeObserver(resize).observe(host)
  controls.addEventListener('change', render)
  position(false)
  select('official')
  document.getElementById('attribution')!.textContent = manifest.attribution
  status.textContent = `${manifest.featureCount} superficies oficiales descargadas · ${manifest.drawnPolygons} polígonos representados · ${(manifest.downloadBytes / 1048576).toFixed(1)} MB`
  host.dataset.ready = 'true'
}
start().catch((error) => {
  status.textContent = `No se pudo cargar la prueba: ${error.message}`
})
