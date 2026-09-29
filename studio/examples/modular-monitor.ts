/** Independent host using the same public monitor/menu modules as vehicle adapters. */
import { Scene, PerspectiveCamera, WebGLRenderer } from 'three'
import { LayeredMonitor, type MonitorDefinition } from '@nabla/engine/monitors'
import { MonitorMenu } from '@nabla/engine/menus'
const definition: MonitorDefinition = {
  width: 400,
  height: 240,
  layers: [
    { id: 'background', kind: 'panel', x: 0, y: 0, width: 400, height: 240, color: '#172637' },
    {
      id: 'title',
      kind: 'text',
      x: 20,
      y: 20,
      width: 360,
      height: 40,
      columns: 18,
      binding: 'title',
    },
    {
      id: 'reading',
      kind: 'text',
      x: 20,
      y: 85,
      width: 360,
      height: 50,
      columns: 16,
      binding: 'reading',
    },
    {
      id: 'fill',
      kind: 'bar',
      x: 20,
      y: 155,
      width: 360,
      height: 16,
      binding: 'pressure',
      color: '#48d6a2',
    },
    {
      id: 'menu',
      kind: 'text',
      x: 20,
      y: 195,
      width: 360,
      height: 24,
      columns: 22,
      binding: 'menu',
    },
  ],
}
const monitor = new LayeredMonitor(definition)
const menu = new MonitorMenu([
  { id: 'live', label: 'LIVE', action: { type: 'telemetry.live', value: 'yes' } },
  { id: 'hold', label: 'HOLD', action: { type: 'telemetry.live', value: 'no' } },
])
menu.open = true
const scene = new Scene()
scene.add(monitor.root)
const camera = new PerspectiveCamera(45, 2, 0.1, 2000)
camera.position.z = 430
const renderer = new WebGLRenderer({ antialias: true })
renderer.setSize(800, 400)
document.body.append(renderer.domElement)
let live = true,
  reading = 23,
  previous = 0,
  frame = 0,
  stopped = false
const keys = (event: KeyboardEvent) => {
  const result = menu.key(event.code)
  if (result.handled) event.preventDefault()
  if (result.action) live = result.action.value === 'yes'
}
window.addEventListener('keydown', keys)
await monitor.ready
function tick(now: number) {
  if (stopped) return
  if (now - previous >= 100) {
    previous = now
    if (live) reading = 23 + Math.sin(now / 2000) * 3
    monitor.update(
      {
        values: {
          title: 'WALL / TELEMETRY',
          reading: `TEMP ${reading.toFixed(1)} C`,
          menu: menu.items[menu.selected]?.label ?? '',
        },
        bars: { pressure: (reading - 20) / 6 },
      },
      now,
    )
    renderer.render(scene, camera)
    renderer.domElement.dataset.monitor = 'ready'
    renderer.domElement.dataset.mode = live ? 'live' : 'hold'
  }
  frame = requestAnimationFrame(tick)
}
frame = requestAnimationFrame(tick)
window.addEventListener(
  'pagehide',
  () => {
    stopped = true
    cancelAnimationFrame(frame)
    window.removeEventListener('keydown', keys)
    monitor.dispose()
    renderer.dispose()
  },
  { once: true },
)
