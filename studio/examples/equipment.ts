import * as T from 'three'
import { LayeredMonitor } from '@nabla/engine/monitors'
import { CarLights, RetractableMount, type LampBinding } from '@nabla/engine/vehicle-presentation'

const scene = new T.Scene()
scene.background = new T.Color('#172431')
const renderer = new T.WebGLRenderer({ antialias: true })
renderer.setSize(1000, 520)
document.body.append(renderer.domElement)
const camera = new T.PerspectiveCamera(42, 1000 / 520, 0.1, 30)
camera.position.set(2.5, 2.1, 4.5)
camera.lookAt(0, 0.65, 0)
scene.add(new T.HemisphereLight('#ffffff', '#293947', 3))
const base = new T.Mesh(
  new T.BoxGeometry(2.5, 0.6, 0.65),
  new T.MeshStandardMaterial({ color: '#3f5263' }),
)
base.position.y = 0.3
scene.add(base)
const support = new T.Group()
support.position.set(0, 1.15, 0)
scene.add(support)
const retraction = new RetractableMount(support, [0, -1, 0], 1800)
const screen = new LayeredMonitor({
  width: 400,
  height: 220,
  layers: [
    { id: 'bg', kind: 'panel', x: 0, y: 0, width: 400, height: 220, color: '#081019' },
    {
      id: 'title',
      kind: 'text',
      x: 20,
      y: 20,
      width: 360,
      height: 40,
      columns: 12,
      binding: 'title',
    },
    {
      id: 'value',
      kind: 'text',
      x: 20,
      y: 85,
      width: 360,
      height: 65,
      columns: 3,
      align: 'center',
      font: 'sans',
      binding: 'value',
    },
    {
      id: 'bar',
      kind: 'bar',
      x: 20,
      y: 180,
      width: 360,
      height: 12,
      binding: 'value',
      color: '#ed4256',
    },
  ],
})
screen.root.scale.setScalar(0.005)
support.add(screen.root)
const bindings: LampBinding[] = []
for (const [i, kind] of (['signal', 'brake', 'reverse', 'signal'] as const).entries()) {
  const color = kind === 'signal' ? '#ff9500' : kind === 'brake' ? '#ff2020' : '#ffffff'
  const material = new T.MeshStandardMaterial({
    color: '#15191d',
    emissive: color,
    emissiveIntensity: 0,
  })
  const lamp = new T.Mesh(new T.BoxGeometry(0.3, 0.12, 0.03), material)
  lamp.position.set(-0.9 + i * 0.6, 0.33, 0.345)
  scene.add(lamp)
  bindings.push({ material, kind, side: i === 0 ? -1 : 1 })
}
const lights = new CarLights(bindings)
let braking = false,
  reversing = false,
  frame = 0,
  stopped = false,
  nextUpdate = 0,
  updates = 0
const toggle = () => {
  retraction.toggle(performance.now())
}
const button = document.querySelector<HTMLButtonElement>('#toggle')!
const status = document.querySelector<HTMLElement>('#status')!
button.addEventListener('click', toggle)
const keys = (event: KeyboardEvent) => {
  if (event.repeat) return
  if (event.code === 'KeyH') toggle()
  else if (event.code === 'KeyB') braking = !braking
  else if (event.code === 'KeyR') reversing = !reversing
  else if (event.code === 'ArrowLeft') lights.toggle(-1)
  else if (event.code === 'ArrowRight') lights.toggle(1)
  else return
  event.preventDefault()
}
window.addEventListener('keydown', keys)
const stop = () => {
  stopped = true
  cancelAnimationFrame(frame)
  button.removeEventListener('click', toggle)
  window.removeEventListener('keydown', keys)
  screen.dispose()
  scene.traverse((node) => {
    if (node instanceof T.Mesh) {
      node.geometry.dispose()
      for (const material of Array.isArray(node.material) ? node.material : [node.material])
        material.dispose()
    }
  })
  renderer.dispose()
}
window.addEventListener('pagehide', stop, { once: true })
await screen.ready
function tick(now: number) {
  if (stopped) return
  retraction.update(now)
  lights.update({ powered: true, braking, reversing }, now)
  if (retraction.open && now >= nextUpdate) {
    nextUpdate = now + 100
    const value = Math.round(50 + Math.sin(now / 1600) * 50)
    screen.update({ values: { title: 'NABLA / DEMO', value }, bars: { value: value / 100 } }, now)
    updates++
  }
  renderer.render(scene, camera)
  renderer.domElement.dataset.equipment = 'ready'
  renderer.domElement.dataset.open = String(retraction.open)
  renderer.domElement.dataset.progress = String(retraction.progress)
  renderer.domElement.dataset.updates = String(updates)
  status.textContent = `${retraction.open ? 'Pantalla encendida' : 'Pantalla apagada'} · Freno: ${braking ? 'sí' : 'no'} · Marcha atrás: ${reversing ? 'sí' : 'no'}`
  frame = requestAnimationFrame(tick)
}
if (!stopped) frame = requestAnimationFrame(tick)
