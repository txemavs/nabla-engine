import { OrthographicCamera, Scene, WebGLRenderer } from 'three'
import { LayeredMonitor } from '@nabla/engine/monitors'
import { MonitorMenu } from '@nabla/engine/menus'
import { s3Instruments } from '@nabla/engine/monitors/presets'

// The identical recipe is injected into the S3's CarInstruments by the public SceneView.
const cluster = new LayeredMonitor(s3Instruments.cluster)
const menuDisplay = new LayeredMonitor(s3Instruments.menu)
const menu = new MonitorMenu(s3Instruments.menuItems, s3Instruments.menuTitle)
menu.open = true
const properties = { mirrorTilt: -2, color: '#8b9098', mapFollow: true }
const scene = new Scene()
cluster.root.position.x = -330
menuDisplay.root.position.x = 330
scene.add(cluster.root, menuDisplay.root)
const camera = new OrthographicCamera(-660, 660, 240, -240, 0.1, 10)
camera.position.z = 2
const renderer = new WebGLRenderer({ antialias: true })
renderer.setSize(1100, 400)
document.body.append(renderer.domElement)
const speed = document.querySelector<HTMLInputElement>('#speed')!
const rpm = document.querySelector<HTMLInputElement>('#rpm')!
const status = document.querySelector<HTMLElement>('#status')!
const keys = (event: KeyboardEvent) => {
  // Sliders retain their native keyboard controls while focused.
  if (event.target instanceof HTMLInputElement) return
  if (!menu.open) menu.open = true
  const result = menu.key(event.code)
  if (result.handled) event.preventDefault()
  const action = result.action
  if (action?.type === 'vehicle.mirror')
    properties.mirrorTilt = Math.max(-5, Math.min(12, properties.mirrorTilt + Number(action.value)))
  if (action?.type === 'vehicle.paint') properties.color = action.value!
  if (action?.type === 'vehicle.map') properties.mapFollow = action.value !== 'north'
}
window.addEventListener('keydown', keys)
let previous = -Infinity,
  frame = 0,
  stopped = false
const stop = () => {
  stopped = true
  cancelAnimationFrame(frame)
  window.removeEventListener('keydown', keys)
  cluster.dispose()
  menuDisplay.dispose()
  renderer.dispose()
}
window.addEventListener('pagehide', stop, { once: true })
await Promise.all([cluster.ready, menuDisplay.ready])
function tick(now: number) {
  if (stopped) return
  if (now - previous >= 100) {
    previous = now
    cluster.update(
      s3Instruments.clusterData({
        speedKmh: Number(speed.value),
        rpm: Number(rpm.value),
        gear: 3,
        load: 0.5,
        manual: false,
      }),
      now,
    )
    menuDisplay.update(s3Instruments.menuData(menu, properties), now)
    renderer.render(scene, camera)
    renderer.domElement.dataset.monitor = 'ready'
    renderer.domElement.dataset.speed = speed.value
    renderer.domElement.dataset.mirrorTilt = String(properties.mirrorTilt)
    status.textContent = `Espejos: ${properties.mirrorTilt}° · Color: ${properties.color} · Actualización: 100 ms`
  }
  frame = requestAnimationFrame(tick)
}
if (!stopped) frame = requestAnimationFrame(tick)
