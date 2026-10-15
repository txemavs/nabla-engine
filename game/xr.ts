import * as THREE from 'three'
import { SceneView } from '@nabla/engine'
import { presetVehicle, vehiclePreset } from '@nabla/engine/vehicles'
import { createFlatTestScene } from '@nabla/engine/examples/flat-tile'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { QuestSession } from './xr-session.js'
import { QuestInteraction } from './xr-interaction.js'

const canvas = document.querySelector<HTMLCanvasElement>('#viewport')!
const enter = document.querySelector<HTMLButtonElement>('#enter')!
const exit = document.querySelector<HTMLButtonElement>('#exit')!
const center = document.querySelector<HTMLButtonElement>('#center')!
const status = document.querySelector<HTMLElement>('#status')!
const metrics = document.querySelector<HTMLOutputElement>('#metrics')!

async function start(): Promise<void> {
  // A finite local scene needs no planetary depth buffer or auxiliary render passes.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.xr.enabled = true
  renderer.xr.setReferenceSpaceType('local-floor')
  renderer.xr.setFramebufferScaleFactor(0.8)
  renderer.xr.setFoveation(1)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#93b7cd')
  const room = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(room, 0.04)
  scene.environment = environment.texture
  scene.environmentIntensity = 0.7
  room.dispose()
  pmrem.dispose()
  scene.add(new THREE.HemisphereLight(0xe9f5ff, 0x65615a, 2.5))
  const sun = new THREE.DirectionalLight(0xfff2df, 3)
  sun.position.set(6, 10, 4)
  scene.add(sun)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: '#697570', roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  scene.add(ground)
  const grid = new THREE.GridHelper(40, 40, '#d4ded5', '#82918a')
  grid.position.y = 0.005
  scene.add(grid)

  const vehicle = presetVehicle('a3', 'quest-car', [0, vehiclePreset('a3').clearance, -4])
  const sceneDocument = createFlatTestScene(vehicle)
  sceneDocument.entities.find((entity) => entity.id === vehicle.id)!.transform.position = [
    ...vehicle.transform.position,
  ]
  const view = new SceneView(sceneDocument, false, false, {
    carInstruments: null,
    vehiclePresentation: () => undefined,
  })
  scene.add(view.root)
  view.objects.get('spawn')!.visible = false
  const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 80)
  const rig = new THREE.Group()
  rig.add(camera)
  scene.add(rig)
  const controls = new OrbitControls(camera, canvas)
  const desktop = (): void => {
    rig.position.set(0, 0, 0)
    rig.quaternion.identity()
    camera.position.set(4, 2.5, 4)
    camera.quaternion.identity()
    controls.target.set(0, 0.8, -4)
    controls.update()
  }
  desktop()

  const blocks = [-3, 0, 3].map((x, i) => {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 2 + i * 0.4, 1.5),
      new THREE.MeshStandardMaterial({ color: ['#699fb5', '#c19663', '#8caa77'][i] }),
    )
    block.position.set(x, 1 + i * 0.2, -9)
    block.name = `Bloque de prueba ${i + 1}`
    scene.add(block)
    return block
  })
  const targets = [
    { root: view.objects.get(vehicle.id)!, label: 'A3' },
    ...blocks.map((root) => ({ root, label: root.name })),
  ]

  // World-space diagnostics remain visible in VR; DOM UI does not.
  const boardCanvas = document.createElement('canvas')
  boardCanvas.width = 1024
  boardCanvas.height = 420
  const context = boardCanvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(boardCanvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(3.6, 1.4765625),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  )
  board.position.set(0, 3.3, -6)
  scene.add(board)
  const report = (error: unknown): void => {
    status.textContent = `No se pudo completar la operación: ${error instanceof Error ? error.message : String(error)}`
  }
  let previous: number | undefined
  let lastReport = 0
  let gaps: number[] = []
  let cpu: number[] = []
  const resetMetrics = (): void => {
    previous = undefined
    gaps = []
    cpu = []
    lastReport = 0
  }
  const session = new QuestSession(
    renderer.xr,
    (active) => {
      controls.enabled = !active
      enter.disabled = active
      exit.disabled = !active
      center.disabled = !active
      if (active) {
        rig.position.set(0, 0, 0)
        camera.position.set(0, 0, 0)
        camera.quaternion.identity()
      } else {
        desktop()
        resize()
      }
      interaction.setActive(active)
      resetMetrics()
      status.textContent = active
        ? 'VR activa. Izquierda: seleccionar. Derecha: disparar. Laterales: recentrar / recargar.'
        : 'Vista normal. Puedes volver a entrar en VR.'
    },
    report,
  )
  const resize = (): void => {
    if (renderer.xr.isPresenting) return
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize()
  const interaction = new QuestInteraction(
    renderer,
    scene,
    rig,
    targets,
    [ground],
    session.recenter,
  )
  const drawBoard = (text: string): void => {
    context.fillStyle = '#10202c'
    context.fillRect(0, 0, 1024, 420)
    context.fillStyle = '#eef4f8'
    context.font = 'bold 46px sans-serif'
    context.fillText('Nabla · Quest 3 · Apuntar + HK', 35, 65)
    context.font = '30px sans-serif'
    context.fillText(text, 35, 125)
    context.fillText('Gatillos: izquierda selecciona · derecha dispara', 35, 190)
    context.fillText('Laterales: izquierda recentra · derecha recarga', 35, 250)
    context.fillText(interaction.summary, 35, 310)
    context.fillText('Menú Meta: salir · Cuadrícula: 1 m', 35, 370)
    texture.needsUpdate = true
  }
  drawBoard('Esperando medición…')
  renderer.setAnimationLoop((time, frame) => {
    const started = performance.now()
    if (frame) {
      session.update(frame)
      interaction.update(performance.now())
    }
    if (previous !== undefined && time > previous && time - previous < 250)
      gaps.push(time - previous)
    previous = time
    renderer.render(scene, camera)
    cpu.push(performance.now() - started)
    if (time - lastReport >= 1000 && gaps.length) {
      const sorted = [...gaps].sort((a, b) => a - b)
      const mean = gaps.reduce((sum, value) => sum + value, 0) / gaps.length
      const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
      const cpuMean = cpu.reduce((sum, value) => sum + value, 0) / cpu.length
      const text = `${(1000 / mean).toFixed(0)} callbacks/s · p95 ${p95.toFixed(1)} ms · CPU ${cpuMean.toFixed(1)} ms`
      metrics.textContent = `${session.active ? 'VR' : 'Pantalla'} · ${text} · ${renderer.info.render.calls} draw calls`
      drawBoard(text)
      lastReport = time
      gaps = []
      cpu = []
    }
  })
  enter.onclick = () => {
    enter.disabled = true
    status.textContent = 'Solicitando permiso para VR…'
    void session
      .enter(navigator.xr!)
      .catch(report)
      .finally(() => {
        enter.disabled = session.active
      })
  }
  exit.onclick = () => {
    void session.exit().catch(report)
  }
  center.onclick = session.recenter

  let disposed = false
  const cleanup = (): void => {
    if (disposed) return
    disposed = true
    interaction.dispose()
    for (const block of blocks) {
      block.geometry.dispose()
      block.material.dispose()
    }
    renderer.setAnimationLoop(null)
    void session
      .dispose()
      .catch(report)
      .finally(() => renderer.dispose())
    window.removeEventListener('resize', resize)
    controls.dispose()
    view.dispose()
    ground.geometry.dispose()
    ground.material.dispose()
    grid.geometry.dispose()
    const materials = Array.isArray(grid.material) ? grid.material : [grid.material]
    materials.forEach((material) => material.dispose())
    board.geometry.dispose()
    board.material.dispose()
    texture.dispose()
    environment.dispose()
  }
  window.addEventListener('pagehide', cleanup, { once: true })
  import.meta.hot?.dispose(cleanup)
  await Promise.all([view.ready, interaction.ready])
  if (disposed) return
  if (!isSecureContext) {
    status.textContent =
      'Abre esta página por HTTPS de confianza en el Quest. HTTP por IP local no habilita VR.'
  } else if (!navigator.xr || !(await navigator.xr.isSessionSupported('immersive-vr'))) {
    status.textContent =
      'Coche listo. Este navegador no ofrece VR inmersiva; abre la misma dirección en Quest Browser.'
  } else {
    enter.disabled = false
    status.textContent = 'Coche listo. Ponte el casco y pulsa Entrar en VR.'
  }
}

void start().catch((error: unknown) => {
  enter.disabled = true
  status.textContent = `No se pudo iniciar la demo: ${error instanceof Error ? error.message : String(error)}`
})
