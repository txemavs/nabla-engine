import { beforeEach, expect, it, vi } from 'vitest'
import { LayeredMonitor } from '../../src/render/monitors/layered-monitor.js'
const mock = vi.hoisted(() => ({
  surfaces: [] as {
    ready: Promise<void>
    finish: () => void
    update: ReturnType<typeof vi.fn>
    setSecondary: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }[],
}))
vi.mock('../../src/render/monitors/html-monitor.js', async () => {
  const { Texture } = await import('three')
  return {
    HtmlMonitor: class {
      texture = new Texture()
      update = vi.fn()
      setSecondary = vi.fn()
      dispose = vi.fn()
      finish!: () => void
      ready = new Promise<void>((resolve) => {
        this.finish = resolve
      })
      constructor() {
        mock.surfaces.push(this)
      }
    },
  }
})
const definition = {
  width: 100,
  height: 100,
  layers: [
    { id: 'web', kind: 'html' as const, x: 0, y: 0, width: 100, height: 100, url: '/panel.html' },
  ],
}
beforeEach(() => {
  mock.surfaces.length = 0
})
it('does not construct a late HTML surface after disposal', async () => {
  const monitor = new LayeredMonitor(definition)
  monitor.dispose()
  monitor.dispose()
  await monitor.ready
  expect(mock.surfaces).toHaveLength(0)
  expect(monitor.root.children[0].children[0].visible).toBe(false)
})
it('releases a loading surface once and does not resurrect it', async () => {
  const monitor = new LayeredMonitor(definition)
  await vi.waitFor(() => expect(mock.surfaces).toHaveLength(1))
  const surface = mock.surfaces[0]
  monitor.dispose()
  monitor.dispose()
  surface.finish()
  await monitor.ready
  expect(surface.dispose).toHaveBeenCalledTimes(1)
  expect(surface.update).not.toHaveBeenCalled()
  expect(monitor.root.children[0].children[0].visible).toBe(false)
})
it('retains the latest data snapshot and secondary priority while the backend loads', async () => {
  const monitor = new LayeredMonitor(definition)
  monitor.setSecondary(true)
  monitor.update({ values: { speed: 1 }, bars: {} }, 1)
  const latest = { values: { speed: 20 }, bars: {} }
  monitor.update(latest, 2)
  latest.values.speed = 30
  await vi.waitFor(() => expect(mock.surfaces).toHaveLength(1))
  const surface = mock.surfaces[0]
  surface.finish()
  await monitor.ready
  expect(surface.setSecondary).toHaveBeenLastCalledWith(true)
  expect(surface.update).toHaveBeenCalledExactlyOnceWith({ values: { speed: 20 }, bars: {} }, 2)
  expect(monitor.root.children[0].children[0].visible).toBe(true)
  monitor.root.visible = false
  monitor.update(latest, 3)
  expect(surface.update).toHaveBeenCalledTimes(1)
  monitor.dispose()
})
it('does not rasterize queued data if hidden during preparation', async () => {
  const monitor = new LayeredMonitor(definition)
  monitor.update({ values: { speed: 20 }, bars: {} }, 1)
  monitor.root.visible = false
  await vi.waitFor(() => expect(mock.surfaces).toHaveLength(1))
  mock.surfaces[0].finish()
  await monitor.ready
  expect(mock.surfaces[0].update).not.toHaveBeenCalled()
  monitor.dispose()
})
